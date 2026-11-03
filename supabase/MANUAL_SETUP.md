# Applying the member onboarding and admin changes

## Important: do not run the old onboarding SQL again

The first onboarding SQL created `must_change_password`, `archived_at`, and a `complete_password_change()` RPC. The follow-up migration below removes that RPC and replaces the password completion mechanism with a database trigger that reacts to an actual Supabase Auth password update.

The migration is:

`supabase/migrations/202611030002_secure_member_onboarding.sql`

It is designed to be run after the earlier onboarding SQL. It can be applied through Supabase SQL Editor or Supabase CLI. Applying a migration file in GitHub does not automatically change the Supabase database.

## Dashboard SQL Editor (manual workflow)

1. Open the project dashboard and go to **SQL Editor**.
2. Choose **New query**.
3. Open `supabase/migrations/202611030002_secure_member_onboarding.sql` in GitHub and copy the entire file contents.
4. Paste into the new SQL query. Do not paste the JavaScript app code into SQL Editor.
5. Click **Run** once. Check that the result says the query succeeded. If it reports an error, stop and share the error text (redact secrets); do not repeatedly run partial sections.
6. In SQL Editor, check the policies and RLS status again using the read-only queries you used earlier.

The SQL Editor saves query text only if you explicitly save the query; the migration file in the repo is the durable, version-controlled record. The SQL takes effect when you click **Run**.

## Marking a member for first-login password change

After creating the Auth user in **Authentication → Users**, get that user's Auth UUID from the dashboard. Use it in this SQL Editor query to create/update the membership flag:

```sql
UPDATE public.memberships
SET must_change_password = true
WHERE user_id = 'PASTE-THE-AUTH-USER-UUID-HERE';
```

Before doing this for a real member, make sure the membership row already exists and has `status = 'active'`. If it does not, create the membership through the dashboard/table editor or a reviewed admin operation. Do not share passwords, API keys, or the user's UUID in a public issue or chat.

The user's profile row is separate and needs a `display_name` (2–60 characters) and the same UUID as `auth.users.id`.

## App code and deployment

The React files (`src/App.jsx`, `src/AdminApp.jsx`, and `src/admin.jsx`) are frontend code. They belong in the repository, not SQL Editor. The app uses the normal Supabase URL and publishable/anon key; never put a service-role key in the browser app.

The member site is the existing GitHub Pages app. The separate admin entry point is `admin.html`, deployed at:

`https://theformbycommons.github.io/commons-platform/admin.html`

The feature branch is not live until its changes are merged to `main` and the GitHub Pages workflow succeeds. Review and test the branch first, especially using a separate test member account, before inviting real members.

## Flow

1. Create a test Auth user in Supabase Dashboard and a matching active `profiles` and `memberships` row. Set `must_change_password = true`.
2. Sign in at the member site with the temporary password. The app should show only the password-change form.
3. The app re-authenticates with the temporary password, calls Supabase Auth `updateUser({ password })`, then rereads the membership.
4. The trigger in the migration observes the Auth password hash change and clears `must_change_password`. RLS then allows the member into active rooms and messages.
5. Set the owner membership to `role = 'administrator'`, `status = 'active'`, and `must_change_password = false` after testing, so the admin panel is accessible.

Auth email edits and permanent Auth user deletion remain manual in Supabase Dashboard. Membership status `removed` is the safer reversible way to revoke app access; it does not delete the Auth account.

## Important limits

- The browser UI is not itself the security boundary. RLS policies and the Auth password-change trigger enforce the relevant rules.
- The admin panel manages memberships, display names, rooms, and messages. It intentionally does not create Auth users, edit Auth emails, or delete Auth users.
- Existing room deletion is constrained by foreign keys when a room contains messages; archive rooms to preserve discussions.
- The `admin.html` route is not secret. Admin authorization is checked in the UI and by RLS in the database.
