---
"@editkraft/schema": minor
"@editkraft/react": minor
"editkraft": patch
---

Content editing complete — validated by two real customer onboardings:

- **Rich text**: the sanitizer allowlist now covers `ul`/`ol`/`li`,
  `blockquote`, `code`, and the void tags `br`/`hr`; links may carry
  `target="_blank"` (then `rel="noopener noreferrer"` is enforced — attributes
  are still rebuilt, never passed through). The tree format is unchanged:
  `SCHEMA_VERSION` stays 0.1.0, older renderers strip the new tags gracefully.
- **`ekSelect`** — new field primitive for strict choices (icon keys, layout
  variants): `ekSelect({ options: [{ value, label? }], label? })`. Validation
  is a strict enum; the field metadata (`kind: "select"` with options) travels
  through block descriptors and the preview protocol.
- **Preview editing UI** (`@editkraft/react`): toolbar buttons for bullet/
  numbered lists and blockquote; select fields open an options popover and
  write immediately via `ek:update` (no contenteditable on select fields).
- **CLI template**: the preview client documents how to render the site
  chrome (header/footer from a route-group layout) around the preview in a
  `pointer-events-none` wrapper.
