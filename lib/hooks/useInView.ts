'use client'
import { useEffect, useState, type RefObject } from 'react'

/**
 * IntersectionObserver — default: fire once when near viewport (good for lazy image signing).
 */
export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  options?: { rootMargin?: string; once?: boolean },
) {
  const [inView, setInView] = useState(false)
  const rootMargin = options?.rootMargin ?? '280px 0px'
  const once = options?.once !== false

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setInView(true)
        if (once) obs.disconnect()
      },
      { root: null, rootMargin, threshold: 0.01 },
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [ref, rootMargin, once])

  return inView
}
