import { CodeCard } from "./CodeCard";
import { DiffCard } from "./DiffCard";
import { PreviewCard } from "./PreviewCard";
import { FileCard } from "./FileCard";
import type { MessageContent } from "@/types";
import type { FC } from "react";

interface CardProps {
  content: MessageContent;
}

const cardRenderers: Record<string, FC<CardProps>> = {
  code: ({ content }) => <CodeCard content={content as import("@/types").CodeContent} />,
  diff: ({ content }) => <DiffCard content={content as import("@/types").DiffContent} />,
  preview: ({ content }) => <PreviewCard content={content as import("@/types").PreviewContent} />,
  file: ({ content }) => <FileCard content={content as import("@/types").FileContent} />,
};

export function CardRenderer({ content }: { content: MessageContent }) {
  if (content.type === "text") return null;
  const Renderer = cardRenderers[content.type];
  if (!Renderer) return null;
  return <Renderer content={content} />;
}
