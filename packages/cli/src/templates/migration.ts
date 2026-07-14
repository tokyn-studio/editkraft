// Die ek_-Migrations-SQL ist Teil des Contracts und lebt in @editkraft/schema
// (Single Source of Truth — das Studio spielt sie über die Management-API ein).
// Das CLI konsumiert sie von dort; `migrationSql` bleibt als lokaler Name erhalten.
export {
  initMigration as migrationSql,
  i18nMigration,
  globalsMigration,
  symbolsMigration,
  collectionsMigration,
} from "@editkraft/schema";
