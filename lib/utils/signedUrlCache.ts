import type { SupabaseClient } from '@supabase/supabase-js'

type CacheEntry = { url: string; expiresAt: number }
export type UrlTransform = { width?: number; height?: number; quality?: number }

/** In-memory signed URL cache + in-flight dedupe (cuts duplicate Supabase calls). */
const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<string | null>>()

function cacheKey(path: string, transform?: UrlTransform): string {
  if (!transform) return path
  return `${path}::${transform.width ?? ''}x${transform.height ?? ''}q${transform.quality ?? ''}`
}

/** Slack before real expiry so we refresh before URLs go stale. */
const EXPIRY_SLACK_MS = 120_000

function storeSignedUrl(key: string, url: string, expiresSec: number) {
  const expiresAt = Date.now() + expiresSec * 1000 - EXPIRY_SLACK_MS
  cache.set(key, { url, expiresAt })
}

export function peekCachedSignedUrl(path: string, transform?: UrlTransform): string | null {
  const e = cache.get(cacheKey(path, transform))
  if (!e || e.expiresAt <= Date.now()) return null
  return e.url
}

export async function getOrCreateSignedUrl(
  supabase: SupabaseClient,
  path: string,
  expiresSec: number,
  transform?: UrlTransform,
): Promise<string | null> {
  const key = cacheKey(path, transform)
  const hit = peekCachedSignedUrl(path, transform)
  if (hit) return hit

  const pending = inflight.get(key)
  if (pending) return pending

  const promise = (async () => {
    try {
      const { data, error } = await supabase.storage.from('photos').createSignedUrl(
        path,
        expiresSec,
        transform ? { transform } : undefined,
      )
      if (error || !data?.signedUrl) return null
      console.log('[signedUrl]', transform ? `transform ${JSON.stringify(transform)}` : 'no transform', data.signedUrl.slice(0, 120))
      storeSignedUrl(key, data.signedUrl, expiresSec)
      return data.signedUrl
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, promise)
  return promise
}

export async function getOrCreateSignedUrls(
  supabase: SupabaseClient,
  paths: string[],
  expiresSec: number,
  transform?: UrlTransform,
): Promise<Record<string, string>> {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)))
  const result: Record<string, string> = {}
  const missing: string[] = []

  for (const path of uniquePaths) {
    const cached = peekCachedSignedUrl(path, transform)
    if (cached) {
      result[path] = cached
    } else {
      missing.push(path)
    }
  }

  if (!missing.length) return result

  // When a transform is requested fall back to individual calls (batch API doesn't support transforms).
  if (transform) {
    const settled = await Promise.all(
      missing.map(async (path) => [path, await getOrCreateSignedUrl(supabase, path, expiresSec, transform)] as const),
    )
    for (const [path, url] of settled) {
      if (url) result[path] = url
    }
    return result
  }

  const storage = supabase.storage.from('photos') as typeof supabase.storage extends {
    from: (...args: never[]) => infer T
  } ? T & {
    createSignedUrls?: (
      paths: string[],
      expiresIn: number,
    ) => Promise<{ data?: { path: string; signedUrl: string }[] | null; error?: unknown }>
  } : never

  if (typeof storage.createSignedUrls === 'function') {
    const { data, error } = await storage.createSignedUrls(missing, expiresSec)
    if (!error && data?.length) {
      for (const entry of data) {
        if (!entry?.path || !entry?.signedUrl) continue
        storeSignedUrl(entry.path, entry.signedUrl, expiresSec)
        result[entry.path] = entry.signedUrl
      }
      const unresolved = missing.filter((path) => !result[path])
      if (!unresolved.length) return result
      const fallback = await Promise.all(
        unresolved.map(async (path) => [path, await getOrCreateSignedUrl(supabase, path, expiresSec)] as const),
      )
      for (const [path, url] of fallback) {
        if (url) result[path] = url
      }
      return result
    }
  }

  const fallback = await Promise.all(
    missing.map(async (path) => [path, await getOrCreateSignedUrl(supabase, path, expiresSec)] as const),
  )
  for (const [path, url] of fallback) {
    if (url) result[path] = url
  }
  return result
}
