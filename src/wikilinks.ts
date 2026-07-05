import { App, TFile } from "obsidian";
import { slugify } from "./slug";
import { ClidePressSettings, ContentType } from "./settings";

export interface WikilinkContext {
  app: App;
  sourceFile: TFile;
  behavior: "convert-html" | "strip";
  settings: ClidePressSettings;
  warnings: string[];
}

/**
 * Determine which content type (and therefore clide section) a vault path
 * belongs to, by prefix-matching against the configured per-type vault
 * folders. Falls back to "article" if nothing matches.
 */
function resolveContentType(vaultPath: string, settings: ClidePressSettings): ContentType {
  const normalized = vaultPath.replace(/\\/g, "/").toLowerCase();
  for (const type of ["article", "gallery", "project"] as ContentType[]) {
    const folder = settings[type].vaultFolder.replace(/\\/g, "/").toLowerCase();
    if (folder && normalized.startsWith(folder.replace(/^\/+/, "") + "/")) return type;
  }
  return "article";
}

/** clide's URL section name for a content type (docs/<section>/ -> <section>/ in the site). */
function sectionUrlPart(type: ContentType, settings: ClidePressSettings): string {
  // sectionSubpath is like "docs/articles" -> last path segment is the URL section.
  const parts = settings[type].sectionSubpath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || type + "s";
}

/**
 * Convert Obsidian non-image wikilinks: [[Note]] / [[Note|alias]]
 *
 * clide has no wikilink support, so:
 *  - convert-html: produce `[alias-or-target](../<section>/<slug>.html)`,
 *    resolving the target's content type from its vault folder; warn if unresolved.
 *  - strip:        produce just the visible text (alias if present, else target)
 *
 * Image embeds (`![[...]]`) are handled in images.ts and ignored here.
 * Standard `[text](url)` MD links are left untouched.
 */
export function rewriteWikilinks(body: string, ctx: WikilinkContext): string {
  return body.replace(/(?<!\!)\[\[([^\]]+?)\]\]/g, (match, inner: string) => {
    const [linkRaw, aliasRaw] = inner.split("|");
    const target = linkRaw.trim();
    const alias = aliasRaw?.trim();
    const visible = alias && alias.length > 0 ? alias : target;

    if (ctx.behavior === "strip") return visible;

    const resolved = ctx.app.metadataCache.getFirstLinkpathDest(target, ctx.sourceFile.path);
    if (!resolved) {
      ctx.warnings.push(`Unresolved wikilink: ${match}`);
      // Best effort: slug the target and assume it's an article.
      const guess = slugify(target);
      const section = sectionUrlPart("article", ctx.settings);
      return `[${visible}](../${section}/${guess}.html)`;
    }

    const type = resolveContentType(resolved.path, ctx.settings);
    const section = sectionUrlPart(type, ctx.settings);
    const slug = slugify(resolved.basename) || "untitled";
    return `[${visible}](../${section}/${slug}.html)`;
  });
}
