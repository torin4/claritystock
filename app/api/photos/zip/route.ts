import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import archiver from 'archiver'
import { PassThrough, Readable } from 'node:stream'
import { ZIP_DOWNLOAD_MAX_PHOTOS } from '@/lib/photos/zipDownload'
import { devError, devWarn } from '@/lib/utils/devLog'

export const runtime = 'nodejs'

/** Total uncompressed payload cap to protect serverless memory (bytes). */
const MAX_TOTAL_BYTES = 120 * 1024 * 1024

function sanitizeBasename(title: string): string {
  const s = title
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return s || 'photo'
}

function extFromStoragePath(path: string): string {
  const m = path.match(/\.[a-z0-9]+$/i)
  return m ? m[0].toLowerCase() : '.jpg'
}

/** Unique names inside the ZIP: `title.jpg`, `title (2).jpg`, … */
function zipEntryName(
  photo: { id: string; title: string; storage_path: string },
  counts: Map<string, number>,
): string {
  const base = sanitizeBasename(photo.title)
  const ext = extFromStoragePath(photo.storage_path)
  const key = `${base}${ext}`
  const n = (counts.get(key) ?? 0) + 1
  counts.set(key, n)
  const label = n === 1 ? base : `${base} (${n})`
  return `${label}${ext}`
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const photoIds = (body as { photoIds?: unknown }).photoIds
  if (!Array.isArray(photoIds) || !photoIds.every((id): id is string => typeof id === 'string')) {
    return NextResponse.json({ error: 'Expected { photoIds: string[] }' }, { status: 400 })
  }

  const ids = Array.from(new Set(photoIds)).slice(0, ZIP_DOWNLOAD_MAX_PHOTOS)
  if (!ids.length) {
    return NextResponse.json({ error: 'No photo IDs' }, { status: 400 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: photos, error: qErr } = await supabase
    .from('photos')
    .select('id, title, storage_path')
    .in('id', ids)

  if (qErr) {
    devError('[zip]', qErr)
    return NextResponse.json({ error: 'Could not load photos' }, { status: 500 })
  }

  const rows = (photos ?? []).filter((p): p is { id: string; title: string; storage_path: string } =>
    Boolean(p.storage_path),
  )

  if (!rows.length) {
    return NextResponse.json({ error: 'No matching photos or missing files' }, { status: 404 })
  }

  // Preserve user selection order
  const order = new Map(ids.map((id, i) => [id, i]))
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

  const nameCounts = new Map<string, number>()
  const buffers: { id: string; name: string; buf: Buffer }[] = []
  let totalBytes = 0

  for (const photo of rows) {
    const { data: blob, error: dErr } = await supabase.storage
      .from('photos')
      .download(photo.storage_path)

    if (dErr || !blob) {
      devWarn('[zip] skip storage', photo.id, dErr?.message)
      continue
    }

    const ab = await blob.arrayBuffer()
    const buf = Buffer.from(ab)
    totalBytes += buf.length
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        {
          error: `ZIP would exceed ${MAX_TOTAL_BYTES / (1024 * 1024)} MB total. Choose fewer or smaller photos.`,
        },
        { status: 413 },
      )
    }

    const name = zipEntryName(photo, nameCounts)
    buffers.push({ id: photo.id, name, buf })
  }

  if (!buffers.length) {
    return NextResponse.json({ error: 'Could not download any files from storage' }, { status: 422 })
  }

  const { error: rpcErr } = await supabase.rpc('record_downloads_bulk', {
    p_photo_ids: buffers.map(b => b.id),
    p_job_ref: 'zip',
  })

  if (rpcErr) {
    devError('[zip] record_downloads_bulk', rpcErr)
    return NextResponse.json(
      { error: 'Could not record downloads. Run latest supabase/schema.sql (record_downloads_bulk).' },
      { status: 500 },
    )
  }

  const passthrough = new PassThrough()
  const archive = archiver('zip', { zlib: { level: 6 } })

  archive.on('error', (err: Error) => {
    passthrough.destroy(err)
  })

  archive.pipe(passthrough)

  for (const { name, buf } of buffers) {
    archive.append(buf, { name })
  }

  void archive.finalize()

  const webStream = Readable.toWeb(passthrough) as unknown as ReadableStream

  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="clarity-stock-${new Date().toISOString().slice(0, 10)}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}
