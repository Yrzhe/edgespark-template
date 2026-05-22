/**
 * Database Relations — app-level Drizzle relations for typed nested queries.
 */

import { relations } from "drizzle-orm";
import { sites, versions, files, baasCollections } from "./db_schema";

export const sitesRelations = relations(sites, ({ many }) => ({
  versions: many(versions),
  collections: many(baasCollections),
}));

export const versionsRelations = relations(versions, ({ one, many }) => ({
  site: one(sites, { fields: [versions.siteId], references: [sites.id] }),
  files: many(files),
}));

export const filesRelations = relations(files, ({ one }) => ({
  version: one(versions, { fields: [files.versionId], references: [versions.id] }),
}));

export const baasCollectionsRelations = relations(baasCollections, ({ one }) => ({
  site: one(sites, { fields: [baasCollections.siteId], references: [sites.id] }),
}));
