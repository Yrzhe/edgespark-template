export function buildLlmsTxt(origin: string): string {
  const baseUrl = normalizeOrigin(origin);
  return `# Hatch — Agent Guide

Base URL: ${baseUrl}

Use every management request with:

\`\`\`http
Authorization: Bearer <key>
Content-Type: application/json
\`\`\`

## Create a Site

\`\`\`http
POST ${baseUrl}/api/public/manage/sites

{"name":"My Site","slug":"my-site"}
\`\`\`

The response includes \`site.id\`, \`site.slug\`, and \`siteKey\`.

## Deploy a Site

1. Create a manifest of files: \`[{ "path": "/index.html", "hash": "<sha256>", "size": 123, "contentType": "text/html" }]\`.
2. Start deploy:

\`\`\`http
POST ${baseUrl}/api/public/manage/sites/:id/deploys

{"manifest":[...]}
\`\`\`

3. Upload each \`missingHashes\` entry to its presigned PUT URL using the returned \`requiredHeaders\`.
4. Finalize:

\`\`\`http
POST ${baseUrl}/api/public/manage/sites/:id/deploys/:deployId/finalize
\`\`\`

Or deploy a directory with:

\`\`\`bash
node scripts/deploy-site.ts <dir> <slug> --key <key>
\`\`\`

## Important: use RELATIVE URLs in your site

Sites are served under a sub-path: \`${baseUrl}/api/public/s/<slug>/\`. Because of this,
links and asset references inside your HTML/CSS **must be relative**, not root-absolute:

- ✅ \`<link href="style.css">\`, \`<a href="about.html">\`, \`<img src="img/logo.png">\`
- ❌ \`<link href="/style.css">\`, \`<a href="/about.html">\` — a leading \`/\` resolves to the
  domain root, NOT your site, so it will 404 / load the wrong file.

For links from a nested page back up, use relative hops (e.g. \`../\`). Build tools should set
their base/public path to \`./\` (Vite: \`base: './'\`).

## Edit One File

Replaces the bytes at \`<path>\`; creates a new immutable version (roll back anytime).

\`\`\`http
PUT ${baseUrl}/api/public/manage/sites/:id/files/<path>
Content-Type: text/html

<raw file bytes>
\`\`\`

## Roll Back

\`\`\`http
POST ${baseUrl}/api/public/manage/sites/:id/rollback

{"versionId":"<version-id>"}
\`\`\`

## BaaS Records

Runtime records are site-scoped:

\`\`\`http
POST ${baseUrl}/api/public/baas/:siteId/collections/<name>/records

{"siteKey":"<siteKey>","data":{"message":"hello"}}
\`\`\`

Collections use a rule model: \`read\` is \`public\` or \`private\`; \`write\` is \`public-append\`, \`public\`, or \`private\`. Public-append allows creating records but not reading, updating, or deleting them.
`;
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}
