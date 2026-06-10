# PPT Artifact Streaming

## Scope

Fix the Claude Code CLI PPT generation chat experience.

## Requirements

- After `message_start`, show a slim loading bar inside the agent bubble until the first visible token, thinking step, or artifact arrives.
- For PPT generation output, render one PPT/PPTX download card and one PDF preview card when conversion succeeds.
- PPT/PPTX cards are download-only. Button labels and tooltips must be Chinese.
- PDF cards preview inline and support download plus fullscreen preview.
- Local `file://` document artifacts must not render in chat or the artifact workbench.

## Data Rules

- Backend CLI artifact detection filters local file URL artifacts before SSE emission and persistence.
- Frontend artifact rendering filters local file URL artifacts as a defensive fallback.
- Duplicate document artifacts with the same file name and file type prefer browser-downloadable URLs over local file URLs.
