Run the OnlyTwins end-to-end test suite and report results:

1. Check if dev server is running on localhost:3000 — start it if not (`npm run dev`)
2. Run `npx playwright test --reporter=list`
3. Report: total passed, total failed, any errors with file + line number
4. For each failure, show the error message and suggest a fix

Focus on billing, auth, and upload flows first — these are Phase A critical paths.
