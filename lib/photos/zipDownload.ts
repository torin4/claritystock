/** Max photos per ZIP request (must match API route). */
export const ZIP_DOWNLOAD_MAX_PHOTOS = 25

/**
 * POST /api/photos/zip — builds a ZIP of full-size files for the given photo IDs.
 * Requires an authenticated session cookie.
 */
export async function downloadPhotosZip(photoIds: string[]): Promise<void> {
  const unique = Array.from(new Set(photoIds.filter(Boolean)))
  if (!unique.length) {
    throw new Error('Select at least one photo')
  }
  if (unique.length > ZIP_DOWNLOAD_MAX_PHOTOS) {
    const ok = confirm(
      `Only ${ZIP_DOWNLOAD_MAX_PHOTOS} photos can be zipped at once. Continue with the first ${ZIP_DOWNLOAD_MAX_PHOTOS} in your selection?`,
    )
    if (!ok) throw new Error('Cancelled')
  }
  const ids = unique.slice(0, ZIP_DOWNLOAD_MAX_PHOTOS)

  const res = await fetch('/api/photos/zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoIds: ids }),
  })

  if (!res.ok) {
    let message = res.statusText
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) message = j.error
    } catch {
      try {
        const t = await res.text()
        if (t) message = t.slice(0, 200)
      } catch {
        /* ignore */
      }
    }
    throw new Error(message)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    const d = new Date().toISOString().slice(0, 10)
    a.download = `clarity-stock-${d}.zip`
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}
