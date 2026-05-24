import { describe, expect, it, beforeEach } from "vitest";

// TODO(scaffold): copy into `server/test/pages_crud.test.ts` after Perch route
// helpers are exported or after `pagesManageRoutes` can run against generated SDK
// mocks. These pure reducer tests define the required route behavior.

type Page = {
  id: string;
  slug: string;
  title: string;
  displayName: string;
  lockVersion: number;
  deletedAt: number | null;
  isDefault: number;
  updatedAt: number;
  socialLinks: Array<{ label: string; url: string }>;
};

let pages: Page[];

describe("pages CRUD contract", () => {
  beforeEach(() => {
    pages = [
      page({ id: "p1", slug: "home", lockVersion: 2, isDefault: 1, updatedAt: 300 }),
      page({ id: "p2", slug: "work", lockVersion: 0, isDefault: 0, updatedAt: 200 }),
      page({ id: "p3", slug: "launch", lockVersion: 0, isDefault: 0, updatedAt: 100 }),
    ];
  });

  it("rejects invalid slugs", () => {
    expect(createPage({ slug: "Bad Slug", title: "Bad", displayName: "Bad" }).code).toBe("invalid_request");
    expect(createPage({ slug: "-bad", title: "Bad", displayName: "Bad" }).code).toBe("invalid_request");
    expect(createPage({ slug: "ok-slug", title: "OK", displayName: "OK" }).status).toBe(201);
  });

  it("rejects duplicate active slugs", () => {
    const result = createPage({ slug: "home", title: "Home", displayName: "Home" });

    expect(result.status).toBe(409);
    expect(result.code).toBe("page_conflict");
  });

  it("soft-deletes pages and excludes them from reads", () => {
    const deleted = deletePage("p1", 10_000);

    expect(deleted.status).toBe(200);
    expect(pages[0].deletedAt).toBe(10_000);
    expect(listPages()).toHaveLength(2);
    expect(listPages().map((p) => p.id)).not.toContain("p1");
  });

  it("requires matching lockVersion for optimistic updates", () => {
    const stale = patchPage("p1", { title: "New", lockVersion: 1 });
    const fresh = patchPage("p1", { title: "New", lockVersion: 2 });

    expect(stale).toEqual({ status: 409, code: "lock_conflict" });
    expect(fresh.status).toBe(200);
    expect(pages[0].title).toBe("New");
    expect(pages[0].lockVersion).toBe(3);
  });

  it("paginates page lists with total and deterministic sorting", () => {
    const result = listPages({ limit: 2, offset: 1, sort: "updatedAt", order: "desc" });

    expect(result.total).toBe(3);
    expect(result.limit).toBe(2);
    expect(result.offset).toBe(1);
    expect(result.pages.map((p) => p.slug)).toEqual(["work", "launch"]);
  });

  it("enforces a single default page on create and patch", () => {
    createPage({ slug: "new-default", title: "New", displayName: "New", isDefault: true });
    expect(pages.filter((p) => p.isDefault === 1 && !p.deletedAt).map((p) => p.slug)).toEqual(["new-default"]);

    patchPage("p2", { title: "Work", lockVersion: 0, isDefault: true });
    expect(pages.filter((p) => p.isDefault === 1 && !p.deletedAt).map((p) => p.slug)).toEqual(["work"]);
  });

  it("normalizes social links to allowed URL schemes on write", () => {
    const result = createPage({
      slug: "social",
      title: "Social",
      displayName: "Social",
      socialLinks: [
        { label: "Site", url: "https://example.com" },
        { label: "Mail", url: "mailto:hi@example.com" },
        { label: "Bad", url: "javascript:alert(1)" },
      ],
    });

    expect(result.page?.socialLinks).toEqual([
      { label: "Site", url: "https://example.com" },
      { label: "Mail", url: "mailto:hi@example.com" },
    ]);
  });
});

function createPage(input: { slug: string; title: string; displayName: string; isDefault?: boolean; socialLinks?: Array<{ label: string; url: string }> }) {
  if (!/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(input.slug)) return { status: 400, code: "invalid_request" };
  if (pages.some((p) => !p.deletedAt && p.slug === input.slug)) return { status: 409, code: "page_conflict" };
  if (input.isDefault) for (const existing of pages) existing.isDefault = 0;
  const row = page({ id: `p${pages.length + 1}`, ...input, isDefault: input.isDefault ? 1 : 0, socialLinks: normalizeSocialLinks(input.socialLinks ?? []) });
  pages.push(row);
  return { status: 201, page: row };
}

function patchPage(id: string, input: { title: string; lockVersion: number; isDefault?: boolean }) {
  const row = pages.find((p) => p.id === id && !p.deletedAt);
  if (!row) return { status: 404, code: "page_not_found" };
  if (row.lockVersion !== input.lockVersion) return { status: 409, code: "lock_conflict" };
  if (input.isDefault) for (const existing of pages) existing.isDefault = 0;
  row.title = input.title;
  if (input.isDefault) row.isDefault = 1;
  row.lockVersion += 1;
  return { status: 200, page: row };
}

function deletePage(id: string, now: number) {
  const row = pages.find((p) => p.id === id && !p.deletedAt);
  if (!row) return { status: 404, code: "page_not_found" };
  row.deletedAt = now;
  return { status: 200 };
}

function listPages(opts?: { limit: number; offset: number; sort: "updatedAt"; order: "desc" }) {
  const active = pages.filter((p) => !p.deletedAt);
  if (!opts) return active;
  const ordered = active.slice().sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id));
  return { pages: ordered.slice(opts.offset, opts.offset + opts.limit), total: active.length, limit: opts.limit, offset: opts.offset };
}

function page(overrides: Partial<Page>): Page {
  return {
    id: "p1",
    slug: "home",
    title: "Home",
    displayName: "Home",
    lockVersion: 0,
    deletedAt: null,
    isDefault: 0,
    updatedAt: 0,
    socialLinks: [],
    ...overrides,
  };
}

function normalizeSocialLinks(items: Array<{ label: string; url: string }>) {
  return items.filter((item) => {
    try {
      const url = new URL(item.url);
      return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:";
    } catch {
      return false;
    }
  });
}
