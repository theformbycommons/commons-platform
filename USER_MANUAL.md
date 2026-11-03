# The Formby Commons — User and Admin Manual

This manual describes the intended member and administrator workflows for The Formby Commons, including the Supabase setup used by the app. The app is still in development. Features described here are available only after the relevant app changes have been reviewed, merged, deployed to GitHub Pages, and the matching Supabase migration has been applied. Do not assume the live site has a feature just because it is described here.

## Contents

- [What the app does](#what-the-app-does)
- [For the administrator](#for-the-administrator)
  - [Before inviting members](#before-inviting-members)
  - [Create a member account manually](#create-a-member-account-manually)
  - [Correct a display name or membership](#correct-a-display-name-or-membership)
  - [Use the admin panel](#use-the-admin-panel)
  - [Change an email or remove an Auth account](#change-an-email-or-remove-an-auth-account)
  - [Password help and account recovery](#password-help-and-account-recovery)
- [For members](#for-members)
- [Privacy and security notes](#privacy-and-security-notes)
- [Troubleshooting](#troubleshooting)

## What the app does

The Formby Commons is a private, member-based discussion site. Members sign in, choose a room, post a message, and reply to messages in nested threads. The app uses Supabase Auth for accounts and a Supabase Postgres database for profiles, memberships, rooms, and messages. The frontend is hosted on GitHub Pages.

The app's display names are stored in `public.profiles`. Membership role, status, and first-login password-change state are stored in `public.memberships`. These are separate from the Auth user record.

## For the administrator

### Before inviting members

The secure manual onboarding flow depends on all of the following being in place:

1. The reviewed app version containing the first-login password screen and admin panel has been deployed to GitHub Pages.
2. The matching, reviewed SQL migration has been applied to the correct Supabase project.
3. Your own account has a `public.memberships` row with `role = administrator`, `status = active`, and (if you do not need to change your own password) `must_change_password = false`.
4. You have tested the process with a separate test account.

A SQL file in GitHub does not change the database by itself. Running SQL in Supabase changes the database; deploying the React app is a separate step. Never put a Supabase service-role key in the frontend or this public repository.

### Create a member account manually

Supabase's built-in Auth email delivery may be restricted on the free tier. This manual workflow creates accounts in the dashboard and does not rely on Supabase sending an invitation email.

#### 1. Create the Auth user

1. Open the correct Supabase project dashboard.
2. Go to **Authentication → Users**.
3. Choose **Add user** or **Create user** (the wording may vary).
4. Enter the member's email address and create a unique temporary password.
5. If the dashboard offers an email-confirmation option, use the setting appropriate to your community's verification process. Do not claim that a manually entered email has been verified unless you have checked it.
6. Create the account and copy its **User UID**. The UID is the link between Auth and the public tables.

Do not reuse temporary passwords, ask members to email you a password they want to keep, or store their permanent passwords. Share the temporary password privately. The member should replace it on first sign-in.

#### 2. Add the profile and membership rows

In the Supabase dashboard, go to **Table Editor → public → profiles** and insert a row:

- `id`: the Auth user's UID
- `display_name`: the name to show in the community (2–60 characters)

Then go to **Table Editor → public → memberships** and insert a row:

- `user_id`: the same Auth user's UID
- `role`: `member`
- `status`: `active`
- `must_change_password`: `true`
- `joined_at`: leave the default, if the editor fills it automatically

Save each row. Check carefully that the two IDs match the Auth UID. The `profiles` table in the current schema has no email field; the email is maintained in Supabase Auth.

If the Table Editor does not let you insert or save the rows, stop and check the table constraints, RLS configuration, and whether you are using the project dashboard with appropriate permissions. Do not work around the issue by adding a service-role key to the website.

#### 3. Give the member sign-in details

Send the member the site URL, their sign-in email, and their unique temporary password through a private channel. Tell them to sign in and choose a new password. Do not send a permanent password or keep a copy of the password they choose.

The first-login gate works only when the current deployed app and the secure database migration are both active. Test with a separate account before onboarding real members.

### Correct a display name or membership

Use **Table Editor** for straightforward corrections:

1. Open **Table Editor → public → profiles**.
2. Find the row by `id` (UID), not by name alone.
3. Edit `display_name` and save.

To change membership settings:

1. Open **Table Editor → public → memberships**.
2. Find the row by `user_id` (UID).
3. Set `role` to `member`, `moderator`, or `administrator`, as appropriate.
4. Set `status` to `active`, `suspended`, or `removed`.
5. Set `must_change_password` to `true` if the member needs to change their password at next sign-in; otherwise set it to `false`.
6. Save the row.

Use `suspended` or `removed` to revoke community access without deleting discussion history. These values do not delete the person's Auth account. Be very careful when changing roles: do not accidentally remove your last active administrator.

The SQL Editor is an alternative for database queries, but Table Editor is usually easier for these routine row edits. A query being saved in SQL Editor does not run until you click **Run**.

### Use the admin panel

After the admin-capable version has been deployed, sign in with your administrator account and open **Admin panel** from the member site. The separate page is normally:

`https://theformbycommons.github.io/commons-platform/admin.html`

The admin page is not secret; authorization comes from the signed-in Supabase membership role and database RLS policies. A user who is not an active administrator must not be able to perform admin database operations even if they visit that URL.

Depending on the deployed version, the panel provides these operations:

- **Members:** change a profile display name; change membership role and status; require a password change at next login.
- **Rooms:** edit the room name or description; archive or restore a room; permanently delete only an empty room. Archive a room if it contains discussions you want to keep.
- **Messages:** edit a message or soft-delete/restore it. Soft-deleted messages are retained in the database; do not treat soft deletion as permanent erasure.

The current prototype shows up to 500 most recent messages in its admin message list. If an item is not shown, use the room discussion or a database query rather than assuming it does not exist.

### Change an email or remove an Auth account

For now, do these manually in **Authentication → Users** in Supabase:

- change an Auth email using the Auth user management controls;
- permanently delete an Auth user only when you are sure you want to remove the account.

The admin panel does not create Auth users, edit Auth emails, or delete Auth users. Those are privileged Auth operations and must not be implemented by putting a service-role key in the static GitHub Pages frontend.

Before deleting an Auth user, consider changing their membership status to `removed` instead. Deletion may be blocked by foreign-key references or affect associated records, depending on the database configuration. Back up or review the related data first.

The Auth user list's **Display name** is user metadata. The member site displays `public.profiles.display_name`, which is a separate value. Changing one does not automatically change the other.

### Password help and account recovery

Members should never send you their chosen permanent password. If a member forgets their password, handle the reset through Supabase Auth using the available dashboard controls and the project's configured email/reset setup. Do not set or keep a password on their behalf for ongoing use.

If an administrator resets a member's password and wants the app to force another change, set that member's `must_change_password` value to `true` in `public.memberships`. Verify that the deployed app and database migration support this flow first.

## For members

### Sign in for the first time

1. Open the community site URL provided by the administrator.
2. Sign in with the email address and temporary password the administrator gave you.
3. If prompted, enter the temporary password and choose a new private password. Confirm the new password and submit.
4. Once it succeeds, the app should take you to the community rooms.

Choose a password that you do not use elsewhere. Do not share it with the administrator or another member.

### Read and join discussions

1. Select a room to view its discussion.
2. Read the top-level messages and their indented replies.
3. Select **Reply** on a message to respond in that message's thread.
4. Use the thread control to collapse or expand replies when available.
5. Write a new top-level post in the room's message box and select **Post message**.
6. Select **Sign out** when you are finished, especially on a shared device.

Messages are associated with your Auth account and displayed under your profile name. Write respectfully and avoid posting sensitive personal information that does not belong in a community discussion.

### If you cannot sign in or access a room

Contact the administrator using the contact method they provided. Your account may be inactive, your membership may still need setup, or you may need help resetting your password. Do not send your password in an email or support message.

## Privacy and security notes

- This manual is public. Do not add credentials, API keys, member email lists, user IDs, temporary passwords, or private community content to it.
- Supabase publishable/anon keys are intended for browser apps, but database safety depends on correct Row Level Security policies.
- Never expose the Supabase service-role key in GitHub, frontend code, GitHub Pages settings that become part of the build, or this manual.
- The UI is not the security boundary. Database RLS policies must authorize each read and write.
- First-login password enforcement depends on both the app and database trigger/policies being installed and tested. A front-end screen alone cannot secure the data.
- A message soft delete preserves the row. It is not a privacy-erasure guarantee.
- Back up important data before applying SQL migrations, deleting accounts, or making bulk changes.

## Troubleshooting

**The app says the account has no membership or access is unavailable**  
Check that a `public.memberships` row exists for the Auth UID and that `status` is `active`. Also check that a matching `public.profiles` row exists.

**The member site shows a dash for the name in Supabase Auth**  
The Auth display-name metadata is separate. Check `public.profiles.display_name`, which is what the app uses.

**A member cannot get past the first-login screen**  
Confirm that the password-change migration and trigger are installed, that the member is using the current app deployment, and that their membership flag is set correctly. Do not manually clear the flag to hide a failure unless you have confirmed the member changed the temporary password.

**The admin page denies access**  
Check that your own Auth UID has an active `public.memberships` row with `role = administrator`, that the onboarding flag is false for your own account, and that the required RLS policies are installed.

**An admin action reports a permissions or RLS error**  
Do not add a service-role key to the frontend. Check the relevant policy and table permissions, then fix them through a reviewed database migration.
