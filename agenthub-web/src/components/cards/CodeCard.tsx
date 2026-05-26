import type { Artifact, CodeArtifactContent } from "@/types";
import { HighlightedCode } from "@/components/chat/HighlightedCode";

interface CodeCardProps {
  artifact: Artifact;
}

export function CodeCard({ artifact }: CodeCardProps) {
  const c = artifact.content as unknown as CodeArtifactContent;
  return <HighlightedCode code={c.code} language={c.language} fileName={c.fileName} />;
}
