# PPT Artifact Streaming Plan

## Tasks

- [x] Add loading-bar state for empty streaming agent bubbles.
- [x] Treat PPT/PPTX document cards as download-only cards with Chinese labels.
- [x] Keep PDF document cards inline-previewable with download and fullscreen actions.
- [x] Filter local `file://` document artifacts in backend CLI output and frontend rendering.
- [x] Cover the behavior with targeted component tests and type checks.

## Files

- `src/components/chat/MessageList.tsx`
- `src/components/chat/ArtifactWorkbench.tsx`
- `src/components/cards/DocumentCard.tsx`
- `src/lib/artifacts.ts`
- `backend/app/services/adapters/cli_adapter.py`
