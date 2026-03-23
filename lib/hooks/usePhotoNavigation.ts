'use client'

import { useEffect } from 'react'

export function usePhotoNavigation(
  photoIds: string[],
  currentId: string | null,
  onNavigate: (id: string) => void,
  onClose: () => void
) {
  const currentIndex = currentId ? photoIds.indexOf(currentId) : -1
  const prevId = currentIndex > 0 ? photoIds[currentIndex - 1] : null
  const nextId = currentIndex < photoIds.length - 1 ? photoIds[currentIndex + 1] : null

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && prevId) onNavigate(prevId)
      if (e.key === 'ArrowRight' && nextId) onNavigate(nextId)
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [prevId, nextId, onNavigate, onClose])

  return { prevId, nextId }
}
