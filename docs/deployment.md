# Deployment

## Vercel deploy flow

The app deploys automatically from GitHub. No manual build step.

1. Commit and push changes to `main`
2. Vercel detects the push and triggers a build
3. Build typically completes in 2-4 minutes
4. New deployment goes live automatically
5. Monitor the Vercel dashboard for build errors

**Branch → environment mapping:**
- `main` → production

There is no separate staging environment unless one has been configured in Vercel. All code pushed to `main` goes to production.

## Pre-push checklist

Before pushing to `main`:
- [ ] TypeScript compiles cleanly (`npm run build` locally if needed)
- [ ] Any new env vars are set in Vercel before deploy (deploy will fail or behave incorrectly without them)
- [ ] If schema changes were made: migration is ready to run in Supabase
- [ ] If new Stripe price IDs are needed: they are created in Stripe and set as env vars
- [ ] Manual test for any billing, auth, or generation changes (see `docs/testing-checklist.md`)

## Supabase migration rules

**Schema changes must be applied manually.** Vercel deploys do not run migrations.

### Running a migration

1. Open Supabase Dashboard → SQL Editor
2. Paste the contents of the migration file
3. Run it
4. Confirm no errors

### Migration file requirements

- File name: `YYYYMMDDNNNN_description.sql` in `supabase/migrations/`
- Must be idempotent: use `IF NOT EXISTS`, `IF EXISTS`, drop constraints before recreating
- Must include `GRANT` statements for new tables
- Must include RLS policies for tables with user data
- Test in Supabase SQL editor before deploying

### Migration → deploy order

Always run the migration **before** pushing code that depends on the new columns. If you push code that references a column that doesn't exist yet, the app will 500.

**Order:** Run SQL in Supabase → push code to `main` → verify deploy

## Rollback process

### Code rollback

Vercel keeps all previous deployments. To rollback:
1. Vercel Dashboard → Deployments
2. Find the last working deployment
3. Click "Promote to Production"

This is instant — no rebuild required.

### Database rollback

There is no automatic DB rollback. If a migration introduced bad data or broke a constraint:

1. **Immediately** rollback the Vercel deployment (above) to stop further writes
2. Write a reverse migration SQL:
   - Drop added columns: `ALTER TABLE foo DROP COLUMN IF EXISTS bar;`
   - Drop added tables: `DROP TABLE IF EXISTS foo;`
   - Restore old constraints: drop new, recreate old
3. Run the reverse migration in Supabase SQL Editor
4. Verify the app is functioning

**Never run destructive migrations on the production database without a rollback plan.**

### Checkpoint process

Before any risky change (schema change, billing flow change, auth change):

1. Note the current Vercel deployment URL (the "current" deployment in the dashboard)
2. Write the migration SQL file and verify it is idempotent
3. Create a feature branch if the change is large
4. Run the migration in Supabase
5. Deploy and test
6. If something breaks: revert Vercel deployment immediately, then reverse the DB change

## Environment variables

All env vars live in Vercel → Project → Settings → Environment Variables.

When adding a new required env var:
1. Add it to Vercel **before** pushing code that uses it
2. Add it to `.env.example` with a comment
3. Document it in `docs/env-vars.md`

When changing a Stripe price ID:
1. Create the new price in Stripe Dashboard
2. Update the env var in Vercel
3. Trigger a redeployment (Vercel will pick up the new value)

## Cron jobs

Cron jobs are defined in `vercel.json` and run on Vercel's infrastructure. They authenticate using `CRON_SECRET`.

To test a cron job manually:
```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://onlytwins.dev/api/cron/process-customer-generation
```

Cron schedule (UTC):
| Time | Job |
|---|---|
| 8am | `/api/cron/daily-lead-scrape` |
| 9am | `/api/cron/enqueue-lead-samples` |
| 10am | `/api/cron/send-outreach` |
| 12pm | `/api/cron/process-customer-generation` |
| Midnight | `/api/cron/monthly-customer-generation` |

## Deployment notes template

When documenting a deploy, include:

```
## Deploy: [date] — [description]

SQL required: yes / no
If yes:
  Migration file: supabase/migrations/YYYYMMDDNNNN_description.sql
  Run before or after deploy: before / after

New env vars required: yes / no
If yes:
  VAR_NAME=description of value

Rollback plan:
  Code: revert to deployment [URL]
  DB: [reverse SQL if applicable]

Test steps:
  [reference testing-checklist sections]
```
