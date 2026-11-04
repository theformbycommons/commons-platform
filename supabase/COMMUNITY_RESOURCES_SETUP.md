# Community resources and footer

This feature adds a member-only resources page at `resources.html`. Administrators can add, edit, and remove links; other active members can view them. The contact email is seeded by the migration. No comments or member edits are available.

## Apply the Supabase migration

The source migration is `supabase/migrations/202611040001_community_resources.sql`. GitHub Pages deployment does not apply database migrations automatically. Apply the full file once in the Supabase SQL Editor after confirming the existing onboarding migration is active. The new table's RLS allows reads only for ready members and writes only for ready administrators.

## Deploy

The Vite build includes `resources.html`. The member site links to the resources page, and the member, resources, and admin pages display the `© 2026 The Formby Commons` footer. Merge/deploy the feature branch only after the migration has been applied and the member/admin paths are tested.
