Run the full OnlyTwins deployment flow:

1. Run `git status` — show what's staged/unstaged
2. If there are uncommitted changes, commit them with a descriptive message
3. Run `git push origin main`
4. Run `gh run list --limit 3` to show Vercel/CI pipeline status
5. Report deployment URL and final status

If the push fails or CI fails, diagnose and fix before reporting done.
