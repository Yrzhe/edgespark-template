export * from "./db_schema";
export * from "./db_relations";
export * from "../__generated__/sys_schema";
export * from "../__generated__/sys_relations";

import * as buckets from "./storage_schema";
export { buckets };

export type { SecretKey, VarKey } from "./runtime";

import * as _system from "../__generated__/sys_schema";
import * as _systemRels from "../__generated__/sys_relations";
import * as _user from "./db_schema";
import * as _userRels from "./db_relations";

export const drizzleSchema = { ..._user, ..._userRels, ..._system, ..._systemRels };
