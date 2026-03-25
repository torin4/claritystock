export function sanitizeFilename(name: string): string {
  const base = (name || 'photo').trim()
  const cleaned = base.replace(/[^\w.\- ]+/g, '').replace(/\s+/g, ' ').trim()
  return (cleaned || 'photo').slice(0, 180)
}

export async function downloadFromUrl(url: string, filename: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const blob = await res.blob()
  const objUrl = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = objUrl
    a.download = sanitizeFilename(filename)
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(objUrl)
  }
}

