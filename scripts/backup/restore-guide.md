# OnlyTwins backup restore guide

Restoring from a backup is a rare, stressful operation. This file tells you
exactly which file to use for each layer. Keep it with the backups themselves
so it's findable without network access.

Default backup root: `$HOME/onlytwins-backups/`

## Restore the code

### From the git bundle (preferred — full history)
```bash
git clone $HOME/onlytwins-backups/code/onlytwins-<timestamp>.bundle onlytwins-restored
cd onlytwins-restored
git remote set-url origin https://github.com/lushlurecreative/onlytwinsgpt.git
```

### From the source tarball (working tree only)
```bash
mkdir onlytwins-restored && cd onlytwins-restored
tar xzf $HOME/onlytwins-backups/code/onlytwins-src-<timestamp>.tar.gz
```

Always check `onlytwins-<timestamp>.manifest.txt` first — it records the HEAD
commit the snapshot was taken from.

## Restore the database

**Order matters.** Restore schema before data.

```bash
# From .env.local: DATABASE_URL
export DATABASE_URL='postgresql://...'

gunzip -c $HOME/onlytwins-backups/db/schema-<ts>.sql.gz | psql "$DATABASE_URL"
gunzip -c $HOME/onlytwins-backups/db/data-<ts>.sql.gz   | psql "$DATABASE_URL"
```

If restoring into a **fresh** project, also run `roles-<ts>.sql.gz` first.

⚠️ Never restore into production without taking a fresh dump right before —
you will overwrite current data. If the goal is partial recovery, load the
dump into a scratch database and copy the rows you need.

## Restore storage (uploads bucket)

The local mirror at `$HOME/onlytwins-backups/storage/uploads/` is a 1:1 copy
of the bucket. To push it back into Supabase:

```bash
# Install rclone once: brew install rclone
# Configure with Supabase S3-compatible credentials
# (Supabase Dashboard → Settings → Storage → S3 connection)
rclone sync $HOME/onlytwins-backups/storage/uploads/ supabase:uploads/
```

Or use a small script that iterates files and calls
`supabase.storage.from('uploads').upload(path, buffer)`.

## Restore env / config

1. `env-local-<ts>.env` → copy to `./.env.local`
2. `env-vercel-prod-<ts>.env` → re-apply via `vercel env add` or paste into
   Vercel Dashboard → Settings → Environment Variables
3. `manifest-<ts>.md` → lists everything that lives outside the automated
   dumps (Supabase Auth config, RunPod template, Stripe products, GitHub
   Actions secrets). Each of those must be reconfigured by hand — they
   cannot be exported programmatically.
