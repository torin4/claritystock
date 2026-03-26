import { createClient } from '@/lib/supabase/server'
import { PHOTO_TAG_NEEDS_LOCATION } from '@/lib/constants/photoTags'
import { NextResponse, type NextRequest } from 'next/server'
import { devError } from '@/lib/utils/devLog'

/**
 * Loads bulk import job + items for the review modal.
 * Uses the server Supabase client so the browser does not call Supabase REST
 * cross-origin (avoids CORS when production origin is not in Supabase allowlist).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const jobId = params.jobId
  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 })
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: job, error: jobErr } = await supabase
    .from('bulk_upload_jobs')
    .select('summary, status, photographer_id')
    .eq('id', jobId)
    .single()

  if (jobErr || !job) {
    devError('[bulk-upload job GET]', jobErr)
    return NextResponse.json({ error: jobErr?.message ?? 'Job not found' }, { status: 404 })
  }

  if (job.photographer_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: items, error: itemsErr } = await supabase
    .from('bulk_upload_items')
    .select(
      'id, relative_path, folder_name, status, photo_id, error_message, storage_path, thumbnail_path, display_path, content_hash, form_snapshot',
    )
    .eq('job_id', jobId)
    .order('relative_path')

  if (itemsErr) {
    devError('[bulk-upload items GET]', itemsErr)
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }

  const list = items ?? []
  const successPhotoIds = list
    .filter(
      (row: { status: string; photo_id: string | null }) =>
        row.status === 'success' && row.photo_id,
    )
    .map((row: { photo_id: string }) => row.photo_id)

  let needsLocationPhotoIds: string[] = []
  if (successPhotoIds.length) {
    const { data: photoRows, error: photoErr } = await supabase
      .from('photos')
      .select('id, tags')
      .in('id', successPhotoIds)
      .eq('photographer_id', user.id)

    if (photoErr) {
      devError('[bulk-upload photos tags GET]', photoErr)
    } else {
      needsLocationPhotoIds = (photoRows ?? [])
        .filter((p: { id: string; tags: unknown }) => {
          const tags = p.tags as string[] | null
          return Array.isArray(tags) && tags.includes(PHOTO_TAG_NEEDS_LOCATION)
        })
        .map((p: { id: string }) => p.id)
    }
  }

  return NextResponse.json({
    job: { summary: job.summary, status: job.status },
    items: list,
    needsLocationPhotoIds,
  })
}
