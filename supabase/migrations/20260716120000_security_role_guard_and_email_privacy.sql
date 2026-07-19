-- =============================================================================
-- Security hardening
--   1) Prevent privilege escalation: users cannot change their own `role`.
--   2) Keep `users.email` out of reach of regular clients (admin-only via RPC).
-- Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Block role self-escalation
-- ---------------------------------------------------------------------------
-- The `users_update` RLS policy allows a user to update their own row
-- (auth.uid() = id) with no column scoping, so a client holding the anon key +
-- their session JWT could PATCH `role = 'admin'` directly against PostgREST and
-- gain full admin (is_admin() trusts public.users.role). RLS cannot restrict
-- columns, so guard the column with a trigger. Only an existing admin may change
-- any row's role.

CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins may change a user role' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_role ON public.users;
CREATE TRIGGER users_guard_role
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_self_escalation();

-- ---------------------------------------------------------------------------
-- 2) Restrict SELECT on users.email to server-side/admin paths
-- ---------------------------------------------------------------------------
-- `users_read` exposes every row to any authenticated user (needed for
-- name/initials/avatar attribution). Email is workspace PII and should not be
-- bulk-readable by regular members. Column-level GRANTs let us keep the public
-- profile columns readable while dropping `email`.
--
-- NOTE: because SELECT is now granted per-column, any NEW column added to
-- public.users must be added to this GRANT list to be readable by clients.

REVOKE SELECT ON public.users FROM authenticated;
GRANT SELECT (id, name, initials, role, avatar_url, created_at, hide_own_photos_in_browse)
  ON public.users TO authenticated;

-- Writes are unchanged (OAuth callback still upserts email); only SELECT of the
-- email column is removed from the client role.

-- Admin roster (includes email) via SECURITY DEFINER RPC gated on is_admin().
CREATE OR REPLACE FUNCTION public.get_admin_user_roster()
RETURNS TABLE (
  id uuid,
  name text,
  initials text,
  role text,
  created_at timestamptz,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (SELECT public.is_admin()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT u.id, u.name, u.initials, u.role, u.created_at, u.email
  FROM public.users u
  ORDER BY u.name ASC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_roster() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_user_roster() TO authenticated;
