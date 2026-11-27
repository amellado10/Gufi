# Setup

Güfi OS runs on **Supabase** (database + login), **Vercel** (hosting) and **GitHub** (code).
Nothing below has been done yet: each step needs someone with access to those accounts.

## 1. Supabase project

1. Create a project (or use an existing **non-production** one for development).
2. **Project Settings → API**: copy the project URL and the **publishable** key into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   ```
3. Copy the **secret** key into `.env.local` as `SUPABASE_SECRET_KEY`. It is used only by the
   admin scripts in `scripts/` on your machine. Never add it to Vercel with a `NEXT_PUBLIC_` prefix,
   and never import it from `src/`.
4. Apply the database migration:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npm run db:push          # applies supabase/migrations/*
   npm run db:types         # regenerates src/types/database.ts from the real schema
   ```
   (Or paste `supabase/migrations/20261127000001_foundation.sql` into the SQL editor once.)

## 2. Supabase Auth settings

- **Authentication → Sign In / Providers → Email**: enabled. **Allow new users to sign up: OFF**
  (invitation only; the app also never creates users on sign-in).
- **Authentication → URL Configuration**: Site URL = your app URL (`http://localhost:3000` locally,
  the Vercel URL in production). Add both to **Redirect URLs**.
- **Authentication → Email Templates**: the app verifies links on the server at `/auth/confirm`.
  Change the link in these templates:

  | Template | Link |
  | --- | --- |
  | Invite user | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` |
  | Magic link | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink` |
  | Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` |
  | Change email | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change` |

- Supabase's built-in email sender is rate-limited. Before inviting the team, set up custom SMTP
  (e.g. Resend) under **Authentication → SMTP**.

## 3. Create the workspace and the first admin

```bash
npm run bootstrap -- --name "Güfi" --slug gufi --timezone America/Puerto_Rico --currency USD \
  --admin you@gufi.io --admin-name "Your Name"
```

The admin gets an invitation email, chooses a password and lands on the Overview.
Invite more people (or change someone's role):

```bash
npm run invite -- --org gufi --email designer@gufi.io --role team --name "Name" --title "Designer"
```

Roles: `admin`, `project_manager`, `team` (design & development), `finance`, `marketing`.
See [security.md](security.md) for what each can see.

## 4. GitHub

The local repository is on branch `main` with no remote yet. Create an empty private repository
on GitHub, then:

```bash
git remote add origin git@github.com:<owner>/gufi-os.git
git push -u origin main
```

## 5. Vercel

1. Import the GitHub repository in Vercel (framework: Next.js; defaults are fine).
2. **Settings → Environment Variables** for Preview and Production:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`.
   Do **not** add `SUPABASE_SECRET_KEY`: the deployed app doesn't need it.
   `NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing them.
3. Use a separate Supabase project for Preview deployments if you want to keep test data
   out of production.

Without the Supabase variables, every page redirects to `/setup`, which explains what's missing.

## Checks

```bash
npm test          # RLS + unit tests (no Docker or Supabase needed)
npm run lint
npm run typecheck
npm run build
```
