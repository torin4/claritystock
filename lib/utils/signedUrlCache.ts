import type { SupabaseClient } from '@supabase/supabase-js'

type CacheEntry = { url: string; expiresAt: number }

/** In-memory signed URL cache + in-flight dedupe (cuts duplicate Supabase calls). */
const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<string | null>>()

/** Slack before real expiry so we refresh before URLs go stale. */
const EXPIRY_SLACK_MS = 120_000

function storeSignedUrl(path: string, url: string, expiresSec: number) {
  const expiresAt = Date.now() + expiresSec * 1000 - EXPIRY_SLACK_MS
  cache.set(path, { url, expiresAt })
}

export function peekCachedSignedUrl(path: string): string | null {
  const e = cache.get(path)
  if (!e || e.expiresAt <= Date.now()) return null
  return e.url
}

export async function getOrCreateSignedUrl(
  supabase: SupabaseClient,
  path: string,
  expiresSec: number,
): Promise<string | null> {
  const hit = peekCachedSignedUrl(path)
  if (hit) return hit

  const pending = inflight.get(path)
  if (pending) return pending

  const promise = (async () => {
    try {
      const { data, error } = await supabase.storage.from('photos').createSignedUrl(path, expiresSec)
      if (error || !data?.signedUrl) return null
      storeSignedUrl(path, data.signedUrl, expiresSec)
      return data.signedUrl
    } finally {
      inflight.delete(path)
    }
  })()

  inflight.set(path, promise)
  return promise
}

export async function getOrCreateSignedUrls(
  supabase: SupabaseClient,
  paths: string[],
  expiresSec: number,
): Promise<Record<string, string>> {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)))
  const result: Record<string, string> = {}
  const missing: string[] = []

  for (const path of uniquePaths) {
    const cached = peekCachedSignedUrl(path)
    if (cached) {
      result[path] = cached
    } else {
      missing.push(path)
    }
  }

  if (!missing.length) return result

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
