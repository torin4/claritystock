/** Parse `INGEST_IMAGE_HOSTS` (comma-separated exact hostnames). Empty means nothing is allowed. */
export function parseIngestImageHosts(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * SSRF guard for the image download: https only, default port, no credentials,
 * and the hostname must exactly match an allow-listed host.
 */
export function isAllowedImageUrl(url: string, allowedHosts: string[]): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  if (u.username || u.password) return false
  if (u.port && u.port !== '443') return false
  return allowedHosts.includes(u.hostname.toLowerCase())
}
