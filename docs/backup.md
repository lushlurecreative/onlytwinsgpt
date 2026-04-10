# OnlyTwins backup system

**Why this exists:** the business can survive a bad deploy or a dropped table
only if there is a clean recent copy of every critical layer. GitHub alone
is not a backup — it only covers code, and a force-push or account lockout
wipes it.

This doc describes the smallest complete backup system that protects the
four layers OnlyTwins actually depends on: **code, database, storage, env**.

---

## TL;DR

```bash
# one-time setup, optional
./scripts/backup/install-launchd.sh     # daily auto-run at 03:15 local

# manual full backup, any time
./scripts/backup/backup-all.sh

# individual layers
./scripts/backup/backup-code.sh
./scripts/backup/backup-db.sh
./scripts/backup/backup-storage.sh
./scripts/backup/backup-env.sh
```

Backups are written to `$HOME/onlytwins-backups/`. Never inside the repo.

---

## Layers

### A. Code / repo
**Primary:** GitHub remote at `lushlurecreative/onlytwinsgpt`.
**Local backup:** `scripts/backup/backup-code.sh` creates on every run:
- A **git bundle** (`onlytwins-<ts>.bundle`) — contains all refs and full
  history. Restore with `git clone <bundle>`.
- A **source tarball** (`onlytwins-src-<ts>.tar.gz`) — working tree only,
  excludes `node_modules/`, `.next/`, `.git/`, `.vercel/`, test outputs.
- A **manifest** capturing HEAD SHA, branch, remote URL, and dirty files so
  each snapshot is self-describing.

Retention: newest 14 by default (`KEEP_CODE` env var to override).

### B. Database
Source: Supabase Postgres (`labqtctlgntdgkawjuul`).

`scripts/backup/backup-db.sh` produces:
- `schema-<ts>.sql.gz` — structure only (tables, functions, RLS, indexes)
- `data-<ts>.sql.gz` — data only (`COPY` statements)

Uses `pg_dump` directly with `PG*` env vars parsed from `DATABASE_URL`. No
Docker required. The script fails fast with a specific remediation if:
- `DATABASE_URL` is missing → tells you to set it
- Auth fails → tells you to rotate the Supabase DB password
- Postgres client version mismatch → tells you which `brew install
  postgresql@N` to run

**Safety net:** Supabase's own daily backups still exist and are the
authoritative recovery tool for production. Project Settings → Backups.
The local dump is your "oh no I need this in the next 5 minutes" copy.

Retention: newest 14 by default (`KEEP_DB` env var to override).

Files are chmod 600. They contain production data.

### C. Storage / uploads bucket
Source: Supabase Storage bucket `uploads` — training photos, generated
content, watermark temp files.

`scripts/backup/backup-storage.sh` → `backup-storage.ts` mirrors the entire
bucket to `$HOME/onlytwins-backups/storage/uploads/` using the service role
key.

**Incremental**: if a local file already exists and matches the remote
object size, it is skipped. First run downloads everything; subsequent runs
only pull new/changed objects.

Never deleted by the backup — use `rclone sync` (or similar) manually if
you want mirror-style deletion. This is a write-only mirror to guard
against accidental deletions on the Supabase side.

### D. Env / config
`scripts/backup/backup-env.sh` captures:
- `env-local-<ts>.env` — copy of `.env.local` (chmod 600)
- `env-vercel-prod-<ts>.env` — pulled via `vercel env pull --environment=production`
  if the repo is `vercel link`-ed
- `manifest-<ts>.md` — a pointer list of config that lives **outside** what
  can be exported automatically

Retention: newest 14 by default.

#### What the env manifest documents

| Service | What lives there | How to back up |
|---|---|---|
| Vercel | env vars + project settings | `vercel env pull` (automated); `vercel.json` in git |
| Supabase | schema, data, RLS, uploads | `backup-db.sh` + `backup-storage.sh` |
| Supabase | Auth providers, email templates | **manual** dashboard export |
| Supabase | Edge functions (if any) | `supabase functions download <name>` |
| RunPod | API key, endpoint ID | captured via `.env.local` |
| RunPod | Serverless endpoint config | **manual** screenshot/copy from dashboard |
| RunPod | Container image definition | tracked in git (`.github/workflows/build-worker-image.yml`, `worker/Dockerfile`) |
| GitHub | repo + history | git bundle + GitHub |
| GitHub Actions | secret **values** | **cannot be exported** — keep a plaintext list of secret *names* in `docs/env-vars.md` |
| GitHub | branch protection rules | **manual** screenshot |
| Stripe | API keys, webhook secrets | captured via `.env.local` |
| Stripe | products, prices, webhooks | **cannot be exported** — document price IDs in `docs/stripe-billing.md` |
| Local | `.mcp.json` | contains keys; gitignored; copy by hand if needed |

---

## Where things live

```
$HOME/onlytwins-backups/
├── LAST_RUN.txt
├── launchd.log                   (only if install-launchd.sh was run)
├── code/
│   ├── onlytwins-<ts>.bundle
│   ├── onlytwins-<ts>.manifest.txt
│   └── onlytwins-src-<ts>.tar.gz
├── db/
│   ├── schema-<ts>.sql.gz        (chmod 600)
│   └── data-<ts>.sql.gz          (chmod 600)
├── storage/
│   └── uploads/                  (mirror of Supabase bucket)
└── env/
    ├── env-local-<ts>.env        (chmod 600)
    ├── env-vercel-prod-<ts>.env  (chmod 600)
    └── manifest-<ts>.md
```

The root directory is chmod 700. Secret files are chmod 600.

**The output root lives outside the repo.** The repo's `.gitignore` also
excludes `/backups/`, `/onlytwins-backups/`, `*.bundle`, `*.sql.gz` as a
belt-and-braces guard in case you override `BACKUP_ROOT` to a path inside
the repo.

---

## Automation

### Daily (opt-in)
`./scripts/backup/install-launchd.sh` installs a launchd agent that runs
`backup-all.sh` every day at 03:15 local time. Output goes to
`$HOME/onlytwins-backups/launchd.log`.

To run immediately: `launchctl start com.onlytwins.backup`
To uninstall: `launchctl unload ~/Library/LaunchAgents/com.onlytwins.backup.plist && rm ~/Library/LaunchAgents/com.onlytwins.backup.plist`

### After pushing to main (optional)
Add this as a git post-push hook if you want a snapshot every time you push:

```bash
# .git/hooks/post-push   (not tracked by git)
#!/usr/bin/env bash
bash scripts/backup/backup-code.sh
```

Not installed by default to avoid slowing down normal pushes.

---

## Restore

See `scripts/backup/restore-guide.md`. Kept next to the scripts so it is
findable from the backup artefacts themselves.

Short version:
- **Code:** `git clone <bundle>` or `tar xzf <src>.tar.gz`
- **DB:** `gunzip -c <schema>.gz | psql "$DATABASE_URL"` then the data file
- **Storage:** push `$HOME/onlytwins-backups/storage/uploads/` back with
  rclone or a short Node script
- **Env:** copy `env-local-*.env` back to `.env.local`; re-apply Vercel env
  vars via dashboard or `vercel env add`

---

## Security rules

1. **Output directory is NEVER inside the repo.** Default is `$HOME/onlytwins-backups/`.
   If you override `BACKUP_ROOT`, keep it outside the working tree.
2. **All secret files are chmod 600.** Verify with `ls -la $HOME/onlytwins-backups/{db,env}/`.
3. **Never commit the `backups/` directory.** `.gitignore` already blocks
   it, plus `*.bundle` and `*.sql.gz`. Do not remove those patterns.
4. **Do not send DB dumps or env files over Slack / email / pastebins.**
   If you need to move them between machines, use an encrypted archive
   (`gpg -c`) or a direct SSH/SCP transfer.
5. **Rotate the Supabase DB password** if a backup file may have been
   exposed — all backed-up credentials become invalid.
