-- =============================================================================
-- Admin role management
--   Lets an existing admin promote/demote another member from the app UI.
--   RLS `users_update` only permits self-updates (auth.uid() = id), and the
--   `users_guard_role` trigger blocks any role change by a non-admin. This
--   SECURITY DEFINER RPC re-checks is_admin() server-side and, running as the
--   table owner, bypasses the self-only RLS policy so an admin can change
--   another user's role. The trigger still fires and passes because the caller
--   is an admin (auth.uid() is preserved through SECURITY DEFINER).
--
-- Guardrails: caller must be admin · valid role only · cannot change your own
-- role · cannot remove the last remaining admin.
-- Safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_target uuid, p_new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_role text;
BEGIN
  -- Caller must be an admin.
  IF auth.uid() IS NULL OR NOT (SELECT public.is_admin()) THEN
    RAISE EXCEPTION 'Only admins may change roles' USING ERRCODE = '42501';
  END IF;

  -- Only two roles exist in this app.
  IF p_new_role NOT IN ('admin', 'photographer') THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role USING ERRCODE = '22023';
  END IF;

  -- An admin may not change their own role (avoids self-lockout / ambiguity).
  IF p_target = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own role' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_current_role FROM public.users WHERE id = p_target;
  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;

  -- No-op if unchanged.
  IF v_current_role = p_new_role THEN
    RETURN;
  END IF;

  -- Never allow removing the last remaining admin.
  IF v_current_role = 'admin' AND p_new_role <> 'admin'
     AND (SELECT count(*) FROM public.users WHERE role = 'admin') <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last admin' USING ERRCODE = '42501';
  END IF;

  UPDATE public.users SET role = p_new_role WHERE id = p_target;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;
