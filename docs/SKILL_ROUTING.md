# Skill & Command Routing Reference

Quick-reference for which skill/command to invoke and when.

## Primary Skills (reach for these first)

| Command | When to use |
|---|---|
| `/workon` | Start a new debug session on the next best bug from HANDOFF_MASTER |
| `/handoff` | End a session — update HANDOFF_MASTER and bug docs, no code changes |
| `/deploy` | Run the full deployment flow (build, push, verify) |
| `/test` | Run the end-to-end test suite and report results |
| `/execute` | Full autonomous execution of a named task — no pauses, no questions |
| `/systematic-debugging` | Hit a bug or unexpected behavior — invoke before proposing any fix |
| `/otproduct` | Product strategy, feature prioritization, roadmap decisions |
| `/branding` | Copy, tone, visual identity, brand-consistency questions |

## Fallback Skills (use when the situation calls for it)

| Command | When to use |
|---|---|
| `/simplify` | After code changes — review for reuse, quality, and efficiency |
| `/webapp-testing` | Interact with local app via Playwright (screenshots, clicks, browser logs) |
| `/next-best-practices` | Writing or reviewing Next.js code (RSC, routing, metadata, async APIs) |
| `/vercel-react-best-practices` | Writing or reviewing React components for performance |
| `/supabase-postgres-best-practices` | Writing or reviewing SQL, schema design, or DB configuration |
| `/claude-api` | Building or debugging code that imports the Anthropic SDK |
| `/loop` | Run a prompt or command on a recurring interval (polling, status checks) |
| `/schedule` | Create cron-based remote agents for scheduled recurring tasks |
| `/skill-creator` | Create new skills, edit existing ones, or run benchmarks |
| `/update-config` | Configure Claude Code settings.json or hooks |
| `/keybindings-help` | Customize keyboard shortcuts or rebind keys |

## Typical Workflows

**Bug fix session:**
`/workon` -> `/systematic-debugging` -> fix -> `/test` -> `/handoff`

**Ship a feature:**
`/execute` -> code -> `/simplify` -> `/test` -> `/deploy` -> `/handoff`

**Strategy / planning:**
`/otproduct` -> decide -> `/execute`

**End of day:**
`/handoff`
