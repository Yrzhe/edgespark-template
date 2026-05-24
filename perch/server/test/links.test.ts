import { describe, expect, it, beforeEach } from "vitest";

// TODO(scaffold): convert these reducer tests to `pagesManageRoutes` integration
// tests once generated Perch `@defs` and SDK mocks exist.

type Link = {
  id: string;
  pageId: string;
  title: string;
  url: string;
  linkKind: "link" | "section";
  position: number;
  isActive: number;
  deletedAt: number | null;
  lockVersion: number;
};

let links: Link[];

describe("links management contract", () => {
  beforeEach(() => {
    links = [
      link({ id: "a", pageId: "p1", position: 0 }),
      link({ id: "b", pageId: "p1", position: 1 }),
      link({ id: "foreign", pageId: "p2", position: 0 }),
    ];
  });

  it("loads and patches links only within the path page scope", () => {
    expect(loadLink("p1", "a")?.id).toBe("a");
    expect(loadLink("p1", "foreign")).toBeNull();
    expect(patchLink("p1", "foreign", { title: "Wrong page" })).toEqual({ status: 404, code: "link_not_found" });
  });

  it("reorders only links owned by the path page using atomic two-phase positions", () => {
    const result = reorderLinks("p1", [
      { id: "a", position: 2 },
      { id: "b", position: 1 },
      { id: "foreign", position: 99 },
    ]);

    expect(result.status).toBe(200);
    expect(result.statements).toEqual(["temp:a", "temp:b", "final:a", "final:b"]);
    expect(loadLink("p1", "a")?.position).toBe(2);
    expect(loadLink("p1", "b")?.position).toBe(1);
    expect(loadLink("p1", "a")?.lockVersion).toBe(1);
    expect(loadLink("p2", "foreign")?.position).toBe(0);
  });

  it("toggles active state without deleting the link", () => {
    const result = patchLink("p1", "a", { isActive: false });

    expect(result.status).toBe(200);
    expect(loadLink("p1", "a")?.isActive).toBe(0);
    expect(loadLink("p1", "a")?.deletedAt).toBeNull();
  });

  it("requires a valid URL when a section becomes a link", () => {
    links.push(link({ id: "section", pageId: "p1", linkKind: "section", url: "" }));

    expect(patchLink("p1", "section", { linkKind: "link" })).toEqual({ status: 400, code: "invalid_request" });
    expect(patchLink("p1", "section", { linkKind: "link", url: "https://example.com" }).status).toBe(200);
  });
});

function loadLink(pageId: string, id: string) {
  return links.find((l) => l.pageId === pageId && l.id === id && !l.deletedAt) ?? null;
}

function patchLink(pageId: string, id: string, input: { title?: string; isActive?: boolean; linkKind?: "link" | "section"; url?: string }) {
  const row = loadLink(pageId, id);
  if (!row) return { status: 404, code: "link_not_found" };
  if (input.linkKind === "link" && !input.url && !isHttpUrl(row.url)) return { status: 400, code: "invalid_request" };
  if (input.url && !isHttpUrl(input.url)) return { status: 400, code: "invalid_request" };
  if (input.title) row.title = input.title;
  if (input.isActive !== undefined) row.isActive = input.isActive ? 1 : 0;
  if (input.linkKind) row.linkKind = input.linkKind;
  if (input.url) row.url = input.url;
  return { status: 200, link: row };
}

function reorderLinks(pageId: string, items: Array<{ id: string; position: number }>) {
  const statements: string[] = [];
  const scoped = items.filter((item) => loadLink(pageId, item.id));
  for (const item of scoped) {
    loadLink(pageId, item.id)!.position = -1_000_000 - statements.length;
    statements.push(`temp:${item.id}`);
  }
  for (const item of items) {
    const row = loadLink(pageId, item.id);
    if (row) {
      row.position = item.position;
      row.lockVersion += 1;
      statements.push(`final:${item.id}`);
    }
  }
  return { status: 200, statements };
}

function link(overrides: Partial<Link>): Link {
  return {
    id: "l1",
    pageId: "p1",
    title: "Link",
    url: "https://example.com",
    linkKind: "link",
    position: 0,
    isActive: 1,
    deletedAt: null,
    lockVersion: 0,
    ...overrides,
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
