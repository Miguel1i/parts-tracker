export * from "./schema";
export { createDb, getDb, resolveDatabaseUrl, DEFAULT_DATABASE_URL, type Db } from "./client";
export {
  ensureLegacyPlaceholder,
  firstAdminId,
  normalizeUsername,
  promoteAdmin,
  LEGACY_ADMIN_EMAIL,
  LEGACY_ADMIN_USER_ID,
  type PromoteOptions,
  type PromoteResult,
} from "./admin";
