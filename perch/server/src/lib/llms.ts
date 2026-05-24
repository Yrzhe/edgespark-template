export function buildLlmsTxt(origin: string): string {
  const baseUrl = normalizeOrigin(origin);
  return `# Perch — Agent Guide

Base URL: ${baseUrl}

Perch is an AI-agent-native link-in-bio and first-party analytics app. Use the management API
with a Bearer token or API key. Mutations require Bearer auth; owner cookies are accepted only
for GET reads.

\`\`\`http
Authorization: Bearer <key>
Content-Type: application/json
\`\`\`

## Create a Page

\`\`\`http
POST ${baseUrl}/api/public/manage/pages

{"slug":"home","title":"Rin's links","displayName":"Rin","bio":"Builder and writer"}
\`\`\`

The public SSR URL is:

\`\`\`text
${baseUrl}/api/public/p/<slug>
\`\`\`

## Create a Link

\`\`\`http
POST ${baseUrl}/api/public/manage/pages/:pageId/links

{"title":"Portfolio","url":"https://example.com","description":"Selected work","position":0,"isActive":true}
\`\`\`

Use \`linkKind:"section"\` for section headers. Use \`isFeatured:true\` for one large featured card.

## Upload Media

1. Presign an upload:

\`\`\`http
POST ${baseUrl}/api/public/manage/pages/:pageId/assets/presign

{"kind":"avatar","filename":"avatar.jpg","contentType":"image/jpeg"}
\`\`\`

For a link thumbnail:

\`\`\`http
POST ${baseUrl}/api/public/manage/pages/:pageId/links/:linkId/assets/presign

{"filename":"thumb.jpg","contentType":"image/jpeg"}
\`\`\`

2. PUT the file to \`uploadUrl\` with every returned \`requiredHeaders\`.
3. Confirm it:

\`\`\`http
POST ${baseUrl}/api/public/manage/pages/:pageId/assets/confirm

{"kind":"avatar","assetId":"<assetId>"}
\`\`\`

Asset URLs returned by public/config endpoints are temporary presigned GET URLs. Store only the
returned page/link fields, not the temporary URLs.

## Update Theme

\`\`\`http
PATCH ${baseUrl}/api/public/manage/pages/:pageId

{"theme":{"background":"#f7f2ea","foreground":"#181612","accent":"#2b7c6f","radius":"18px"}}
\`\`\`

## Read Analytics

\`\`\`http
GET ${baseUrl}/api/public/manage/pages/:pageId/analytics?from=1716508800000&to=1717113600000
GET ${baseUrl}/api/public/manage/pages/:pageId/links/:linkId/analytics?from=1716508800000&to=1717113600000
\`\`\`

Analytics include page views, link clicks, CTR, top links, referrers, devices, and countries.

## API Keys

\`\`\`http
GET ${baseUrl}/api/public/manage/keys
POST ${baseUrl}/api/public/manage/keys
DELETE ${baseUrl}/api/public/manage/keys/:id
\`\`\`

Key plaintext is shown once. Store it securely.

## Rules

- Slugs are unique and lowercase.
- Destination URLs must be absolute \`http\` or \`https\`.
- Page/link IDs come from path + DB, never request-body ownership claims.
- Deleted pages and links are soft-deleted and hidden from public routes.
`;
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}
