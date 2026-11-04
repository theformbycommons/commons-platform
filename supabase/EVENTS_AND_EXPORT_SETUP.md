# Community events and DOCX message export

The events page is available at `events.html` to active members. Administrators manage events and use date/room-filtered DOCX message exports at `events-admin.html`.

## Database setup

Apply `supabase/migrations/202611040002_community_events.sql` in Supabase SQL Editor. The migration enables RLS: ready members can read events; only ready administrators can insert, edit, or delete them. The existing message policies allow administrators to read messages (including soft-deleted rows); the export query is still authenticated and database-policy protected.

## Admin export

The tool queries messages in date-bounded pages, optionally filtered to one room, and creates a readable Word-compatible DOCX in the browser. The end date is inclusive. Deleted messages are excluded unless the administrator explicitly opts in. Do not share exports outside the community's approved processes; they contain private conversations and author IDs.

## Deploy

The Vite build includes `events.html` and `events-admin.html`. Admin access is checked in the UI and enforced for event writes by RLS. Apply the migration before using the event tools.
