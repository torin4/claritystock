// exifr is ESM only — dynamic import to avoid SSR issues
export async function extractGps(file: File): Promise<{ lat: number; lng: number } | null> {
  try {
    const exifr = await import('exifr')
    const exif = await exifr.parse(file, { gps: true })
    if (exif?.latitude && exif?.longitude) {
      return { lat: exif.latitude, lng: exif.longitude }
    }
  } catch {
    // No EXIF data — silently ignore
  }
  return null
}
