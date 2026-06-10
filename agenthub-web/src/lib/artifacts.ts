import type { Artifact } from "@/types";

function isArtifactRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getDocumentContent(artifact: Artifact): Record<string, unknown> | null {
  if (artifact.artifactType !== "document" && artifact.artifactType !== "file") return null;
  return isArtifactRecord(artifact.content) ? artifact.content : null;
}

function normalizeArtifactFileType(content: Record<string, unknown>): string {
  return String(content.fileType || "").toLowerCase();
}

function isLocalFileUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase().startsWith("file://");
}

function documentIdentity(artifact: Artifact): string | null {
  const content = getDocumentContent(artifact);
  if (!content) return null;
  const fileName = String(content.fileName || artifact.title || "").trim().toLowerCase();
  const fileType = normalizeArtifactFileType(content);
  if (!fileName && !fileType) return null;
  return `${fileType}:${fileName}`;
}

export function getRenderableArtifacts(artifacts: Artifact[]): Artifact[] {
  const preferredByIdentity = new Map<string, Artifact>();

  for (const artifact of artifacts) {
    const identity = documentIdentity(artifact);
    const content = getDocumentContent(artifact);
    if (!identity || !content) continue;
    const current = preferredByIdentity.get(identity);
    if (!current || isLocalFileUrl(getDocumentContent(current)?.fileUrl)) {
      preferredByIdentity.set(identity, artifact);
    }
  }

  return artifacts.filter((artifact) => {
    const content = getDocumentContent(artifact);
    if (!content) return true;
    if (isLocalFileUrl(content.fileUrl)) return false;

    const identity = documentIdentity(artifact);
    if (!identity) return true;
    const preferred = preferredByIdentity.get(identity);
    return !preferred || preferred.id === artifact.id;
  });
}
