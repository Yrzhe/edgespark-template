/**
 * Database Relations — Perch app-level Drizzle relations.
 */

import { relations } from "drizzle-orm";
import { pages, links, analyticsEvents, dailyAnalyticsRollups } from "./db_schema";

export const pagesRelations = relations(pages, ({ many }) => ({
  links: many(links),
  analyticsEvents: many(analyticsEvents),
  dailyAnalyticsRollups: many(dailyAnalyticsRollups),
}));

export const linksRelations = relations(links, ({ one, many }) => ({
  page: one(pages, { fields: [links.pageId], references: [pages.id] }),
  analyticsEvents: many(analyticsEvents),
  dailyAnalyticsRollups: many(dailyAnalyticsRollups),
}));

export const analyticsEventsRelations = relations(analyticsEvents, ({ one }) => ({
  page: one(pages, { fields: [analyticsEvents.pageId], references: [pages.id] }),
  link: one(links, { fields: [analyticsEvents.linkId], references: [links.id] }),
}));

export const dailyAnalyticsRollupsRelations = relations(dailyAnalyticsRollups, ({ one }) => ({
  page: one(pages, { fields: [dailyAnalyticsRollups.pageId], references: [pages.id] }),
  link: one(links, { fields: [dailyAnalyticsRollups.linkId], references: [links.id] }),
}));
