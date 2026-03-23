'use client'

import { useEffect, useState } from 'react'

export function useMobileModal() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const mobileStyle: React.CSSProperties = isMobile
    ? { top: '52px', height: 'calc(100% - 52px)', borderRadius: 0, left: 0, right: 0, bottom: 0 }
    : {}

  return { isMobile, mobileStyle }
}
