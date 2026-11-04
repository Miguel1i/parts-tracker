export * from "./schema";
export { createDb, getDb, resolveDatabaseUrl, DEFAULT_DATABASE_URL, type Db } from "./client";
export {
  ensureLegacyPlaceholder,
  firstAdminId,
  promoteAdmin,
  LEGACY_ADMIN_EMAIL,
  LEGACY_ADMIN_USER_ID,
  type PromoteResult,
} from "./admin";
