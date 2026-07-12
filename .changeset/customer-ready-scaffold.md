---
"editkraft": minor
"@editkraft/react": patch
---

Customer-ready scaffold — learnings from the first real end-to-end onboarding:

- `init` now scaffolds the public render route (`app/[...slug]/page.tsx`) serving
  published pages incl. `generateMetadata`; existing static routes always win.
- The example Hero block carries `data-ek-field` on every editable element and
  documents the inline-editing contract (blocks without the attribute render but
  cannot be edited in the Studio).
- Preview client template documents the provider requirement for apps whose
  components need React context (next-intl, themes).
- "Next steps" now covers installing `@supabase/supabase-js`, the i18n route
  placement, and the middleware-matcher exclusion for the Studio preview.
- `.env.editkraft.example` points to the real Studio origin.
- `@editkraft/react`: README documents the `data-ek-field` inline-editing
  contract and the slots-over-lists modelling rule.
