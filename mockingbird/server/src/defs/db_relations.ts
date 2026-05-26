import { relations } from "drizzle-orm";
import { analyticsEvents, bioBlurbs, dailyAnalyticsRollups, images, imageUploadIntents, matchRules, previewRateLimits, projects, socials, themes, visitorCache } from "./db_schema";

export const themesRelations = relations(themes, ({ many }) => ({
  matchRules: many(matchRules),
  visitorCacheRows: many(visitorCache),
  analyticsEvents: many(analyticsEvents),
  dailyAnalyticsRollups: many(dailyAnalyticsRollups),
}));

export const matchRulesRelations = relations(matchRules, ({ one }) => ({
  theme: one(themes, { fields: [matchRules.themeId], references: [themes.id] }),
}));

export const imagesRelations = relations(images, ({ many }) => ({
  projects: many(projects),
}));

export const imageUploadIntentsRelations = relations(imageUploadIntents, () => ({}));

export const projectsRelations = relations(projects, ({ one }) => ({
  image: one(images, { fields: [projects.imageId], references: [images.id] }),
}));

export const visitorCacheRelations = relations(visitorCache, ({ one }) => ({
  theme: one(themes, { fields: [visitorCache.themeId], references: [themes.id] }),
  selectedTheme: one(themes, { fields: [visitorCache.selectedThemeId], references: [themes.id] }),
}));

export const analyticsEventsRelations = relations(analyticsEvents, ({ one }) => ({
  theme: one(themes, { fields: [analyticsEvents.themeId], references: [themes.id] }),
  selectedTheme: one(themes, { fields: [analyticsEvents.selectedThemeId], references: [themes.id] }),
}));

export const dailyAnalyticsRollupsRelations = relations(dailyAnalyticsRollups, ({ one }) => ({
  theme: one(themes, { fields: [dailyAnalyticsRollups.themeId], references: [themes.id] }),
}));

export const bioBlurbsRelations = relations(bioBlurbs, () => ({}));
export const socialsRelations = relations(socials, () => ({}));
export const previewRateLimitsRelations = relations(previewRateLimits, () => ({}));
