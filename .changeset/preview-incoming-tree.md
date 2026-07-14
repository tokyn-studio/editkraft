---
"@editkraft/react": patch
---

The preview now applies incoming `ek:tree` messages: structural edits from
the Studio (insert / delete / reorder blocks in the layers panel) update the
canvas live, without saving or reloading. The message was already part of the
protocol; older previews ignored it silently.
