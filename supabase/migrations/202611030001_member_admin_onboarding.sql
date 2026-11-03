-- Application membership and moderation support.
-- Apply in Supabase SQL Editor (or with Supabase CLI migrations) after reviewing.

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Keep first-login members from reading rooms/messages or interacting until their
-- temporary password has been replaced. SECURITY DEFINER helpers use a fixed,
-- empty search_path and fully qualified object names.
CREATE OR REPLACE FUNCTION public.is_ready_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = (SELECT auth.uid())
      AND status = 'active'
      AND must_change_password = false
  );
$function$;

-- A signed-in user can clear only their own onboarding flag. Call this only
-- after supabase.auth.updateUser({ password }) succeeds.
CREATE OR REPLACE FUNCTION public.complete_password_change()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.memberships
  SET must_change_password = false
  WHERE user_id = (SELECT auth.uid())
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active membership found for the signed-in user';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_password_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_password_change() TO authenticated;

-- Replace the previous broad room/message read policies with the onboarding gate.
DROP POLICY IF EXISTS "Active members can read all rooms" ON public.rooms;
CREATE POLICY "Ready members can read active rooms"
  ON public.rooms FOR SELECT TO authenticated
  USING (public.is_ready_member() AND archived_at IS NULL);

DROP POLICY IF EXISTS "Active members can read all messages" ON public.messages;
CREATE POLICY "Ready members can read messages"
  ON public.messages FOR SELECT TO authenticated
  USING (public.is_ready_member());

-- Add administrator management policies. Existing member/author policies remain
-- in place; permissive policies combine with OR, so admin updates are additive.
CREATE POLICY "Administrators can update memberships"
  ON public.memberships FOR UPDATE TO authenticated
  USING (public.has_community_role(ARRAY['administrator']::text[]))
  WITH CHECK (public.has_community_role(ARRAY['administrator']::text[]));

CREATE POLICY "Administrators can update any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_community_role(ARRAY['administrator']::text[]))
  WITH CHECK (public.has_community_role(ARRAY['administrator']::text[]));

CREATE POLICY "Administrators can delete rooms"
  ON public.rooms FOR DELETE TO authenticated
  USING (public.has_community_role(ARRAY['administrator']::text[]));

CREATE POLICY "Administrators can moderate messages"
  ON public.messages FOR UPDATE TO authenticated
  USING (public.has_community_role(ARRAY['administrator']::text[]))
  WITH CHECK (public.has_community_role(ARRAY['administrator']::text[]));

-- The browser app should not modify membership privilege/status flags directly.
-- RPC is the only member-facing path for clearing must_change_password.
REVOKE UPDATE ON public.memberships FROM authenticated;
GRANT UPDATE (role, status, must_change_password) ON public.memberships TO authenticated;

-- Note: PostgreSQL column privileges are table-wide for current UPDATE policies;
-- RLS still checks administrator role. Admin UI keeps Auth email changes and
-- permanent Auth user deletion in Supabase Dashboard, not in this browser app.
