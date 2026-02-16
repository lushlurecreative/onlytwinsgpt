# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - heading "OnlyTwins Login" [level=1] [ref=e3]
    - paragraph [ref=e4]:
      - text: "Redirect after login:"
      - code [ref=e5]: /upload
    - generic [ref=e6]: Email
    - textbox [ref=e7]
    - generic [ref=e8]: Password
    - textbox [ref=e9]
    - generic [ref=e10]:
      - button "Sign up" [ref=e11]
      - button "Sign in" [ref=e12]
      - button "Sign out" [ref=e13]
    - paragraph
    - paragraph [ref=e14]:
      - text: After signing in, go to
      - code [ref=e15]: /me
  - button "Open Next.js Dev Tools" [ref=e21] [cursor=pointer]:
    - img [ref=e22]
  - alert [ref=e25]
```