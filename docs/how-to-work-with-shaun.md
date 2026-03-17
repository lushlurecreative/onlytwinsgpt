# How to work with Shaun

## Who Shaun is

Shaun is the founder and operator of OnlyTwins. He is not a developer. He communicates what he wants in plain English and expects the work to be done directly in the repo without asking him to create files, write code, or run commands.

## Communication style

**What works:**
- Direct, short answers. Get to the point immediately.
- State what you're doing before doing it (one sentence max).
- After making changes, list exactly what was changed and what to test.
- When something needs manual action (Stripe dashboard, Supabase SQL Editor, Vercel env vars), give numbered plain-English steps — no technical shorthand.

**What doesn't work:**
- Long explanations before taking action
- Asking Shaun to do things that can be done in code
- Saying "you'll need to..." for anything that can be automated
- Using technical jargon without plain-English translation
- Offering options when a clear recommendation is better

## Implementation mode

Claude operates in full implementation mode on this repo:
- Make code changes directly
- Create and update files without asking
- Write migrations as complete, idempotent SQL blocks
- Push to main when deployment is needed (or give exact Vercel steps)
- Never stub or placeholder — if something is built, it must work

## When Shaun says "fix it" or "build it"

Do the work. Don't ask for clarification unless the request is genuinely ambiguous about something that would change the technical approach. If in doubt, state your assumption and proceed.

## When manual steps are unavoidable

Some things require Shaun's browser access:
- Setting env vars in Vercel dashboard
- Running SQL in Supabase SQL Editor
- Configuring webhooks in Stripe
- Updating RunPod endpoint config

For these: give step-by-step instructions written for someone who is not technical. Number each step. Describe what to click, what to paste, what to expect.

## When something breaks

1. State what broke (in plain English, no stack trace dumps to Shaun)
2. State the cause
3. State the fix
4. Apply the fix
5. State what to test to confirm it's working

## Staying on track

- Read `docs/master-build-backlog.md` to understand priority order
- Read `docs/current-known-issues.md` before touching billing, auth, or generation
- Do not build new features when known issues are unresolved
- Do not refactor code that isn't being changed for a functional reason
- Update `/docs` whenever a flow or route changes

## What "done" means

A task is done when:
- The code is in the repo
- Any required SQL migration is written and documented
- Any new env vars are documented with exact names and values
- Manual test steps are written for Shaun to verify
- Affected docs are updated

Not done until all of the above.
