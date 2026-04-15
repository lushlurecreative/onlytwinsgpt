Start a new clean debug workflow.

Use only the current repo state, `docs/HANDOFF_MASTER.md`, and files in `docs/bugs/`.
Do not rely on prior chat history.

Goal:
Help me debug ONE thing only.

Behavior:
1. First inspect `docs/HANDOFF_MASTER.md` and all files in `docs/bugs/`.
2. Build a short list of active bug candidates.
3. If one bug is clearly the top next objective from the handoff, choose it automatically and say which one you chose.
4. If there is not one clearly best bug, show a numbered list of bug options and wait for me to reply with the number.
5. Once a single bug is selected, treat that bug file as the main working brief.
6. Stay in strict debug mode.
7. Do not refactor.
8. Do not make unrelated changes.
9. Do not claim fixed without proof.
10. Identify the failing layer first.
11. Give top 3 likely causes.
12. Choose ONE cause to test first.
13. Inspect/log/test before making changes.
14. Make the smallest possible fix only if evidence supports it.
15. Report evidence and result clearly.

Output format after a bug is selected:
- Selected bug
- Failing layer
- Top 3 causes
- First hypothesis
- Plan
- Evidence
- Minimal fix
- Verification
- Status: FIXED / PARTIAL / FAILED

If the docs are missing, stale, or inconsistent, say so clearly before continuing.
If multiple bugs are mixed together, force the session back to one bug only.
