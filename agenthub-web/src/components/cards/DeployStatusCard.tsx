import type { Artifact, DeployStatusArtifactContent } from "@/types";

interface DeployStatusCardProps {
  artifact: Artifact;
}

export function DeployStatusCard({ artifact }: DeployStatusCardProps) {
  const c = artifact.content as unknown as DeployStatusArtifactContent;

  if (c.status === "building") {
    return (
      <div className="my-2 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-left">
        <div className="flex items-center gap-2.5">
          <svg className="h-4 w-4 animate-spin text-yellow-600" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
          </svg>
          <span className="text-sm font-medium text-yellow-700">构建中...</span>
        </div>
      </div>
    );
  }

  if (c.status === "deployed") {
    return (
      <div className="my-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-left">
        <div className="flex items-center gap-2.5">
          <svg className="h-4 w-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-medium text-green-700">部署成功</span>
        </div>
        {c.url && (
          <a href={c.url} target="_blank" rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-blue-600 underline hover:text-blue-800">
            {c.url}
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="my-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-left">
      <div className="flex items-center gap-2.5">
        <svg className="h-4 w-4 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm font-medium text-red-700">部署失败</span>
      </div>
    </div>
  );
}
