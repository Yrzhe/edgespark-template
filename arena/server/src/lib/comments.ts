export function sanitizeCommentText(input: unknown): string {
  const raw = typeof input === "string" ? input : "";
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 200);
}

export function parseMentionIds(text: string): string[] {
  const out = new Set<string>();
  const re = /@([A-Za-z0-9_-]{1,80})/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) out.add(match[1]);
  return [...out];
}

export function heartsAwarded(ids: readonly string[]): Record<string, 10> {
  return Object.fromEntries([...new Set(ids)].map((id) => [id, 10])) as Record<string, 10>;
}

export function safeMentions(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
