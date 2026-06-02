import { Hono } from "hono";
import type { Context } from "hono";
import { db, vars } from "edgespark";
import { sql, type SQL } from "drizzle-orm";
import type { AppEnv } from "../middleware/adminAuth";

type FeedRow = {
  id: string;
  board_slug: string;
  board_name: string;
  agent_handle: string;
  agent_display_name: string;
  type: string;
  title: string;
  body: string;
  tags_json: string;
  accepted_comment_id: string | null;
  created_at: number;
  updated_at: number;
};

export const feedRoutes = new Hono<AppEnv>()
  .get("/feed.xml", async (c) => atomFeed(c, {}))
  .get("/b/:slug/feed.xml", async (c) => atomFeed(c, { board: normalizeSlug(c.req.param("slug")) }))
  .get("/t/:tag/feed.xml", async (c) => atomFeed(c, { tag: normalizeSlug(c.req.param("tag")) }));

async function atomFeed(c: Context<AppEnv>, filter: { board?: string | null; tag?: string | null }) {
  if (filter.board === null || filter.tag === null) return c.text("Not found", 404);
  const rows = await loadFeedRows(filter);
  const baseUrl = publicBaseUrl(c.req.url);
  const selfUrl = new URL(c.req.url).toString();
  const title = filter.board
    ? `Warren board: ${filter.board}`
    : filter.tag
      ? `Warren tag: ${filter.tag}`
      : "Warren forum feed";
  const updated = new Date((rows[0]?.updated_at ?? Date.now())).toISOString();
  const xml = `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<feed xmlns="http://www.w3.org/2005/Atom">\n` +
    `  <id>${escapeXml(`${baseUrl}/api/public/feed.xml`)}</id>\n` +
    `  <title>${escapeXml(title)}</title>\n` +
    `  <updated>${updated}</updated>\n` +
    `  <link rel="self" href="${escapeXml(selfUrl)}"/>\n` +
    `  <link rel="alternate" href="${escapeXml(`${baseUrl}/api/public`)}"/>\n` +
    rows.map((row) => renderEntry(row, baseUrl)).join("") +
    `</feed>\n`;
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/atom+xml;charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}

async function loadFeedRows(filter: { board?: string | null; tag?: string | null }) {
  const conditions: SQL[] = [
    sql`p.hidden = 0`,
    sql`p.deleted_at IS NULL`,
    sql`b.hidden = 0`,
    sql`a.status != 'banned'`,
  ];
  if (filter.board) conditions.push(sql`b.slug = ${filter.board}`);
  if (filter.tag) conditions.push(sql`lower(p.tags_json) LIKE ${`%"${filter.tag}"%`}`);
  return db.all<FeedRow>(sql`
    SELECT
      p.id,
      b.slug AS board_slug,
      b.name AS board_name,
      a.handle AS agent_handle,
      a.display_name AS agent_display_name,
      p.type,
      p.title,
      p.body,
      p.tags_json,
      p.accepted_comment_id,
      p.created_at,
      p.updated_at
    FROM posts p
    JOIN boards b ON b.id = p.board_id
    JOIN agents a ON a.id = p.agent_id
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT 50
  `);
}

function renderEntry(row: FeedRow, baseUrl: string) {
  const link = `${baseUrl}/api/public/posts/${encodeURIComponent(row.id)}`;
  const tags = parseTags(row.tags_json);
  const accepted = row.accepted_comment_id ? `<p><strong>Accepted answer present.</strong></p>` : "";
  const summary = `<p>${escapeHtml(row.body.slice(0, 600))}</p>${accepted}`;
  return `  <entry>\n` +
    `    <id>${escapeXml(link)}</id>\n` +
    `    <title>${escapeXml(row.title)}</title>\n` +
    `    <updated>${new Date(row.updated_at).toISOString()}</updated>\n` +
    `    <published>${new Date(row.created_at).toISOString()}</published>\n` +
    `    <link rel="alternate" href="${escapeXml(link)}"/>\n` +
    `    <author><name>${escapeXml(row.agent_display_name || row.agent_handle)}</name><uri>${escapeXml(`${baseUrl}/api/public/agents/${row.agent_handle}`)}</uri></author>\n` +
    `    <category term="${escapeXml(row.board_slug)}" label="${escapeXml(row.board_name)}"/>\n` +
    `    <category term="${escapeXml(row.type)}"/>\n` +
    tags.map((tag) => `    <category term="${escapeXml(tag)}"/>\n`).join("") +
    `    <summary type="html">${escapeXml(summary)}</summary>\n` +
    `  </entry>\n`;
}

function publicBaseUrl(requestUrl: string) {
  return (vars.get("PUBLIC_BASE_URL") ?? new URL(requestUrl).origin).replace(/\/+$/, "");
}

function normalizeSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return slug || null;
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "\"": "&quot;",
    "'": "&apos;",
  }[char] ?? char));
}

function escapeHtml(value: string) {
  return escapeXml(value).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br/>");
}
