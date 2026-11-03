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
    FROM public.memberships
    WHERE user_id = (SELECT auth.uid())
      AND status = 'active'
      AND must_change_password = false
  );
$function$;

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

DROP POLICY IF EXISTS "Active members can read all rooms" ON public.rooms;
CREATE POLICY "Ready members can read active rooms"
  ON public.rooms FOR SELECT TO authenticated
  USING (
    public.is_ready_member()
    AND archived_at IS NULL
  );

DROP POLICY IF EXISTS "Active members can read all messages" ON public.messages;
CREATE POLICY "Ready members can read messages"
  ON public.messages FOR SELECT TO authenticated
  USING (public.is_ready_member());

CREATE POLICY "Members can insert messages only when ready"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND public.is_ready_member()
  );

CREATE POLICY "Authors can edit their own message only while active"
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

CREATE POLICY "Administrators can update memberships"
  ON public.memberships FOR UPDATE TO authenticated
  USING (public.has_community_role(ARRAY['administrator']::text[]))
  WITH CHECK (public.has_community_role(ARRAY['administrator']::text[]));

CREATE POLICY "Administrators can update profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_community_role(ARRAY['administrator']::text[]))
  WITH CHECK (public.has_community_role(ARRAY['administrator']::text[]));

CREATE POLICY "Administrators can archive rooms"
  ON public.rooms FOR UPDATE TO authenticated
  USING (public.has_community_role(ARRAY['administrator']::text[]))
  WITH CHECK (public.has_community_role(ARRAY['administrator']::text[]));

CREATE POLICY "Administrators can delete rooms"
  ON public.rooms FOR DELETE TO authenticated
  USING (public.has_community_role(ARRAY['administrator']::text[]));

CREATE POLICY "Administrators can moderate messages"
  ON public.messages FOR UPDATE TO authenticated
  USING (public.has_community_role(ARRAY['administrator']::text[]))
  WITH CHECK (public.has_community_role(ARRAY['administrator']::text[]));
