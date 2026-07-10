---
"@editkraft/schema": minor
"@editkraft/react": minor
---

Rich-text formatting, link editing and image tools in the live preview:

- Schema: rich-text allowlist extended by p/h2/h3/u/s; `ekImageValue.frame`
  (non-destructive 1:1 framing) plus `imageFrameStyles()` as a shared render
  helper for preview and published pages
- React: floating formatting toolbar (B/I/U/S, paragraph/H2/H3, links),
  link popover (URL/mail/tel, button and inline links), image popover
  (replace, crop/frame, AI-edit hook), all wired through the existing
  postMessage bridge
