# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e6] [cursor=pointer]:
    - button "Open Next.js Dev Tools" [ref=e7]:
      - img [ref=e8]
    - generic [ref=e11]:
      - button "Open issues overlay" [ref=e12]:
        - generic [ref=e13]:
          - generic [ref=e14]: "0"
          - generic [ref=e15]: "1"
        - generic [ref=e16]: Issue
      - button "Collapse issues badge" [ref=e17]:
        - img [ref=e18]
  - navigation [ref=e20]:
    - generic [ref=e21]:
      - link "Tracklist" [ref=e22] [cursor=pointer]:
        - /url: /
      - searchbox "Search" [ref=e25]
      - generic [ref=e26]:
        - link "Feed" [ref=e27] [cursor=pointer]:
          - /url: /feed
        - link "Sign in" [ref=e28] [cursor=pointer]:
          - /url: /auth/signin
  - main [ref=e29]:
    - generic [ref=e30]:
      - heading "Page not found" [level=1] [ref=e31]
      - paragraph [ref=e32]: The page you’re looking for doesn’t exist.
      - link "Go home" [ref=e33] [cursor=pointer]:
        - /url: /
  - alert [ref=e34]
```