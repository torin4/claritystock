/**
 * PostgREST parses unquoted `in.(...)` tokens as numbers; hex SHA-256 strings can
 * contain `e` + digits and trigger 400. Use quoted strings in `in.(...)` / `eq."..."`.
 */
function escapeDoubleQuotes(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Value for `.filter('content_hash', 'in', value)` → `content_hash=in.("a","b")` */
export function contentHashInFilter(hashes: string[]): string {
  const unique = Array.from(new Set(hashes.filter(Boolean)))
  return `(${unique.map((h) => `"${escapeDoubleQuotes(h)}"`).join(',')})`
}

/** Postgres undefined_column / PostgREST when `photos.content_hash` was never migrated. */
export function isContentHashColumnMissingError(err: { code?: string | number; message?: string } | null): boolean {
  if (!err) return false
  // Supabase/PostgREST may surface code as string or number.
  if (String(err.code ?? '') === '42703') return true
  const m = err.message ?? ''
  return (
    (m.includes('content_hash') && (m.includes('does not exist') || m.includes('schema cache'))) ||
    m.includes('photos.content_hash')
  )
}
