/**
 * Title-case neighborhood strings to match PostgreSQL `initcap(lower(trim(x)))`
 * used in `normalize_neighborhood_case` and the photos trigger.
 * Keeps browse filters and persisted UI state aligned with stored values.
 */
export function normalizeNeighborhoodDisplay(input: string | null | undefined): string | null {
  const t = input?.trim()
  if (!t) return null
  return t
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join('')
}

/** Optional manual overrides when trigram similarity is too weak (very short names, etc.). */
const ALIASES_LOWER: Record<string, string> = {
  // Example: kirklnad: 'Kirkland',
}

/** Value used in `.eq('neighborhood', …)` so legacy persisted filters still match after normalization. */
export function neighborhoodForQuery(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const t = String(raw).trim()
  if (!t) return null
  const alias = ALIASES_LOWER[t.toLowerCase()]
  if (alias) return alias
  return normalizeNeighborhoodDisplay(t) ?? t
}
