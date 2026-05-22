/** Opaque app ID generator. */
export function newId(): string {
  return crypto.randomUUID();
}
