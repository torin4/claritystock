'use client'
import { useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { getOrCreateSignedUrl, peekCachedSignedUrl } from '@/lib/utils/signedUrlCache'

type Options = {
  /** Default 3600. Longer = fewer re-signs while cache is warm. */
  expiresSec?: number
  /** When false, no network (e.g. tile below the fold until scrolled). */
  enabled?: boolean
}

/**
 * Signed URL for private `photos` bucket — cached & deduped across tiles.
 */
export function useSignedPhotoUrl(path: string | null | undefined, options?: Options) {
  const expiresSec = options?.expiresSec ?? 3600
  const enabled = options?.enabled !== false

  const [url, setUrl] = useState<string | null>(() =>
    path && enabled ? peekCachedSignedUrl(path) ?? null : null,
  )

  useEffect(() => {
    if (!path) {
      setUrl(null)
      return
    }

    if (!enabled) {
      setUrl(null)
      return
    }

    const cached = peekCachedSignedUrl(path)
    if (cached) {
      setUrl(cached)
      return
    }

    let cancelled = false
    ;(async () => {
      const supabase = getSupabaseBrowserClient()
      const signed = await getOrCreateSignedUrl(supabase, path, expiresSec)
      if (cancelled) return
      setUrl(signed)
    })()

    return () => {
      cancelled = true
    }
  }, [path, expiresSec, enabled])

  return url
}
