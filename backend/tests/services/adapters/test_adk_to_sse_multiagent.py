import asyncio
import json
from types import SimpleNamespace
from datetime import datetime, timezone

from app.services.adapters.adk_to_sse import ADKToSSETranslator, agent_message_id


def _event(*, author, text=None, partial=False, turn_complete=False):
    content = None
    if text is not None:
        content = SimpleNamespace(parts=[SimpleNamespace(text=text, thought=False)])
    return SimpleNamespace(
        invocation_id="e-inv-1",
        author=author,
        content=content,
        actions=SimpleNamespace(),
        partial=partial,
        turn_complete=turn_complete,
        timestamp=datetime.now(timezone.utc).timestamp(),
    )


async def _gen(events):
    for e in events:
        yield e


def _collect(events, **kwargs):
    translator = ADKToSSETranslator(**kwargs)

    async def run():
        out = []
        async for sse in translator.translate(_gen(events), conversation_id="conv-1"):
            etype = sse.split("\n", 1)[0].replace("event: ", "")
            data = json.loads(sse.split("data: ", 1)[1])
            out.append((etype, data))
        return out

    return asyncio.run(run())


def test_workflow_splits_agents_under_one_invocation():
    """An ADK Workflow runs every agent under ONE invocation_id. The translator
    must split them into one message per author (not collapse into one)."""
    events = [
        _event(author="agent_a", text="hello from A", partial=True),
        _event(author="agent_b", text="hello from B", partial=True),
        _event(author="agent_c", text="hello from C", partial=True, turn_complete=True),
    ]
    out = _collect(events)

    starts = [d for t, d in out if t == "message_start"]
    # One message_start per distinct author.
    assert len(starts) == 3
    assert {s["sender"]["name"] for s in starts} == {"agent_a", "agent_b", "agent_c"}

    # Each author maps to a distinct, deterministic message id.
    ids = {s["sender"]["name"]: s["message_id"] for s in starts}
    assert ids["agent_a"] == agent_message_id("e-inv-1", "agent_a")
    assert ids["agent_b"] == agent_message_id("e-inv-1", "agent_b")
    assert len(set(ids.values())) == 3

    # Tokens land on the right message id.
    tokens = {d["message_id"]: d["delta"] for t, d in out if t == "token"}
    assert tokens[ids["agent_a"]] == "hello from A"
    assert tokens[ids["agent_b"]] == "hello from B"
    assert tokens[ids["agent_c"]] == "hello from C"


def test_interleaved_tokens_do_not_truncate_each_agent():
    """Parallel DAG nodes interleave their events on one connection. Tokens
    must route to each agent's own message by (invocation, author) and keep
    accumulating — a later author's event must NOT prematurely close an earlier
    agent's message (which previously truncated content to its first chunk)."""
    events = [
        _event(author="agent_a", text="A1", partial=True),
        _event(author="agent_b", text="B1", partial=True),
        _event(author="agent_a", text="A2", partial=True),  # back to A after B
        _event(author="agent_b", text="B2", partial=True),
    ]
    out = _collect(events)

    a_id = agent_message_id("e-inv-1", "agent_a")
    b_id = agent_message_id("e-inv-1", "agent_b")

    # No message_end is emitted mid-stream for either agent (the loop's
    # end-of-stream fallback would emit them, but _collect drives a finite
    # generator; here we assert NO premature close interleaved with tokens).
    seq = [(t, d["message_id"]) for t, d in out]
    a_end = seq.index(("message_end", a_id)) if ("message_end", a_id) in seq else len(seq)
    # agent_a's BOTH tokens must arrive before any agent_a message_end.
    a_token_idxs = [i for i, (t, mid) in enumerate(seq) if t == "token" and mid == a_id]
    assert len(a_token_idxs) == 2  # A1 and A2 both routed to agent_a
    assert max(a_token_idxs) < a_end  # neither A token lost to an early close

    b_token_idxs = [i for i, (t, mid) in enumerate(seq) if t == "token" and mid == b_id]
    assert len(b_token_idxs) == 2  # B1 and B2 both routed to agent_b


def test_author_switch_does_not_close_previous_message_midstream():
    """Switching author must NOT force-close the previous agent — that broke
    parallel streaming (each agent kept only its first chunk)."""
    events = [
        _event(author="agent_a", text="A1", partial=True),
        _event(author="agent_b", text="B1", partial=True),
    ]
    out = _collect(events)
    a_id = agent_message_id("e-inv-1", "agent_a")
    b_id = agent_message_id("e-inv-1", "agent_b")
    # b's start must NOT be preceded by an a message_end (no mid-stream close).
    seq = [(t, d.get("message_id")) for t, d in out]
    b_start_idx = seq.index(("message_start", b_id))
    assert ("message_end", a_id) not in seq[:b_start_idx]


def test_name_map_resolves_real_agent_name():
    """agent_name_map maps the internal node name to the real agent identity."""
    node = "agent_440a945c"
    events = [_event(author=node, text="hi", partial=True, turn_complete=True)]
    out = _collect(events, agent_name_map={node: {"id": "real-id", "name": "4.8"}})

    starts = [d for t, d in out if t == "message_start"]
    assert len(starts) == 1
    assert starts[0]["sender"]["name"] == "4.8"
    assert starts[0]["sender"]["id"] == "real-id"


def test_dag_skips_workflow_own_author():
    """In DAG mode the workflow emits events under its own name (e.g.
    'orchestrator_plan'), which is NOT an agent and must be skipped so it
    doesn't create a spurious message or fragment the per-agent stream."""
    node_a = "agent_aaa"
    node_b = "agent_bbb"
    events = [
        _event(author=node_a, text="A", partial=True),
        _event(author="orchestrator_plan", text="(workflow noise)", partial=True),
        _event(author=node_b, text="B", partial=True),
    ]
    name_map = {
        node_a: {"id": "id-a", "name": "4.8"},
        node_b: {"id": "id-b", "name": "5.4"},
    }
    out = _collect(events, agent_name_map=name_map)

    starts = [d for t, d in out if t == "message_start"]
    names = {s["sender"]["name"] for s in starts}
    # Only the two real agents produce messages; workflow author is skipped.
    assert names == {"4.8", "5.4"}
    # The workflow's noise text never appears as a token.
    tokens = [d["delta"] for t, d in out if t == "token"]
    assert "(workflow noise)" not in tokens

