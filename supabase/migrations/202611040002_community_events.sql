-- Community events: active members may read; only ready administrators may manage events.
CREATE TABLE IF NOT EXISTS public.community_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 3000),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  location text CHECK (location IS NULL OR char_length(location) <= 300),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_events_valid_end CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS community_events_starts_at_idx ON public.community_events (starts_at);
ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ready members can read community events" ON public.community_events;
CREATE POLICY "Ready members can read community events"
  ON public.community_events FOR SELECT TO authenticated
  USING (public.is_ready_member());
DROP POLICY IF EXISTS "Administrators can insert community events" ON public.community_events;
CREATE POLICY "Administrators can insert community events"
  ON public.community_events FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND public.is_ready_member() AND public.has_community_role(ARRAY['administrator']::text[]));
DROP POLICY IF EXISTS "Administrators can update community events" ON public.community_events;
CREATE POLICY "Administrators can update community events"
  ON public.community_events FOR UPDATE TO authenticated
  USING (public.is_ready_member() AND public.has_community_role(ARRAY['administrator']::text[]))
  WITH CHECK (public.is_ready_member() AND public.has_community_role(ARRAY['administrator']::text[]));
DROP POLICY IF EXISTS "Administrators can delete community events" ON public.community_events;
CREATE POLICY "Administrators can delete community events"
  ON public.community_events FOR DELETE TO authenticated
  USING (public.is_ready_member() AND public.has_community_role(ARRAY['administrator']::text[]));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_events TO authenticated;

CREATE OR REPLACE FUNCTION public.set_community_event_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;
DROP TRIGGER IF EXISTS set_community_event_updated_at ON public.community_events;
CREATE TRIGGER set_community_event_updated_at BEFORE UPDATE ON public.community_events
FOR EACH ROW EXECUTE FUNCTION public.set_community_event_updated_at();
