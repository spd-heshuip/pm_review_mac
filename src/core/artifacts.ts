export interface ArtifactFile {
  path: string;
  updatedAt: string;
}

export function pickReport(files: ArtifactFile[], requirementId?: string): ArtifactFile | null {
  const markdown = files.filter((file) => file.path.toLowerCase().endsWith(".md"));
  if (markdown.length === 0) return null;
  const preferred = markdown.filter((file) => isPreferred(file.path, requirementId));
  const pool = preferred.length > 0 ? preferred : markdown;
  return [...pool].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

function isPreferred(path: string, requirementId?: string): boolean {
  const fileName = path.split("/").pop() ?? path;
  if (path.includes("tapd-requirement-clarity")) return true;
  if (fileName.startsWith("CURRENT-")) return true;
  if (requirementId && fileName.startsWith(requirementId)) return true;
  return false;
}
