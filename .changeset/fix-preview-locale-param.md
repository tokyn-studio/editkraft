---
"editkraft": patch
---

The scaffolded preview route (`app/editkraft/preview/[[...slug]]/page.tsx`,
written by `editkraft init`) now reads an optional `?locale=` search param
and passes it — plus the project's configured `defaultLocale` — through to
`loadDraftContent`. Pairs with the `@editkraft/react` patch that fixes
`loadDraftContent`'s multi-locale crash (it no longer throws without a
locale filter, but the correct translation's draft is only shown when
`locale` is passed explicitly). Existing projects should re-run `editkraft
init` to pick up the updated template.
