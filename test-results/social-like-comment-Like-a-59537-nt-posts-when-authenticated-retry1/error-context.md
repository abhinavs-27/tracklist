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
        - link "A Profile" [ref=e28] [cursor=pointer]:
          - /url: /profile/alice
          - generic [ref=e29]: A
          - generic [ref=e30]: Profile
        - button "Sign out" [ref=e31]
  - main [ref=e32]:
    - generic [ref=e33]:
      - heading "Page not found" [level=1] [ref=e34]
      - paragraph [ref=e35]: The page you’re looking for doesn’t exist.
      - link "Go home" [ref=e36] [cursor=pointer]:
        - /url: /
  - alert [ref=e37]
```