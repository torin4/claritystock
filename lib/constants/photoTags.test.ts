import { describe, expect, it } from 'vitest'
import { PHOTO_TAG_NEEDS_LOCATION, withNeedsLocationTag } from '@/lib/constants/photoTags'

describe('withNeedsLocationTag', () => {
  it('adds the tag when there is no neighborhood', () => {
    expect(withNeedsLocationTag(['marina'], null)).toEqual(['marina', PHOTO_TAG_NEEDS_LOCATION])
    expect(withNeedsLocationTag(['marina'], undefined)).toEqual(['marina', PHOTO_TAG_NEEDS_LOCATION])
    expect(withNeedsLocationTag([], '   ')).toEqual([PHOTO_TAG_NEEDS_LOCATION])
  })

  it('omits the tag when a neighborhood is set', () => {
    expect(withNeedsLocationTag(['marina'], 'Queen Anne')).toEqual(['marina'])
  })

  it('never duplicates, and strips a stale tag', () => {
    expect(withNeedsLocationTag([PHOTO_TAG_NEEDS_LOCATION, 'a'], null)).toEqual(['a', PHOTO_TAG_NEEDS_LOCATION])
    expect(withNeedsLocationTag([PHOTO_TAG_NEEDS_LOCATION, 'a'], 'Fremont')).toEqual(['a'])
  })
})
