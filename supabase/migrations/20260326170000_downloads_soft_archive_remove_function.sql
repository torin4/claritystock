-- Soft-archive personal downloads so Insights/usage counts remain correct.
-- When a photographer "removes from My downloads", we mark their download rows archived
-- instead of deleting them and decrementing photos.downloads_count.

alter table public.downloads
  add column if not exists archived_at timestamptz;

create or replace function public.remove_my_downloads(p_photo_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_photo_ids is null or cardinality(p_photo_ids) = 0 then
    return;
  end if;

  -- Archive the user's download history rows only.
  -- Intentionally do NOT decrement photos.downloads_count, since those represent
  -- real usage events (even if the downloader later clears their local downloads).
  update public.downloads
  set archived_at = now()
  where downloaded_by = uid
    and photo_id = any(p_photo_ids)
    and archived_at is null;
end;
$$;

grant execute on function public.remove_my_downloads(uuid[]) to authenticated;

