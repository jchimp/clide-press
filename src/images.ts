import { App, TFile } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"
]);

export interface ImageCopyResult {
  /** Final filename written to the images folder (may include hash suffix on collision) */
  finalName: string;
  /** Action taken */
  action: "copied" | "skipped-identical" | "renamed-collision" | "missing-source";
  /** Original vault path of the source image (for logs) */
  sourceVaultPath: string | null;
}

export interface ImageRewriteContext {
  app: App;
  sourceFile: TFile;
  repoRoot: string;
  imagesAbsDir: string;
  imageLinkPrefix: string;
  /** clide grids any image that's the sole content of its own paragraph in a
   * gallery page — force each rewritten image onto its own blank-line-separated
   * line so that convention is met. */
  ownLine: boolean;
  dryRun: boolean;
  warnings: string[];
  log: string[];
}

/** Format a resolved image reference as Markdown `![alt](url)`. */
function formatImage(alt: string, url: string, ctx: ImageRewriteContext): string {
  const md = `![${alt}](${url})`;
  return ctx.ownLine ? `\n\n${md}\n\n` : md;
}

/**
 * Walk the body and rewrite both Obsidian embed (`![[...]]`) and standard
 * Markdown image (`![alt](path)`) references that point to local images.
 *
 * Side effects: copies the referenced image bytes into the repo's images
 * folder (unless dryRun) using {@link copyImage}. The caller points `imagesAbsDir`
 * and `imageLinkPrefix` at a per-article subfolder, so links resolve like
 * `![alt](../images/<article>/pic.png)`.
 */
export function rewriteImages(body: string, ctx: ImageRewriteContext): string {
  let out = body;

  // 1. Obsidian embeds: ![[link|optional alt]]
  out = out.replace(/!\[\[([^\]]+?)\]\]/g, (match, inner: string) => {
    const [linkRaw, aliasRaw] = inner.split("|");
    const linkpath = linkRaw.trim();
    const alias = aliasRaw?.trim() ?? "";

    const ext = path.extname(linkpath).slice(1).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      // Non-image embed (e.g. ![[some-note]]). Leave as-is and warn — clide
      // will not render this. User can convert manually for v1.
      ctx.warnings.push(`Non-image embed left as-is: ${match}`);
      return match;
    }

    const result = copyImage(linkpath, ctx);
    if (result.action === "missing-source") {
      ctx.warnings.push(`Image embed could not be resolved: ${match}`);
      return match;
    }

    const url = ctx.imageLinkPrefix + result.finalName;
    return formatImage(alias, url, ctx);
  });

  // 2. Standard MD image: ![alt](path "optional title")
  //    Skip remote (http/https/data:) and anchor (#) targets.
  out = out.replace(
    /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g,
    (match, alt: string, url: string, _title: string | undefined) => {
      if (/^(https?:|data:|#|mailto:)/i.test(url)) return match;

      const decoded = decodeURI(url);
      const ext = path.extname(decoded).split("?")[0].slice(1).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) return match;

      const result = copyImage(decoded, ctx);
      if (result.action === "missing-source") {
        ctx.warnings.push(`Image link could not be resolved: ${match}`);
        return match;
      }

      const newUrl = ctx.imageLinkPrefix + result.finalName;
      return formatImage(alt, newUrl, ctx);
    }
  );

  return out;
}

/**
 * Resolve a linkpath through Obsidian's metadata cache, then copy it into the
 * repo's images folder. Handles collisions by hashing.
 */
export function copyImage(linkpath: string, ctx: ImageRewriteContext): ImageCopyResult {
  return copyAsset(linkpath, ctx.imagesAbsDir, ctx);
}

/** Minimal context needed to resolve + copy any vault asset. */
export interface AssetCopyContext {
  app: App;
  sourceFile: TFile;
  dryRun: boolean;
  log: string[];
}

/**
 * Resolve a linkpath through Obsidian's metadata cache, then copy it into the
 * given destination folder. Handles collisions by hashing: identical bytes are
 * skipped, differing bytes get a short hash suffix. Asset-type agnostic.
 */
export function copyAsset(
  linkpath: string,
  destAbsDir: string,
  ctx: AssetCopyContext
): ImageCopyResult {
  const resolved = ctx.app.metadataCache.getFirstLinkpathDest(
    decodeURI(linkpath),
    ctx.sourceFile.path
  );

  if (!resolved) {
    return { finalName: "", action: "missing-source", sourceVaultPath: null };
  }

  const sourceAbs = (ctx.app.vault.adapter as unknown as { getFullPath: (p: string) => string })
    .getFullPath(resolved.path);

  // Keep the original filename verbatim — clide's gallery/article source
  // convention keeps images under their as-shot names (e.g. JPC_4840.jpg).
  const baseName = path.basename(resolved.path);
  const destAbs = path.join(destAbsDir, baseName);

  if (ctx.dryRun) {
    ctx.log.push(`[dry-run] would copy ${sourceAbs} -> ${destAbs}`);
    return { finalName: baseName, action: "copied", sourceVaultPath: resolved.path };
  }

  fs.mkdirSync(destAbsDir, { recursive: true });

  if (fs.existsSync(destAbs)) {
    const srcHash = fileHash(sourceAbs);
    const dstHash = fileHash(destAbs);
    if (srcHash === dstHash) {
      ctx.log.push(`skip identical file: ${baseName}`);
      return { finalName: baseName, action: "skipped-identical", sourceVaultPath: resolved.path };
    }
    // Collision with different bytes -> add short hash suffix
    const ext = path.extname(baseName);
    const stem = baseName.slice(0, baseName.length - ext.length);
    const suffixed = `${stem}-${srcHash.slice(0, 8)}${ext}`;
    const suffixedAbs = path.join(destAbsDir, suffixed);
    if (!fs.existsSync(suffixedAbs)) {
      fs.copyFileSync(sourceAbs, suffixedAbs);
      ctx.log.push(`copied (renamed) ${baseName} -> ${suffixed}`);
    } else {
      ctx.log.push(`reusing existing ${suffixed}`);
    }
    return { finalName: suffixed, action: "renamed-collision", sourceVaultPath: resolved.path };
  }

  fs.copyFileSync(sourceAbs, destAbs);
  ctx.log.push(`copied ${sourceAbs} -> ${destAbs}`);
  return { finalName: baseName, action: "copied", sourceVaultPath: resolved.path };
}

function fileHash(absPath: string): string {
  const buf = fs.readFileSync(absPath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}
