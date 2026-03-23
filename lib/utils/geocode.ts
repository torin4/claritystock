export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<{ neighborhood: string | null; subarea: string | null }> {
  const res = await fetch('/api/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng }),
  })
  if (!res.ok) return { neighborhood: null, subarea: null }
  return res.json()
}
