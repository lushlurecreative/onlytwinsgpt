# Admin / customer data sources and why some users don’t show

## Data sources (sources of truth)

| Data | Source of truth | Notes |
|------|------------------|--------|
| **Auth users** | `auth.users` (Supabase Auth) | All signed-up accounts. Listed via `auth.admin.listUsers()`. |
| **Profiles** | `public.profiles` | One row per auth user (`id` = `auth.users.id`). |
| **Subscriptions** | `public.subscriptions` | Rows where `creator_id` = service creator and `subscriber_id` = user. `archived_at` IS NULL = active. |
| **Uploaded training assets** | Stored via subjects + storage; refs in `subjects`, `subjects_models`, `training_jobs` | Subject-owned; user owns subjects. |
| **Request preferences** | `public.recurring_request_mixes` (`user_id`) | Per-user. |
| **Subjects / models** | `public.subjects` (`user_id`), `public.subjects_models` (via `subject_id`) | User owns subjects. |
| **Generated content / posts** | `public.generation_requests`, `public.generation_request_lines`, `public.generation_jobs`, `public.posts` (`creator_id`) | User-linked. |
| **Usage** | `public.usage_ledger` (`user_id`) | Per-user. |
| **Admin payment links** | `public.admin_payment_links` | Rows keyed by `creator_id` (service); `email` = prospect. |

## Why `/admin/customers` showed no customers

- **Paid customers** on `/admin/customers` are loaded only from **`subscriptions`** where:
  - `creator_id` = service creator ID
  - `archived_at` IS NULL
- So the page only shows users who have at least one such subscription row.
- Any user who can log in and has data but has **no** subscription row for the service creator will **not** appear in the “Paid customers” list.

## Where OsborneInvestmentGroup@gmail.com (or any such user) still exists

Such a user can still exist in:

1. **`auth.users`** – can log in.
2. **`public.profiles`** – profile row for that user.
3. **`public.subjects`** – their subjects (training content).
4. **`public.subjects_models`** – models for those subjects.
5. **`public.generation_requests`** – their generation requests.
6. **`public.generation_request_lines`** – lines for those requests.
7. **`public.generation_jobs`** – jobs for those requests/subjects.
8. **`public.training_jobs`** – training jobs for their subjects.
9. **`public.recurring_request_mixes`** – request preferences.
10. **`public.usage_ledger`** – usage rows.
11. **`public.user_notifications`** – notifications.
12. **`public.creator_briefs`** – if present.
13. **`public.revenue_events`** – if present.
14. **`public.posts`** – if they have posts (`creator_id` = user).
15. **`public.admin_payment_links`** – only if there is a row where `email` = that address (as prospect).

They do **not** appear in **Paid customers** because there is no row in **`subscriptions`** with `creator_id` = service creator, `subscriber_id` = their user id, and `archived_at` IS NULL.

## Classification

- **Non-customer account** – has auth + profile (and possibly subjects, requests, etc.) but no subscription row for the service creator.
- **Orphaned account** – same as above; “orphaned” from the billing/customer list.
- **Subscription-less account** – same idea: no active subscription row, so not shown as a paid customer.

So: **OsborneInvestmentGroup@gmail.com** (or any similar account) is a **non-customer / subscription-less / orphaned** account: they exist in auth and profiles and other user-owned tables, but not in the paid-customer list because the list is driven only by `subscriptions`.

## What was added

- **Users / test accounts** – section on `/admin/customers` that lists **all non-admin auth users** (from `GET /api/admin/users`), so admin can see everyone, including non-paying and test accounts.
- **User reset tools** (`/admin/user-reset`) – delete single user by email or delete all test users (with confirmation).
- Full user delete cascades across the tables above so that when a user is removed, their data is removed too (see `lib/delete-user-cascade.ts`).
