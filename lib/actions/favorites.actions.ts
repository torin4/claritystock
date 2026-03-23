'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleFavorite(photoId: string): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: existing } = await supabase
    .from('favorites')
    .select('id')
    .eq('photo_id', photoId)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    await supabase.from('favorites').delete().eq('id', existing.id)
    revalidatePath('/')
    return false
  } else {
    await supabase.from('favorites').insert({ photo_id: photoId, user_id: user.id })
    revalidatePath('/')
    return true
  }
}
