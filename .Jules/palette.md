# Palette's Journal

## 2025-05-14 - [Aria-label vs Aria-pressed for Toggle Buttons]
**Learning:** For interactive toggle buttons (e.g., Like buttons), avoid using a dynamic `aria-label` that changes with the state (e.g., "Like" -> "Unlike"). This can lead to redundant or confusing announcements when combined with `aria-pressed`. Screen readers are already designed to announce the "pressed" state.
**Action:** Use a static `aria-label` (e.g., "Like") and rely on `aria-pressed` to communicate the toggled state. Ensure that any dynamic content within the button (like a count) remains accessible to screen readers so updates are announced.
