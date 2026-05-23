import { CodeCard } from "./CodeCard";
import { DiffCard } from "./DiffCard";
import { PreviewCard } from "./PreviewCard";
import { FileCard } from "./FileCard";
import type { Artifact } from "@/types";
import type { FC } from "react";

interface CardRendererProps {
  artifact: Artifact;
}

const cardRenderers: Record<string, FC<CardRendererProps>> = {
  code: CodeCard,
  diff: DiffCard,
  preview: PreviewCard,
  file: FileCard,
};

export function CardRenderer({ artifact }: CardRendererProps) {
  const Renderer = cardRenderers[artifact.artifactType];
  if (!Renderer) return null;
  return <Renderer artifact={artifact} />;
}
