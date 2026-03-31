/**
 * PostgREST/Safe `.or(...)` clause for free-text photo search.
 * Substring match on title, neighborhood, subarea, and description so place names behave
 * like users expect (e.g. "bainbridge" → "Bainbridge Island - Winslow"). Pure FTS can miss
 * when the query language config does not match the indexed `fts` column or for partial tokens.
 */

function quotedIlikeContainsPattern(raw: string): string {
  const forLike = raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  const inner = `%${forLike}%`
  return `"${inner.replace(/"/g, '""')}"`
}

/** Returns argument for `query.or(clause)`, or null when search is empty. */
export function buildPhotosSearchOrClause(raw: string): string | null {
  const term = raw.trim()
  if (!term) return null
  const q = quotedIlikeContainsPattern(term)
  // Comma would split PostgREST `or=(...)` operands; FTS websearch tolerates space-separated terms.
  const forFts = term.replace(/,/g, ' ')
  return [
    `title.ilike.${q}`,
    `neighborhood.ilike.${q}`,
    `subarea.ilike.${q}`,
    `description.ilike.${q}`,
    `fts.wfts(english).${forFts}`,
  ].join(',')
}
