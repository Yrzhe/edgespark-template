/**
 * EDGESPARK SERVER
 *
 * Define your Hono routes. The app is static — created once, reused across requests.
 *
 * SDK imports from 'edgespark' are per-request (backed by AsyncLocalStorage).
 * They can ONLY be used inside route handlers, not at the top level.
 *
 * ═══════════════════════════════════════════════════════════════════
 * PATH CONVENTIONS (Authentication)
 *
 * /api/*          → Login required (auth.user guaranteed)
 * /api/public/*   → Login optional (auth.user if logged in)
 * /api/webhooks/* → No auth check (handle verification yourself)
 * ═══════════════════════════════════════════════════════════════════
 */

import { Hono } from "hono";

const app = new Hono()
  .get("/api/public/hello", (c) =>
    c.json({ message: "Hello from EdgeSpark! Spark your idea to the Edge." })
  );

// Example: Get all posts
// .get('/api/posts', async (c) => {
//   const allPosts = await db.select().from(posts);
//   return c.json({ posts: allPosts });
// })

// Example: Create post
// .post('/api/posts', async (c) => {
//   const data = await c.req.json();
//   await db.insert(posts).values({ title: data.title, content: data.content });
//   return c.json({ success: true }, 201);
// })

// Example: Background task (doesn't block response)
// .post('/api/analytics', async (c) => {
//   const event = await c.req.json();
//   ctx.runInBackground(logEvent(event));
//   return c.json({ ok: true });
// })

export default app;
