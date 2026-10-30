import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { createServerDerivatives, detectImageMime } from '@/lib/ingest/derivatives'

function solid(width: number, height: number, format: 'png' | 'jpeg' | 'webp' | 'tiff') {
  return sharp({ create: { width, height, channels: 3, background: { r: 40, g: 90, b: 140 } } })
    .toFormat(format)
    .toBuffer()
}

describe('server derivatives', () => {
  it('detects the four accepted formats and rejects others', async () => {
    expect(await detectImageMime(await solid(10, 10, 'jpeg'))).toBe('image/jpeg')
    expect(await detectImageMime(await solid(10, 10, 'png'))).toBe('image/png')
    expect(await detectImageMime(await solid(10, 10, 'webp'))).toBe('image/webp')
    expect(await detectImageMime(await solid(10, 10, 'tiff'))).toBe('image/tiff')
    expect(await detectImageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(await detectImageMime(Buffer.from('not an image'))).toBeNull()
  })

  it('fits inside the browser presets as JPEG', async () => {
    const d = await createServerDerivatives(await solid(4000, 2000, 'png'))
    const [display, thumb, ai] = await Promise.all([
      sharp(d.display).metadata(),
      sharp(d.thumbnail).metadata(),
      sharp(d.aiTag).metadata(),
    ])
    expect([display.format, display.width, display.height]).toEqual(['jpeg', 1920, 960])
    expect([thumb.format, thumb.width, thumb.height]).toEqual(['jpeg', 1200, 600])
    expect([ai.format, ai.width, ai.height]).toEqual(['jpeg', 1280, 640])
  })

  it('never enlarges a small image', async () => {
    const d = await createServerDerivatives(await solid(800, 600, 'jpeg'))
    const m = await sharp(d.display).metadata()
    expect([m.width, m.height]).toEqual([800, 600])
  })
})
