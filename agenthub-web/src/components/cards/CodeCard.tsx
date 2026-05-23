import { useState } from "react";
import type { CodeContent } from "@/types";

interface CodeCardProps {
  content: CodeContent;
}

export function CodeCard({ content }: CodeCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 overflow-hidden rounded-md bg-gray-900 text-left">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700">
        <span className="text-xs text-gray-400">
          {content.fileName || content.language || "code"}
        </span>
        <button
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          onClick={handleCopy}
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 pb-3 text-xs text-gray-200">
        <code>{content.code}</code>
      </pre>
    </div>
  );
}
