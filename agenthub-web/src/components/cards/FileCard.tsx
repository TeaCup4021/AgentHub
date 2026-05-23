import { formatFileSize } from "@/lib/utils";
import type { FileContent } from "@/types";

interface FileCardProps {
  content: FileContent;
}

export function FileCard({ content }: FileCardProps) {
  return (
    <div className="my-2 rounded-md border border-gray-300 bg-white text-left">
      <a
        href={content.fileUrl}
        download
        className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 shrink-0">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-800 truncate">{content.fileName}</p>
          <p className="text-[10px] text-gray-500">{formatFileSize(content.fileSize)} · {content.fileType}</p>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 shrink-0">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
      </a>
    </div>
  );
}
