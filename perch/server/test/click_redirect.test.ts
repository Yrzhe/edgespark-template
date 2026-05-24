import { describe, expect, it, beforeEach } from "vitest";

// TODO(scaffold): convert this to a `publicRoutes` integration test with mocked
// `edgespark.db` once generated Perch `@defs` and SDK path aliases exist.

type Page = { id: string; slug: string; publishedAt: number | null; deletedAt: number | null };
type Link = {
  id: string;
  pageId: string;
  url: string;
  isActive: number;
  deletedAt: number | null;
  linkKind: string;
};
type Event = { pageId: string; linkId: string | null; eventType: "click"; occurredAt: number };

let pages: Page[];
let links: Link[];
let events: Event[];

describe("click redirect contract", () => {
  beforeEach(() => {
    pages = [{ id: "p1", slug: "home", publishedAt: 1, deletedAt: null }];
    links = [
      link({ id: "active", pageId: "p1", url: "https://destination.example/a", isActive: 1 }),
      link({ id: "empty", pageId: "p1", url: "", isActive: 1 }),
      link({ id: "inactive", pageId: "p1", url: "https://destination.example/hidden", isActive: 0 }),
      link({ id: "deleted", pageId: "p1", url: "https://destination.example/deleted", deletedAt: 1 }),
    ];
    events = [];
  });

  it("logs a click event and returns 302 to the DB destination", () => {
    const res = clickRedirect("home", "active", "https://attacker.example/ignored", 123);

    expect(res.status).toBe(302);
    expect(res.location).toBe("https://destination.example/a");
    expect(res.location).not.toBe("https://attacker.example/ignored");
    expect(events).toEqual([{ pageId: "p1", linkId: "active", eventType: "click", occurredAt: 123 }]);
  });

  it("404s inactive, deleted, and invalid-url links without logging analytics", () => {
    expect(clickRedirect("home", "inactive", undefined, 123)).toEqual({ status: 404, code: "link_not_found" });
    expect(clickRedirect("home", "deleted", undefined, 123)).toEqual({ status: 404, code: "link_not_found" });
    expect(clickRedirect("home", "empty", undefined, 123)).toEqual({ status: 404, code: "link_not_found" });
    expect(events).toEqual([]);
  });

  it("404s when page slug does not resolve to a published active page", () => {
    pages[0].publishedAt = null;

    expect(clickRedirect("home", "active", undefined, 123)).toEqual({ status: 404, code: "page_not_found" });
    expect(events).toEqual([]);
  });
});

function clickRedirect(pageSlug: string, linkId: string, _queryUrl: string | undefined, now: number) {
  const page = pages.find((p) => p.slug === pageSlug && !p.deletedAt);
  if (!page || !page.publishedAt) return { status: 404, code: "page_not_found" };
  const row = links.find((l) => l.id === linkId && l.pageId === page.id && !l.deletedAt);
  if (!row || row.isActive !== 1 || row.linkKind === "section" || !isHttpUrl(row.url)) return { status: 404, code: "link_not_found" };
  events.push({ pageId: page.id, linkId: row.id, eventType: "click", occurredAt: now });
  return { status: 302, location: row.url };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function link(overrides: Partial<Link>): Link {
  return {
    id: "l1",
    pageId: "p1",
    url: "https://example.com",
    isActive: 1,
    deletedAt: null,
    linkKind: "link",
    ...overrides,
  };
}
