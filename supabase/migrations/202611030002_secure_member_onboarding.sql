ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- This is the trust boundary: a member is "ready" only if they are active
-- and have already changed their temporary password.
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

-- This is the actual secure trigger: clear onboarding only when the Auth user
-- password hash really changes. The browser app cannot trigger this directly.
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

DROP TRIGGER IF EXISTS clear_password_onboarding_after_auth_change ON auth.users;
CREATE TRIGGER clear_password_onboarding_after_auth_change
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  WHEN (OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password)
  EXECUTE FUNCTION public.clear_password_onboarding_after_auth_change();

-- Remove insecure previous RPC if it exists
DROP FUNCTION IF EXISTS public.complete_password_change();

-- Read own membership
DROP POLICY IF EXISTS "Active members can see memberships" ON public.memberships;
DROP POLICY IF EXISTS "Users can read own membership" ON public.memberships;
CREATE POLICY "Users can read own membership"
  ON public.memberships FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Admins can list all memberships only after they are active and ready
DROP POLICY IF EXISTS "Ready administrators can read memberships" ON public.memberships;
CREATE POLICY "Ready administrators can read memberships"
  ON public.memberships FOR SELECT TO authenticated
  USING (
    public.is_ready_member()
    AND public.has_community_role(ARRAY['administrator']::text[])
  );

-- Admin membership updates
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
GRANT UPDATE (role, status, must_change_password) ON public.memberships TO authenticated;

-- Profiles
DROP POLICY IF EXISTS "Active members can read profiles" ON public.profiles;
CREATE POLICY "Ready members can read profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_ready_member());

DROP POLICY IF EXISTS "Members can update their own profile" ON public.profiles;
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

-- Rooms
DROP POLICY IF EXISTS "Active members can read all rooms" ON public.rooms;
DROP POLICY IF EXISTS "Ready members can read active rooms" ON public.rooms;
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

-- Messages
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
