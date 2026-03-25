import { createClient } from '@supabase/supabase-js'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const MAX_DISPLAY_DIMENSION = 1920
const DEFAULT_LIMIT = 100
const DEFAULT_BATCH_SIZE = 20
const DEFAULT_CONCURRENCY = 2

function printHelp() {
  console.log(`Usage: npm run backfill:display -- [options]

Options:
  --limit=N          Max photos to process this run (default: ${DEFAULT_LIMIT})
  --batch-size=N     Rows to fetch from Supabase per batch (default: ${DEFAULT_BATCH_SIZE})
  --concurrency=N    Photos to process in parallel per batch (default: ${DEFAULT_CONCURRENCY})
  --photo-id=UUID    Backfill one specific photo
  --user-id=UUID     Backfill only one photographer's photos
  --dry-run          Show which photos are pending without writing anything
  --help             Show this help
`)
}

function parseArgs(argv) {
  const options = {
    limit: DEFAULT_LIMIT,
    batchSize: DEFAULT_BATCH_SIZE,
    concurrency: DEFAULT_CONCURRENCY,
    dryRun: false,
    help: false,
    photoId: null,
    userId: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg.startsWith('--limit=')) {
      options.limit = Number.parseInt(arg.slice('--limit='.length), 10)
      continue
    }
    if (arg === '--limit') {
      options.limit = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (arg.startsWith('--batch-size=')) {
      options.batchSize = Number.parseInt(arg.slice('--batch-size='.length), 10)
      continue
    }
    if (arg === '--batch-size') {
      options.batchSize = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (arg.startsWith('--concurrency=')) {
      options.concurrency = Number.parseInt(arg.slice('--concurrency='.length), 10)
      continue
    }
    if (arg === '--concurrency') {
      options.concurrency = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (arg.startsWith('--photo-id=')) {
      options.photoId = arg.slice('--photo-id='.length)
      continue
    }
    if (arg === '--photo-id') {
      options.photoId = next
      index += 1
      continue
    }
    if (arg.startsWith('--user-id=')) {
      options.userId = arg.slice('--user-id='.length)
      continue
    }
    if (arg === '--user-id') {
      options.userId = next
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) {
    throw new Error('--limit must be a positive integer')
  }
  if (!Number.isFinite(options.batchSize) || options.batchSize < 1) {
    throw new Error('--batch-size must be a positive integer')
  }
  if (!Number.isFinite(options.concurrency) || options.concurrency < 1) {
    throw new Error('--concurrency must be a positive integer')
  }

  return options
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function createServiceClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim()
  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL')
  }

  return createClient(supabaseUrl, getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function getOwnerPrefix(storagePath, photographerId) {
  const [firstSegment] = storagePath.split('/')
  if (firstSegment) return firstSegment
  return photographerId ?? 'backfill'
}

async function createDisplayDerivative(sourceBuffer) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'clarity-display-backfill-'))
  const inputPath = path.join(tempDir, 'source-image')
  const outputPath = path.join(tempDir, 'display.jpg')

  try {
    await writeFile(inputPath, sourceBuffer)
    await execFileAsync('/usr/bin/sips', [
      '-s', 'format', 'jpeg',
      '-s', 'formatOptions', '85',
      '-Z', String(MAX_DISPLAY_DIMENSION),
      inputPath,
      '--out', outputPath,
    ])
    return await readFile(outputPath)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function fetchPendingBatch(supabase, options, size) {
  let query = supabase
    .from('photos')
    .select('id, photographer_id, storage_path, display_path, created_at')
    .is('display_path', null)
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: true })
    .limit(size)

  if (options.photoId) {
    query = query.eq('id', options.photoId)
  }
  if (options.userId) {
    query = query.eq('photographer_id', options.userId)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

async function processPhoto(supabase, photo) {
  const storagePath = photo.storage_path
  if (!storagePath) {
    throw new Error('Missing storage_path')
  }

  const { data: originalBlob, error: downloadError } = await supabase.storage
    .from('photos')
    .download(storagePath)

  if (downloadError || !originalBlob) {
    throw downloadError ?? new Error('Could not download original asset')
  }

  const derivativeBuffer = await createDisplayDerivative(
    Buffer.from(await originalBlob.arrayBuffer()),
  )

  const displayPath = `${getOwnerPrefix(storagePath, photo.photographer_id)}/display/${photo.id}.jpg`

  const { error: uploadError } = await supabase.storage
    .from('photos')
    .upload(displayPath, derivativeBuffer, {
      cacheControl: '86400',
      upsert: true,
      contentType: 'image/jpeg',
    })

  if (uploadError) throw uploadError

  const { error: updateError } = await supabase
    .from('photos')
    .update({ display_path: displayPath })
    .eq('id', photo.id)

  if (updateError) throw updateError

  return displayPath
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const supabase = createServiceClient()

  if (options.dryRun) {
    const pending = await fetchPendingBatch(supabase, options, Math.min(options.limit, options.batchSize))
    if (!pending.length) {
      console.log('No pending photos found for display backfill.')
      return
    }
    console.log(`Found ${pending.length} pending photo(s) in this sample:`)
    for (const photo of pending) {
      console.log(`- ${photo.id} :: ${photo.storage_path}`)
    }
    console.log('Dry run only. No rows or storage objects were changed.')
    return
  }

  let processed = 0
  let succeeded = 0
  let failed = 0

  while (processed < options.limit) {
    const remaining = options.limit - processed
    const batch = await fetchPendingBatch(
      supabase,
      options,
      Math.min(options.batchSize, remaining),
    )

    if (!batch.length) break

    for (let i = 0; i < batch.length; i += options.concurrency) {
      const slice = batch.slice(i, i + options.concurrency)
      const results = await Promise.allSettled(
        slice.map(async (photo) => {
          const displayPath = await processPhoto(supabase, photo)
          return { id: photo.id, displayPath }
        }),
      )

      for (const result of results) {
        processed += 1
        if (result.status === 'fulfilled') {
          succeeded += 1
          console.log(`Backfilled ${result.value.id} -> ${result.value.displayPath}`)
        } else {
          failed += 1
          const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
          console.error(`Failed to backfill photo in current batch: ${message}`)
        }

        if (processed >= options.limit) break
      }
    }
  }

  console.log(`Backfill complete. Processed=${processed} Succeeded=${succeeded} Failed=${failed}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
