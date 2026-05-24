import { describe, expect, it } from "vitest";
import { renderPublicPage } from "../src/lib/publicPage/html";

const page = {
  slug: "home",
  title: "Rin <Builder>",
  displayName: "Rin & Co",
  bio: "Making <useful> links",
  avatarS3Uri: "s3://perch-media/pages/p1/avatars/a/avatar.jpg",
  coverS3Uri: "s3://perch-media/pages/p1/covers/c/cover.jpg",
  socialLinksJson: JSON.stringify([
    { platform: "x", label: "X", url: "https://x.com/rin" },
    { platform: "instagram", label: "Instagram", url: "https://instagram.com/rin" },
    { platform: "youtube", label: "YouTube", url: "https://youtube.com/@rin" },
    { platform: "github", label: "GitHub", url: "https://github.com/rin" },
    { platform: "mail", label: "Mail", url: "mailto:hi@example.com" },
  ]),
};

const theme = {
  background: "#f7f2ea",
  foreground: "#181612",
  card: "#fffaf2",
  accent: "#2b7c6f",
  radius: "18px",
  footerText: "Perch footer",
};

describe("public page SSR renderer", () => {
  it("renders SEO and Open Graph tags from page data", () => {
    const html = renderPublicPage(page, [], theme, {
      avatar: "https://r2.example/avatar.jpg",
      cover: "https://r2.example/cover.jpg",
      thumbnails: {},
    });

    expect(html).toContain("<title>Rin &lt;Builder&gt;</title>");
    expect(html).toContain('meta name="description" content="Making &lt;useful&gt; links"');
    expect(html).toContain('meta property="og:title" content="Rin &lt;Builder&gt;"');
    expect(html).toContain('meta property="og:description" content="Making &lt;useful&gt; links"');
    expect(html).toContain('meta property="og:image" content="https://r2.example/cover.jpg"');
    expect(html).toContain('meta name="twitter:card" content="summary_large_image"');
  });

  it("renders only active links and escapes user-controlled content", () => {
    const html = renderPublicPage(
      page,
      [
        link({ id: "active", title: "Launch <Now>", isActive: 1 }),
        link({ id: "hidden", title: "Hidden Destination", isActive: 0 }),
      ],
      theme,
      { thumbnails: {} }
    );

    expect(html).toContain("Launch &lt;Now&gt;");
    expect(html).toContain("Making &lt;useful&gt; links");
    expect(html).not.toContain("Hidden Destination");
    expect(html).not.toContain("<script>");
  });

  it("renders the approved minimal-mono shell and inline social SVGs", () => {
    const html = renderPublicPage(page, [], theme, {});

    expect(html).toContain('class="card"');
    expect(html).toContain('class="avatar" aria-hidden="true">RC</div>');
    expect(html).toContain('<h1>Rin &amp; Co <span class="verified" aria-label="Verified">');
    expect(html).toContain('<p class="handle">@home</p>');
    expect(html).toContain('class="socials" aria-label="Social links"');
    expect(html).toContain('M18.244 2.25h3.308l-7.227 8.26 8.502 11.24');
    expect(html).toContain('aria-label="Instagram"');
    expect(html).toContain('aria-label="YouTube"');
    expect(html).toContain('aria-label="GitHub"');
    expect(html).toContain('aria-label="Mail"');
    expect(html.toLowerCase()).not.toContain("bird");
  });

  it("injects theme CSS variables", () => {
    const html = renderPublicPage(page, [], theme, {});

    expect(html).toContain("--page-bg: #f7f2ea");
    expect(html).toContain("--fg: #181612");
    expect(html).toContain("--card: #fffaf2");
    expect(html).toContain("--accent: #2b7c6f");
    expect(html).toContain("--radius: 18px");
  });

  it("falls back from CSS injection payloads in theme colors", () => {
    const html = renderPublicPage(page, [], {
      ...theme,
      background: "rgba(0,0,0,1);}</style><script>alert(1)</script>",
      accent: "</style><script>alert(2)</script>",
    }, {});

    expect(html).toContain("--page-bg: #fafafa");
    expect(html).toContain("--accent: #18181b");
    expect(html).not.toContain("</style><script>");
  });

  it("drops invalid social links defensively", () => {
    const html = renderPublicPage(
      { ...page, socialLinksJson: JSON.stringify([{ label: "Bad", url: "javascript:alert(1)" }, { label: "Mail", url: "mailto:hi@example.com" }]) },
      [],
      theme,
      {}
    );

    expect(html).not.toContain("javascript:alert");
    expect(html).not.toContain('aria-label="Bad"');
    expect(html).toContain("mailto:hi@example.com");
  });

  it("renders featured cards, section headers, normal rows, and the Perch footer", () => {
    const html = renderPublicPage(
      page,
      [
        link({ id: "featured", title: "Featured Post", isFeatured: 1, position: 0 }),
        link({ id: "section", title: "About me", linkKind: "section", url: "", position: 1 }),
        link({ id: "standard", title: "Newsletter", position: 2 }),
      ],
      theme,
      { thumbnails: { featured: "https://r2.example/featured.jpg", standard: "https://r2.example/thumb.jpg" } }
    );

    expect(html).toContain('class="featured"');
    expect(html).toContain("repeating-linear-gradient(135deg, #e4e4e7 0 1px, transparent 1px 13px)");
    expect(html).toContain('<span>Featured</span><span class="line" aria-hidden="true"></span>');
    expect(html).toContain("Featured Post");
    expect(html).toContain('<span>Links</span><span class="line" aria-hidden="true"></span>');
    expect(html).toContain('<h2 class="subsection">About me</h2>');
    expect(html).toContain('class="row"');
    expect(html).toContain("/api/public/p/home/l/standard");
    expect(html.match(/Featured Post/g)).toHaveLength(1);
    expect(html).toContain("Built with <strong>Perch</strong>");
    expect(html).toContain('href="https://x.com/yrzhe_top"');
    expect(html).toContain("@yrzhe_top");
  });
});

function link(overrides: Partial<ReturnType<typeof baseLink>>) {
  return { ...baseLink(), ...overrides };
}

function baseLink() {
  return {
    id: "l1",
    title: "Link",
    url: "https://example.com",
    description: "Description",
    thumbnailS3Uri: null,
    position: 0,
    isActive: 1,
    isFeatured: 0,
    linkKind: "link",
  };
}
