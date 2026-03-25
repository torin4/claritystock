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
