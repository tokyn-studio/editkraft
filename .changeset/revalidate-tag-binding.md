---
"@editkraft/react": patch
---

Fix: published pages and globals now bind their read to the ISR cache tag
(`pageTag(slug)` / `globalsTag()`) via `unstable_cache`, so the revalidate
handler's `revalidateTag` actually invalidates them on publish. Previously the
read path never applied the tag, so `revalidateTag(pageTag(slug))` was a no-op
and published changes did not appear on the live site until the next redeploy.
