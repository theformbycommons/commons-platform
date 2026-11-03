-- Secure onboarding and admin policies for the existing schema.
-- This is a follow-up to 202611030001_member_admin_onboarding.sql and is safe
-- to run after that earlier migration has been applied.

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE OR REPLACE FUNCTION public.is_ready_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships AS m
    WHERE m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.must_change_password = false
  );
$function$;

REVOKE ALL ON FUNCTION public.is_ready_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ready_member() TO authenticated;

-- A password change made through Supabase Auth changes encrypted_password.
-- Clear onboarding automatically for that exact Auth user; clients cannot call
-- a completion RPC to clear the flag without changing the Auth password.
CREATE OR REPLACE FUNCTION public.clear_password_onboarding_after_auth_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    UPDATE public.memberships
    SET must_change_password = false
    WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.clear_password_onboarding_after_auth_change() FROM PUBLIC;
DROP TRIGGER IF EXISTS clear_password_onboarding_after_auth_change ON auth.users;
CREATE TRIGGER clear_password_onboarding_after_auth_change
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  WHEN (OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password)
  EXECUTE FUNCTION public.clear_password_onboarding_after_auth_change();

-- Remove the insecure completion RPC created by the earlier migration.
DROP FUNCTION IF EXISTS public.complete_password_change();

-- Replace the broad membership list policy. Pending members can read only their
-- own row (needed by the app's onboarding screen); ready admins can list all.
DROP POLICY IF EXISTS "Active members can see memberships" ON public.memberships;
DROP POLICY IF EXISTS "Users can read own membership" ON public.memberships;
DROP POLICY IF EXISTS "Ready administrators can read memberships" ON public.memberships;
CREATE POLICY "Users can read own membership"
  ON public.memberships FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Ready administrators can read memberships"
  ON public.memberships FOR SELECT TO authenticated
  USING (
    public.is_ready_member()
    AND public.has_community_role(ARRAY['administrator']::text[])
  );

-- Only ready administrators can change roles, status, or onboarding flags.
DROP POLICY IF EXISTS "Administrators can update memberships" ON public.memberships;
CREATE POLICY "Administrators can update memberships"
  ON public.memberships FOR UPDATE TO authenticated
  USING (
    public.is_ready_member()
    AND public.has_community_role(ARRAY['administrator']::text[])
  )
  WITH CHECK (
    public.is_ready_member()
    AND public.has_community_role(ARRAY['administrator']::text[])
  );
REVOKE UPDATE ON public.memberships FROM authenticated;
REVOKE UPDATE (role, status, must_change_password) ON public.memberships FROM authenticated;
GRANT UPDATE (role, status, must_change_password) ON public.memberships TO authenticated;

-- Profiles are member directory data. Onboarding users cannot read the directory.
DROP POLICY IF EXISTS "Active members can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Ready members can read profiles" ON public.profiles;
CREATE POLICY "Ready members can read profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_ready_member());

DROP POLICY IF EXISTS "Administrators can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Administrators can update profiles" ON public.profiles;
CREATE POLICY "Administrators can update profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    public.is_ready_member()
    AND public.has_community_role(ARRAY['administrator']::text[])
  )
  WITH CHECK (
    public.is_ready_member()
    AND public.has_community_role(ARRAY['administrator']::text[])
  );

-- Rooms are visible to ready members only when active. Administrators can see
-- archived rooms too, so they can restore them from the admin panel.
DROP POLICY IF EXISTS "Active members can read all rooms" ON public.rooms;
DROP POLICY IF EXISTS "Ready members can read active rooms" ON public.rooms;
DROP POLICY IF EXISTS "Ready members can read rooms" ON public.rooms;
CREATE POLICY "Ready members can read rooms"
  ON public.rooms FOR SELECT TO authenticated
  USING (
    public.is_ready_member()
    AND (
      archived_at IS NULL
      OR public.has_community_role(ARRAY['administrator']::text[])
    )
  );

DROP POLICY IF EXISTS "Administrators can create rooms" ON public.rooms;
CREATE POLICY "Administrators can create rooms"
  ON public.rooms FOR INSERT TO authenticated
  WITH CHECK (
    public.is_ready_member()
    AND public.has_community_role(ARRAY['administrator']::text[])
  );

DROP POLICY IF EXISTS "Administrators can update rooms" ON public.rooms;
DROP POLICY IF EXISTS "Administrators can archive rooms" ON public.rooms;
CREATE POLICY "Administrators can update rooms"
  ON public.rooms FOR UPDATE TO authenticated
  USING (
    public.is_ready_member()
    AND public.has_community_role(ARRAY['administrator']::text[])
  )
  WITH CHECK (
    public.is_ready_member()
    AND public.has_community_role(ARRAY['administrator']::text[])
  );

DROP POLICY IF EXISTS "Administrators can delete rooms" ON public.rooms;
CREATE POLICY "Administrators can delete rooms"
  ON public.rooms FOR DELETE TO authenticated
  USING (
    public.is_ready_member()
    AND public.has_community_role(ARRAY['administrator']::text[])
  );

-- Remove all known earlier message policies before recreating them: permissive
-- policies are OR-ed, so an old policy could otherwise bypass onboarding.
DROP POLICY IF EXISTS "Active members can read all messages" ON public.messages;
DROP POLICY IF EXISTS "Ready members can read messages" ON public.messages;
CREATE POLICY "Ready members can read messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    public.is_ready_member()
    AND (
      public.has_community_role(ARRAY['administrator']::text[])
      OR (
        deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.rooms AS r
          WHERE r.id = messages.room_id
            AND r.archived_at IS NULL
        )
      )
    )
  );

DROP POLICY IF EXISTS "Active members can post messages" ON public.messages;
DROP POLICY IF EXISTS "Members can insert messages only when ready" ON public.messages;
DROP POLICY IF EXISTS "Ready members can post messages" ON public.messages;
CREATE POLICY "Ready members can post messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND public.is_ready_member()
    AND EXISTS (
      SELECT 1
      FROM public.rooms AS r
      WHERE r.id = messages.room_id
        AND r.archived_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Authors can edit their own messages" ON public.messages;
DROP POLICY IF EXISTS "Authors can edit their own message only while active" ON public.messages;
DROP POLICY IF EXISTS "Authors can edit their own message only while ready" ON public.messages;
CREATE POLICY "Authors can edit their own message only while ready"
  ON public.messages FOR UPDATE TO authenticated
  USING (
    author_id = (SELECT auth.uid())
    AND public.is_ready_member()
    AND deleted_at IS NULL
  )
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND public.is_ready_member()
  );

DROP POLICY IF EXISTS "Administrators can moderate messages" ON public.messages;
CREATE POLICY "Administrators can moderate messages"
  ON public.messages FOR UPDATE TO authenticated
  USING (
    public.is_ready_member()
    AND public.has_community_role(ARRAY['administrator']::text[])
  )
  WITH CHECK (
    public.is_ready_member()
    AND public.has_community_role(ARRAY['administrator']::text[])
  );
