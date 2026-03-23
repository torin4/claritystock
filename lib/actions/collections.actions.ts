'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Category } from '@/lib/types/database.types'

export async function createCollection(input: { name: string; category?: Category | null }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const name = input.name.trim()
  if (!name) throw new Error('Name is required')

  const { error } = await supabase
    .from('collections')
    .insert({
      name,
      category: input.category ?? null,
      created_by: user.id,
    })

  if (error) throw error
  revalidatePath('/')
  revalidatePath('/my-photos')
}

/** Deletes the collection row in Supabase. Photos keep their files; `collection_id` is set to null (FK). */
export async function deleteCollection(id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('collections')
    .delete()
    .eq('id', id)
    .eq('created_by', user.id)

  if (error) throw error
  revalidatePath('/')
  revalidatePath('/my-photos')
}
