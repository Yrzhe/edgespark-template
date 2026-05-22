export function buildLlmsTxt(origin: string): string {
  const baseUrl = normalizeOrigin(origin);
  return `# EdgeSpark Site Host Agent Guide

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

## Edit One File

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
