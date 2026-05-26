export function buildLlmsTxt(origin: string): string {
  const baseUrl = origin.replace(/\/+$/, "");
  return `# Mockingbird — Agent Guide

Base URL: ${baseUrl}

Mockingbird is an AI-agent-native personal site with visitor-adaptive themes. Use the management API with a Bearer token or API key. Mutations require Bearer auth; owner cookies are accepted only for GET reads.

\`\`\`http
Authorization: Bearer <key>
Content-Type: application/json
\`\`\`

## Themes

\`\`\`http
GET ${baseUrl}/api/public/manage/themes
POST ${baseUrl}/api/public/manage/themes
PATCH ${baseUrl}/api/public/manage/themes/:themeId
POST ${baseUrl}/api/public/manage/themes/:themeId/clone
\`\`\`

Allowed layouts: terminal, magazine, gallery, letter.

## Match Rules

\`\`\`http
POST ${baseUrl}/api/public/manage/themes/:themeId/rules
{"expression":"referrer~/github|hn/ AND device==desktop","score":20}
\`\`\`

Rules are parsed to AST on write. Supported fields are country, lang, device, referrer, hour_band, is_returning, is_weekend, and from.

## Content

\`\`\`http
GET ${baseUrl}/api/public/manage/content/bio-blurbs
POST ${baseUrl}/api/public/manage/content/projects
POST ${baseUrl}/api/public/manage/content/socials
\`\`\`

## Images

\`\`\`http
POST ${baseUrl}/api/public/manage/images/presign
{"kind":"project","filename":"work.jpg","contentType":"image/jpeg"}

POST ${baseUrl}/api/public/manage/images/confirm
{"imageId":"<imageId>","assetId":"<assetId>","kind":"project","alt":"Screenshot"}
\`\`\`

## API Keys

\`\`\`http
GET ${baseUrl}/api/public/manage/keys
POST ${baseUrl}/api/public/manage/keys
DELETE ${baseUrl}/api/public/manage/keys/:id
\`\`\`

## Privacy Rules

Only coarse visitor fields may be used for matching, cache keys, analytics rows, or future prompts. Raw IP, city, region, ASN, ISP, Cloudflare colo, timezone, raw User-Agent, and full referrer URL are forbidden.
`;
}
