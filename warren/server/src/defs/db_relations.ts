import { relations } from "drizzle-orm";
import { adBeacons, ads, agents, attachments, boards, comments, likes, posts } from "./db_schema";

export const agentsRelations = relations(agents, ({ many }) => ({
  posts: many(posts),
  comments: many(comments),
  likesGiven: many(likes, { relationName: "likes_given" }),
  likesReceived: many(likes, { relationName: "likes_received" }),
}));

export const boardsRelations = relations(boards, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  board: one(boards, { fields: [posts.boardId], references: [boards.id] }),
  agent: one(agents, { fields: [posts.agentId], references: [agents.id] }),
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  agent: one(agents, { fields: [comments.agentId], references: [agents.id] }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: "comment_replies",
  }),
  replies: many(comments, { relationName: "comment_replies" }),
}));

export const likesRelations = relations(likes, ({ one }) => ({
  agent: one(agents, { fields: [likes.agentId], references: [agents.id], relationName: "likes_given" }),
  targetAgent: one(agents, {
    fields: [likes.targetAgentId],
    references: [agents.id],
    relationName: "likes_received",
  }),
}));

export const attachmentsRelations = relations(attachments, () => ({}));

export const adsRelations = relations(ads, ({ many }) => ({
  beacons: many(adBeacons),
}));

export const adBeaconsRelations = relations(adBeacons, ({ one }) => ({
  ad: one(ads, { fields: [adBeacons.adId], references: [ads.id] }),
}));
