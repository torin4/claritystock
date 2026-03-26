import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

async function geocodeLatLng(lat: number, lng: number) {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) {
    return NextResponse.json({ neighborhood: null, subarea: null, error: 'Geocoding not configured' }, { status: 503 })
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`
  const res = await fetch(url)
  const data = await res.json()

  if (data.status !== 'OK' || !data.results?.length) {
    return NextResponse.json({ neighborhood: null, subarea: null })
  }

  let neighborhood: string | null = null
  let subarea: string | null = null

  for (const result of data.results) {
    for (const comp of result.address_components) {
      if (!neighborhood && comp.types.some((t: string) => ['neighborhood', 'sublocality_level_1', 'sublocality'].includes(t))) {
        neighborhood = comp.long_name
      }
      if (!subarea && comp.types.some((t: string) => ['locality', 'administrative_area_level_2'].includes(t))) {
        subarea = comp.long_name
      }
    }
    if (neighborhood) break
  }

  return NextResponse.json({ neighborhood, subarea })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const lat = parseFloat(request.nextUrl.searchParams.get('lat') ?? '')
  const lng = parseFloat(request.nextUrl.searchParams.get('lng') ?? '')
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ neighborhood: null, subarea: null })
  }
  return geocodeLatLng(lat, lng)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lat, lng } = await request.json()
  if (!lat || !lng) return NextResponse.json({ neighborhood: null, subarea: null })

  return geocodeLatLng(Number(lat), Number(lng))
}
