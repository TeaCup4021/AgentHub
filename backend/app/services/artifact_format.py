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

5. Documents (PDF, Word, Excel, PPT) → use:
<artifact type="document" url="FILE_URL" filename="filename.ext" size="BYTES" type="mime/type" />
Use this for any document file you create or reference, especially PowerPoint (PPT/PPTX),
PDF, Word (DOC/DOCX), and Excel (XLS/XLSX). The file will be displayed inline in the chat.

DO NOT describe artifacts in plain text. ALWAYS use <artifact> tags.
"""


def build_instruction(agent):
    """Prepend artifact format spec to system prompt for maximum priority."""
    base = agent.system_prompt or "You are a helpful assistant."
    return ARTIFACT_FORMAT_SPEC + "\n\n" + base


_ARTIFACT_REMINDER = "\n\n[SYSTEM] Wrap any code, diffs, files, or HTML pages you create in <artifact type=\"...\"> XML tags. Use CDATA sections for code/HTML bodies. [/SYSTEM]"

# Sentinel the frontend prepends when the user quotes a selected code snippet for
# a targeted rewrite (see ChatInput.composeQuotedPrompt). Kept in sync there.
_SELECTION_EDIT_MARKER = "[选区修改]"

_SELECTION_EDIT_DIRECTIVE = (
    "\n\n[SYSTEM] The user selected a specific code snippet to rewrite. "
    "Change ONLY that snippet to satisfy their request; do not rewrite unrelated "
    "code or restate the whole file. Return the change as a diff artifact, and "
    "set the file= attribute to the original file name when known so the change "
    "can be applied back to the source. The '--- before' block MUST be the user's "
    "selected snippet copied VERBATIM (same text and indentation) so it can be "
    "located in the source file; put only the revised snippet in '+++ after':\n"
    "<artifact type=\"diff\" file=\"original_file_name.ext\" title=\"what changed\">\n"
    "<![CDATA[\n--- before\n<original snippet copied verbatim>\n"
    "+++ after\n<modified snippet>\n]]>\n</artifact> [/SYSTEM]"
)


def inject_artifact_reminder(prompt: str) -> str:
    """Append a short artifact-tag reminder to every agent prompt.

    When the prompt carries the selection-edit sentinel, also append a stronger
    directive that constrains the agent to a targeted diff of just that snippet.
    """
    if not prompt:
        return prompt
    reminder = _ARTIFACT_REMINDER
    if _SELECTION_EDIT_MARKER in prompt:
        reminder += _SELECTION_EDIT_DIRECTIVE
    return prompt + reminder
