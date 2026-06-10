import { CodeCard } from "./CodeCard";
import { DiffCard } from "./DiffCard";
import { PreviewCard } from "./PreviewCard";
import { FileCard } from "./FileCard";
import { DeployStatusCard } from "./DeployStatusCard";
import { DocumentCard } from "./DocumentCard";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { AgentConfigPreviewCard } from "./AgentConfigPreviewCard";
import type { Artifact } from "@/types";
import { memo } from "react";
import type { FC } from "react";

interface CardRendererProps {
  artifact: Artifact;
  convId?: string;
  conversationId?: string;
}

const cardRenderers: Record<string, FC<CardRendererProps>> = {
  code: CodeCard,
  diff: DiffCard,
  preview: PreviewCard,
  file: FileCard,
  deploy_status: DeployStatusCard,
  document: DocumentCard,
  link_preview: LinkPreviewCard,
  agent_config: AgentConfigPreviewCard,
};

export const CardRenderer = memo(function CardRenderer({ artifact, convId, conversationId }: CardRendererProps) {
  const Renderer = cardRenderers[artifact.artifactType];
  if (!Renderer) return null;
  const resolvedConversationId = conversationId || convId;
  return <Renderer artifact={artifact} convId={resolvedConversationId} conversationId={resolvedConversationId} />;
});
