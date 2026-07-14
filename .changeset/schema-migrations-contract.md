---
"@editkraft/schema": minor
"editkraft": patch
---

Migrations-SQL als Contract exportiert: `initMigration`, `i18nMigration`, `globalsMigration`, `symbolsMigration`, `collectionsMigration` sowie `ekMigrations()`/`EK_MIGRATIONS` liefern die fünf ek_-Migrationen (Name + SQL) aus @editkraft/schema. Das CLI konsumiert die SQL von dort; die generierten Migrationsdateien bleiben byte-identisch.
