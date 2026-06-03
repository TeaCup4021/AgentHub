"""Artifact output format specification injected into agent system prompts."""

ARTIFACT_FORMAT_SPEC = """
CRITICAL OUTPUT RULES — You MUST follow these exactly:

1. Code you write → wrap in:
<artifact type="code" language="python" file="name.ext" title="description">
<![CDATA[your code here]]>
</artifact>

2. Diffs/changes → wrap in:
<artifact type="diff" title="what changed">
<![CDATA[
--- before
old code
+++ after
new code
]]>
</artifact>

3. Web pages / HTML → wrap in:
<artifact type="preview" title="page name">
<![CDATA[<!DOCTYPE html>...full HTML...]]>
</artifact>

4. Files with download URL → use:
<artifact type="file" url="DOWNLOAD_URL" name="filename.ext" size="BYTES" type="mime/type" />

DO NOT describe artifacts in plain text. ALWAYS use <artifact> tags.
"""


def build_instruction(agent):
    """Prepend artifact format spec to system prompt for maximum priority."""
    base = agent.system_prompt or "You are a helpful assistant."
    return ARTIFACT_FORMAT_SPEC + "\n\n" + base


_ARTIFACT_REMINDER = "\n\n[SYSTEM] Wrap any code, diffs, files, or HTML pages you create in <artifact type=\"...\"> XML tags. Use CDATA sections for code/HTML bodies. [/SYSTEM]"


def inject_artifact_reminder(prompt: str) -> str:
    """Append a short artifact-tag reminder to every agent prompt."""
    if not prompt:
        return prompt
    return prompt + _ARTIFACT_REMINDER
