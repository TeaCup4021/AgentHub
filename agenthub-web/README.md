# AgentHub Web

Multi-agent collaboration platform — frontend. Chat UI with Semi Design, artifact cards, streaming SSE.

## Quick Start

```bash
npm install
npx tsc -b --noEmit    # type-check (must be zero errors)
npx vitest run          # run 86 tests
npm run dev             # start dev server
```

## Stack

- React 19 + TypeScript
- Semi Design 2.x (`@douyinfe/semi-ui` + `@douyinfe/semi-icons`)
- Zustand + React Query (TanStack Query)
- Vite + Rolldown
- Vitest

## Project Structure

```
src/
├── components/
│   ├── chat/        # ChatHeader, MessageList, ChatInput, ArtifactWorkbench
│   ├── cards/       # CodeCard, DiffCard, PreviewCard, FileCard, DeployStatusCard
│   ├── layout/      # AppLayout, ChatArea, ConversationList
│   ├── agent/       # Agent management modals
│   └── settings/    # Settings panels
├── hooks/           # React Query hooks + useMessages, useAgents
├── stores/          # Zustand stores (chatStore, uiStore, dashboardStore, agentStore)
├── types/           # TypeScript type definitions
├── lib/             # API client, SSE, diff engine, utilities
└── mocks/           # Mock data + handlers
```

## Key Conventions

- **Data flow**: AppLayout fetches → passes via props → children render
- **Card registry**: Add `src/components/cards/XxxCard.tsx` → register in `CardRenderer.tsx`
- **CSS tokens**: Semi Design variables (`--color-*`, `--radius-*`, `--shadow-*`)
- **Spec-driven**: Write spec → review → task → implement. Full docs in [docs/](docs/README.md)
