import { useState } from "react";
import type { Artifact, CodeArtifactContent } from "@/types";

interface CodeCardProps {
  artifact: Artifact;
}

export function CodeCard({ artifact }: CodeCardProps) {
  const [copied, setCopied] = useState(false);
  const c = artifact.content as unknown as CodeArtifactContent;

  const handleCopy = () => {
    navigator.clipboard.writeText(c.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 overflow-hidden rounded-md bg-gray-900 text-left">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700">
        <span className="text-xs text-gray-400">
          {c.fileName || c.language || "code"}
        </span>
        <button
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          onClick={handleCopy}
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 pb-3 text-xs text-gray-200">
        <code>{c.code}</code>
      </pre>
    </div>
  );
}
