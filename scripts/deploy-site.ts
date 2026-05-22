#!/usr/bin/env node
/**
 * Hatch — one-command static-site deploy helper (zero dependencies).
 *
 * Deploys a local folder as a site: hashes files, sends a manifest, uploads only
 * the missing blobs to their presigned URLs, then finalizes (atomic version flip).
 *
 * Usage:
 *   node scripts/deploy-site.ts <dir> <slug> [--name "Display name"] [--base URL] [--key esk_...]
 *
 * Auth/base resolve from flags or env:
 *   HATCH_BASE_URL   e.g. https://immense-jaguar-8615.edgespark.app   (or --base)
 *   HATCH_API_KEY    an agent API key from the dashboard               (or --key)
 *
 * (Node >= 22.18 / 23 runs .ts directly. Older Node: `npx tsx scripts/deploy-site.ts ...`)
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { createHash } from "node:crypto";

interface ManifestEntry { path: string; hash: string; size: number; contentType: string; abs: string; }

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8", xml: "application/xml; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", avif: "image/avif", ico: "image/x-icon",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  map: "application/json; charset=utf-8", wasm: "application/wasm", pdf: "application/pdf",
  mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg",
};

function contentTypeFor(p: string): string {
  const i = p.lastIndexOf(".");
  return i < 0 ? "application/octet-stream" : CONTENT_TYPES[p.slice(i + 1).toLowerCase()] ?? "application/octet-stream";
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) flags[a.slice(2)] = argv[++i] ?? "";
    else positional.push(a);
  }
  return { positional, flags };
}

async function walk(dir: string, root = dir): Promise<ManifestEntry[]> {
  const out: ManifestEntry[] = [];
  for (const name of await readdir(dir)) {
    if (name === ".git" || name === "node_modules" || name === ".DS_Store") continue;
    const abs = join(dir, name);
    const s = await stat(abs);
    if (s.isDirectory()) out.push(...(await walk(abs, root)));
    else {
      const bytes = await readFile(abs);
      const rel = relative(root, abs).split(sep).join("/");
      out.push({
        path: "/" + rel,
        hash: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.byteLength,
        contentType: contentTypeFor(name),
        abs,
      });
    }
  }
  return out;
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [dir, slug] = positional;
  const base = (flags.base ?? process.env.HATCH_BASE_URL ?? "").replace(/\/$/, "");
  const key = flags.key ?? process.env.HATCH_API_KEY ?? "";
  if (!dir || !slug || !base || !key) {
    console.error("Usage: node scripts/deploy-site.ts <dir> <slug> [--name N] [--base URL] [--key esk_...]");
    console.error("  (or set HATCH_BASE_URL / HATCH_API_KEY)");
    process.exit(2);
  }
  const auth = { Authorization: `Bearer ${key}` };
  const api = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${base}/api/public/manage${path}`, {
      ...init,
      headers: { ...auth, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${await res.text().catch(() => "")}`);
    return res.status === 204 ? null : res.json();
  };

  const manifest = await walk(dir);
  if (manifest.length === 0) throw new Error(`No files found in ${dir}`);
  console.log(`Hashing ${manifest.length} files…`);

  // Resolve or create the site.
  const { sites } = (await api("/sites")) as { sites: Array<{ id: string; slug: string }> };
  let site = sites.find((s) => s.slug === slug);
  if (!site) {
    const created = (await api("/sites", { method: "POST", body: JSON.stringify({ name: flags.name || slug, slug }) })) as { site: { id: string; slug: string } };
    site = created.site;
    console.log(`Created site "${slug}".`);
  }

  // Start deploy.
  const deploy = (await api(`/sites/${site.id}/deploys`, {
    method: "POST",
    body: JSON.stringify({ manifest: manifest.map(({ path, hash, size, contentType }) => ({ path, hash, size, contentType })) }),
  })) as { deployId: string; uploads: Record<string, { uploadUrl: string; requiredHeaders: Record<string, string> }> };

  const uploadHashes = Object.keys(deploy.uploads ?? {});
  console.log(`Uploading ${uploadHashes.length} new blob(s) (${manifest.length - uploadHashes.length} deduped)…`);
  const byHash = new Map(manifest.map((m) => [m.hash, m]));
  await Promise.all(
    uploadHashes.map(async (hash) => {
      const up = deploy.uploads[hash];
      const file = byHash.get(hash)!;
      const put = await fetch(up.uploadUrl, { method: "PUT", headers: up.requiredHeaders, body: await readFile(file.abs) });
      if (!put.ok) throw new Error(`upload ${file.path} → ${put.status}`);
    })
  );

  await api(`/sites/${site.id}/deploys/${deploy.deployId}/finalize`, { method: "POST" });
  console.log(`\n✅ Deployed → ${base}/api/public/s/${slug}/`);
}

main().catch((e) => {
  console.error("Deploy failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
