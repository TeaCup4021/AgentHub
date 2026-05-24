import type { Artifact, DiffArtifactContent } from "@/types";

interface DiffCardProps {
  artifact: Artifact;
}

export function DiffCard({ artifact }: DiffCardProps) {
  const c = artifact.content as unknown as DiffArtifactContent;
  return (
    <div className="my-2 overflow-hidden rounded-md border border-gray-300 text-left">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100">
        <span className="text-xs text-gray-600">{c.fileName || "diff"}</span>
        <span className="text-xs text-gray-400">{c.language}</span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-gray-200 text-xs">
        <div className="bg-red-50 px-3 py-2 font-mono whitespace-pre-wrap text-gray-700">
          <div className="mb-1 text-[10px] text-red-500 font-semibold">旧版本</div>
          {c.oldCode}
        </div>
        <div className="bg-green-50 px-3 py-2 font-mono whitespace-pre-wrap text-gray-700">
          <div className="mb-1 text-[10px] text-green-600 font-semibold">新版本</div>
          {c.newCode}
        </div>
      </div>
    </div>
  );
}
