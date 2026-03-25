import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_LIMIT = 200
const DEFAULT_BATCH_SIZE = 50
const DEFAULT_CONCURRENCY = 4

function printHelp() {
  console.log(`Usage: npm run backfill:content-hash -- [options]

Downloads each photo's original from Storage, SHA-256s the bytes (same as upload flow),
and sets photos.content_hash for rows that are still null.

Requires: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY in .env

Options:
  --limit=N          Max photos to process this run (default: ${DEFAULT_LIMIT})
  --batch-size=N     Rows to fetch per batch (default: ${DEFAULT_BATCH_SIZE})
  --concurrency=N    Parallel downloads/hashes per batch (default: ${DEFAULT_CONCURRENCY})
  --photo-id=UUID    Backfill one photo
  --user-id=UUID     Only this photographer's photos
  --dry-run          List pending rows without downloading or updating
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
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL')
  }

  return createClient(supabaseUrl, getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Lowercase hex SHA-256 — matches Web Crypto output from sha256File.ts */
function sha256HexFromBuffer(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

async function fetchPendingBatch(supabase, options, size) {
  let query = supabase
    .from('photos')
    .select('id, photographer_id, storage_path, created_at')
    .is('content_hash', null)
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

async function hashAndUpdate(supabase, photo) {
  const storagePath = photo.storage_path
  if (!storagePath) {
    throw new Error('Missing storage_path')
  }

  const { data: blob, error: downloadError } = await supabase.storage.from('photos').download(storagePath)

  if (downloadError || !blob) {
    throw downloadError ?? new Error('Could not download original from storage')
  }

  const buf = Buffer.from(await blob.arrayBuffer())
  const contentHash = sha256HexFromBuffer(buf)

  const { error: updateError } = await supabase.from('photos').update({ content_hash: contentHash }).eq('id', photo.id)

  if (updateError) throw updateError

  return contentHash
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
      console.log('No photos pending content_hash backfill (null hash + non-null storage_path).')
      return
    }
    console.log(`Found ${pending.length} pending photo(s) in this sample:`)
    for (const photo of pending) {
      console.log(`- ${photo.id} :: ${photo.storage_path}`)
    }
    console.log('Dry run only. No downloads or updates.')
    return
  }

  let processed = 0
  let succeeded = 0
  let failed = 0

  while (processed < options.limit) {
    const remaining = options.limit - processed
    const batch = await fetchPendingBatch(supabase, options, Math.min(options.batchSize, remaining))

    if (!batch.length) break

    for (let i = 0; i < batch.length; i += options.concurrency) {
      const slice = batch.slice(i, i + options.concurrency)
      const results = await Promise.allSettled(
        slice.map(async (photo) => {
          const hash = await hashAndUpdate(supabase, photo)
          return { id: photo.id, hash }
        }),
      )

      for (const result of results) {
        processed += 1
        if (result.status === 'fulfilled') {
          succeeded += 1
          console.log(`Backfilled ${result.value.id} content_hash=${result.value.hash.slice(0, 12)}…`)
        } else {
          failed += 1
          const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
          console.error(`Failed: ${message}`)
        }

        if (processed >= options.limit) break
      }
    }
  }

  console.log(`Done. Processed=${processed} Succeeded=${succeeded} Failed=${failed}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
