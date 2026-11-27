# Security model (Phase 1)

Three locks, from outside in:

1. **Proxy** (`src/proxy.ts`): refreshes the Supabase session on every request and sends
   signed-out visitors to `/sign-in`. Optimistic only.
2. **Data access layer** (`src/lib/auth.ts`): every page and server action calls
   `requireWorkspace()` / `requirePermission()`; actions also check `can(role, …)` before writing.
3. **Row-level security** in Postgres: the final authority. The app talks to Supabase only as the
   signed-in user (publishable key + user session). There is **no service-role client in the app**;
   the secret key is used only by `scripts/bootstrap.ts` and `scripts/invite.ts` on an admin's machine.

## Roles (per organization, `public.memberships.role`)

| | Clients | Contacts | Projects | Assign team | Settings / audit |
| --- | --- | --- | --- | --- | --- |
| `admin` | read, write, delete | read, write, delete | read, write, delete | ✓ | ✓ |
| `project_manager` | read, write | read, write, delete | read, write | ✓ | — |
| `team` | only clients of their projects | — | only assigned projects | — | — |
| `finance` | read | read | read | — | — |
| `marketing` | read, write | read, write | — | — | — |

Memberships and roles can't be changed from the app at all (no UPDATE/INSERT grant); only the
admin scripts can. Users can edit their own name/avatar/locale, never their email.

## Database guarantees

- RLS enabled on every table; `anon` has no privileges on any table.
- Composite foreign keys `(organization_id, …)` make cross-organization links impossible
  (a project can't point at another organization's client; you can't assign someone from another
  organization).
- `organization_id` can never be changed on an existing row (trigger).
- `created_by` must equal the signed-in user (no spoofing).
- Duplicate companies are blocked per organization by name (case/whitespace-insensitive) and domain.
- Every insert/update/delete on memberships, clients, contacts, projects and assignments, plus
  organization changes, is written to `audit_logs` with the actor; only admins can read it, and
  nobody can edit or delete it from the app.
- Policy helper functions live in a `private` schema that isn't exposed through the API.

## Tested

`tests/db/rls.test.ts` runs the real migration in an in-memory Postgres (PGlite) on top of a
Supabase stand-in (`supabase/tests/support/supabase-stub.sql`) and checks all of the above with
eight users across two organizations, including the negative cases. Loosening a policy was
confirmed to make the suite fail.

Not covered by the local tests: Supabase's real Auth service, email links and cookie handling.
Verify those once a development Supabase project is connected.

## Other measures

- Sign-in errors don't reveal whether an email has an account; emailed sign-in links are only
  sent to existing users.
- `?next=` redirects are limited to paths inside the app (`src/lib/safe-redirect.ts`).
- Client websites are normalized to `http(s)` URLs before being rendered as links.
- Database errors are mapped to friendly messages; raw errors aren't sent to the browser.
