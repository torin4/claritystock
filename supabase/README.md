# Clarity Stock — Supabase Setup Guide

## 1. Run schema.sql in the SQL Editor

1. Open your Supabase project dashboard.
2. Go to **SQL Editor** in the left sidebar.
3. Click **New query**.
4. Copy the full contents of `schema.sql` and paste them into the editor.
5. Click **Run** (or press Cmd/Ctrl + Enter).
6. Confirm there are no errors in the output panel. All tables, indexes, RLS policies, and the `record_download` function will be created.

---

## 2. Create the 'photos' Storage Bucket

1. Go to **Storage** in the left sidebar.
2. Click **New bucket**.
3. Set the following options:
   - **Name:** `photos`
   - **Public bucket:** off (keep private)
   - **File size limit:** `50` MB
4. Click **Save**.

The storage RLS policies defined in `schema.sql` control read, upload, and delete access — no additional bucket-level policy configuration is needed beyond what the SQL file creates.

---

## 3. Configure Google OAuth Provider

1. Go to **Authentication** > **Providers** in the left sidebar.
2. Find **Google** in the provider list and click to expand it.
3. Toggle **Enable Google provider** on.
4. Paste your **Google Client ID** and **Google Client Secret** from the Google Cloud Console (OAuth 2.0 credentials).
5. Copy the **Callback URL (Redirect URI)** shown in the Supabase dashboard (it looks like `https://<project-ref>.supabase.co/auth/v1/callback`).
6. Add that redirect URL to your Google OAuth app's **Authorized redirect URIs** in the Google Cloud Console.
7. Click **Save** in Supabase.

---

## 4. Enable Realtime for the Downloads Table

1. Go to **Database** > **Replication** in the left sidebar.
2. Under **Supabase Realtime**, find the `downloads` table in the `public` schema.
3. Toggle the switch to enable replication for `downloads`.
4. Click **Save** if prompted.

Clients can now subscribe to INSERT events on `downloads` using the Supabase Realtime client.

---

## 5. Creating Admin Accounts

Admin accounts are managed manually — there is no self-serve admin sign-up flow.

To promote a user to admin:

1. Have the user sign in at least once so a row exists in `public.users`.
2. Go to **Table Editor** > `users` table (or use the SQL Editor).
3. Find the user's row by name or email.
4. Set the `role` column value to `admin`.
5. Save the change.

The user's role is read from `public.users.role` in the app. Any value other than `admin` is treated as a standard photographer account.

---

## 6. Admin RLS (proxy upload + full library access)

After `schema.sql` and later migrations, apply **`migrations/20260324120000_admin_rls_policies.sql`** (or run via `supabase db push`). This adds `public.is_admin()` and policies so users with `public.users.role = 'admin'` can read/write all photos and collections and delete any file in the `photos` storage bucket.

In the app, admins get **Admin** in the sidebar and can use **`/admin`** to upload photos on behalf of a selected photographer (files land in that user’s storage prefix with `photographer_id` set correctly).
