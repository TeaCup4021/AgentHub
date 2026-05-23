import { useState } from "react";
import type { PreviewContent } from "@/types";

interface PreviewCardProps {
  content: PreviewContent;
}

export function PreviewCard({ content }: PreviewCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="my-2 overflow-hidden rounded-md border border-gray-300 text-left">
        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100">
          <span className="text-xs text-gray-600">
            {content.title || "预览"} ({content.previewType})
          </span>
          <button
            className="text-xs text-blue-600 hover:text-blue-800"
            onClick={() => setExpanded(true)}
          >
            展开
          </button>
        </div>
        <div className="h-48 bg-white">
          <iframe
            src={content.url}
            title={content.title || "preview"}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setExpanded(false)}
        >
          <div
            className="w-[90vw] h-[90vh] rounded-lg bg-white shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <span className="text-sm font-medium">{content.title || "全屏预览"}</span>
              <button
                className="text-gray-500 hover:text-gray-800 text-lg"
                onClick={() => setExpanded(false)}
              >
                ✕
              </button>
            </div>
            <div className="flex-1">
              <iframe
                src={content.url}
                title={content.title || "preview"}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
