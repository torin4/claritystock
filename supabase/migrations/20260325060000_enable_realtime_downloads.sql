-- Enable Supabase Realtime broadcasts for download notifications.
-- Safe to run multiple times.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'downloads'
  ) then
    alter publication supabase_realtime add table public.downloads;
  end if;
end $$;

