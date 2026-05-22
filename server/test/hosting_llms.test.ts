import { describe, expect, it } from "vitest";
import { buildLlmsTxt } from "../src/lib/hosting/llms";

describe("hosting llms.txt builder", () => {
  it("builds copy-pasteable agent docs from the request origin", () => {
    const doc = buildLlmsTxt("https://host.example/");

    expect(doc).toContain("Base URL: https://host.example");
    expect(doc).toContain("Authorization: Bearer <key>");
    expect(doc).toContain("POST https://host.example/api/public/manage/sites");
    expect(doc).toContain("POST https://host.example/api/public/manage/sites/:id/deploys");
    expect(doc).toContain("PUT https://host.example/api/public/manage/sites/:id/files/<path>");
    expect(doc).toContain("POST https://host.example/api/public/manage/sites/:id/rollback");
    expect(doc).toContain("POST https://host.example/api/public/baas/:siteId/collections/<name>/records");
    expect(doc).toContain("node scripts/deploy-site.ts <dir> <slug> --key <key>");
    expect(doc).not.toContain("localhost");
  });
});
