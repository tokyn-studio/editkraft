---
"@editkraft/react": minor
---

The preview now reports its own runtime version to the Studio (a raw `ek:runtime-info` message with the `@editkraft/react` version, injected at build time). The Studio uses this to hint when a site runs an older runtime and to suggest `npx editkraft update`. Additive and backward compatible.
