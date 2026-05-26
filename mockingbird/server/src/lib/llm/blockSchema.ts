export type LayoutKey = "terminal" | "letter" | "gallery" | "magazine";

const STATIC_BLOCKS: Record<LayoutKey, readonly string[]> = {
  terminal: ["hero-headline", "hero-intro", "about-body"],
  letter: ["hero-greeting", "hero-intro", "about-body", "returning-note", "sign-off-line", "sign-off-name"],
  gallery: ["hero-name", "hero-intro", "about-short", "now-short", "featured-title", "featured-blurb"],
  magazine: ["hero-headline", "hero-deck", "body-p1", "body-p2", "body-p3", "pull-quote", "contact-note"],
};

export const REQUIRED_HERO_BLOCKS: Record<LayoutKey, readonly string[]> = {
  terminal: ["hero-headline", "hero-intro"],
  letter: ["hero-greeting", "hero-intro"],
  gallery: ["hero-name", "hero-intro"],
  magazine: ["hero-headline", "hero-deck"],
};

export function requiredHeroBlocksFor(layoutKey: string): string[] {
  const layout = isLayout(layoutKey) ? layoutKey : "letter";
  return [...REQUIRED_HERO_BLOCKS[layout]];
}

export function blockKeysFor(layoutKey: string, projectIds: readonly string[]): string[] {
  const layout = isLayout(layoutKey) ? layoutKey : "letter";
  const projectBlocks = projectIds.flatMap((id, index) => {
    if (layout === "gallery") return [`project-${id}-title`, `project-${id}-blurb`];
    if (layout === "terminal") return [`project-${id}`, `note-${index}`];
    return [`project-${id}`];
  });
  return [...STATIC_BLOCKS[layout], ...projectBlocks];
}

function isLayout(value: string): value is LayoutKey {
  return value === "terminal" || value === "letter" || value === "gallery" || value === "magazine";
}
