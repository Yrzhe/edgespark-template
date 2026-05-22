export const TOMBSTONE_HASH = "\0deleted";

type VersionLink = {
  id: string;
  parentVersionId: string | null;
};

type FileLink = {
  versionId: string;
  path: string;
  hash: string;
};

export function resolveVersionPath(input: {
  versions: readonly VersionLink[];
  files: readonly FileLink[];
  currentVersionId: string | null;
  path: string;
}): { hash: string; versionId: string } | null {
  const versionsById = new Map(input.versions.map((version) => [version.id, version]));
  const filesByVersionPath = new Map(input.files.map((file) => [`${file.versionId}:${file.path}`, file]));

  let cursor = input.currentVersionId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const file = filesByVersionPath.get(`${cursor}:${input.path}`);
    if (file) {
      if (file.hash === TOMBSTONE_HASH) return null;
      return { hash: file.hash, versionId: cursor };
    }
    cursor = versionsById.get(cursor)?.parentVersionId ?? null;
  }

  return null;
}
