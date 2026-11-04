-- Curated resources for members. Apply this migration in Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS public.community_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  url text NOT NULL CHECK (char_length(url) <= 2048),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ready members can read community resources" ON public.community_resources;
CREATE POLICY "Ready members can read community resources"
  ON public.community_resources FOR SELECT TO authenticated
  USING (public.is_ready_member());

DROP POLICY IF EXISTS "Administrators can insert community resources" ON public.community_resources;
CREATE POLICY "Administrators can insert community resources"
  ON public.community_resources FOR INSERT TO authenticated
  WITH CHECK (
    public.is_ready_member()
    AND public.has_community_role(ARRAY['administrator']::text[])
  );

DROP POLICY IF EXISTS "Administrators can update community resources" ON public.community_resources;
CREATE POLICY "Administrators can update community resources"
  ON public.community_resources FOR UPDATE TO authenticated
  USING (
    public.is_ready_member()
    AND public.has_community_role(ARRAY['administrator']::text[])
  )
  WITH CHECK (
    public.is_ready_member()
    AND public.has_community_role(ARRAY['administrator']::text[])
  );

DROP POLICY IF EXISTS "Administrators can delete community resources" ON public.community_resources;
CREATE POLICY "Administrators can delete community resources"
  ON public.community_resources FOR DELETE TO authenticated
  USING (
    public.is_ready_member()
    AND public.has_community_role(ARRAY['administrator']::text[])
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_resources TO authenticated;

CREATE OR REPLACE FUNCTION public.set_community_resource_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_community_resource_updated_at ON public.community_resources;
CREATE TRIGGER set_community_resource_updated_at
  BEFORE UPDATE ON public.community_resources
  FOR EACH ROW EXECUTE FUNCTION public.set_community_resource_updated_at();

INSERT INTO public.community_resources (title, url, description)
SELECT
  'Contact The Formby Commons',
  'mailto:theformbycommons@protonmail.com',
  'Email the community team.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.community_resources
  WHERE url = 'mailto:theformbycommons@protonmail.com'
);
