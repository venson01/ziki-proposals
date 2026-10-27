/**
 * Avatars as the real app draws them (lib/avatar.ts, lib/header-nav.ts):
 * initials on one of eight tones, the tone picked from the name with FNV-1a
 * so a person looks the same everywhere.
 */

export const AVATAR_TONE_COUNT = 8;

/** Index of the tone for a name: 0 to 7, stable for the same trimmed, lower-cased name. */
export function avatarTone(name?: string | null): number {
  const key = (name ?? "").trim().toLowerCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % AVATAR_TONE_COUNT;
}

/** "Ada Nwosu" → "AN", "mergebot" → "ME". */
export function initialsOf(name?: string | null): string {
  const clean = (name ?? "").trim();
  if (!clean) return "?";
  const base = clean.includes("@") ? clean.split("@")[0] : clean;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : base.slice(0, 2);
  return letters.toUpperCase();
}
