/** Match user input to a row in `neighborhood_canonicals` (exact ignoring case, then Levenshtein). */

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + c)
    }
  }
  return dp[m][n]
}

/**
 * Map free text to the canonical label from the list, or null if nothing is close enough.
 */
export function resolveNeighborhoodToCanonical(
  input: string | null | undefined,
  labels: readonly string[],
): string | null {
  const t = input?.trim()
  if (!t) return null
  const lower = t.toLowerCase()
  const exact = labels.find((l) => l.toLowerCase() === lower)
  if (exact) return exact

  let best: string | null = null
  let bestDist = Infinity
  for (const l of labels) {
    const d = levenshtein(lower, l.toLowerCase())
    if (d < bestDist) {
      bestDist = d
      best = l
    }
  }
  if (best === null) return null
  const maxAllowed = t.length <= 4 ? 1 : t.length <= 10 ? 2 : 3
  return bestDist <= maxAllowed ? best : null
}

/** Substring matches for datalist/autocomplete; empty until `minChars` typed. */
export function filterNeighborhoodSuggestions(
  query: string,
  labels: readonly string[],
  max = 20,
  minChars = 2,
): string[] {
  const q = query.trim().toLowerCase()
  if (q.length < minChars) return []
  return labels
    .filter((l) => l.toLowerCase().includes(q))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, max)
}
