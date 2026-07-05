import { App, Modal, Notice, Setting, DropdownComponent, TextComponent } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { ClidePressSettings, ContentType } from "./settings";
import {
  buildFrontmatter,
  ExistingFrontmatter,
  extractTitleFromBody,
  stripExistingFrontmatter
} from "./frontmatter";
import { rewriteImages } from "./images";
import { rewriteWikilinks } from "./wikilinks";
import { slugify } from "./slug";

export interface PublishOptions {
  dryRun: boolean;
}

const TYPE_LABELS: Record<ContentType, string> = {
  article: "Article",
  gallery: "Gallery",
  project: "Project"
};

/** Prefix-match a vault path against a type's configured vault folder. */
function matchContentType(vaultPath: string, settings: ClidePressSettings): ContentType | null {
  const normalized = vaultPath.replace(/\\/g, "/").toLowerCase();
  for (const type of ["article", "gallery", "project"] as ContentType[]) {
    const folder = settings[type].vaultFolder.replace(/\\/g, "/").toLowerCase().replace(/^\/+|\/+$/g, "");
    if (folder && normalized.startsWith(folder + "/")) return type;
  }
  return null;
}

export async function publishActiveNote(
  app: App,
  settings: ClidePressSettings,
  opts: PublishOptions
): Promise<void> {
  const file = app.workspace.getActiveFile();
  if (!file) {
    new Notice("ClidePress: no active note");
    return;
  }
  if (file.extension !== "md") {
    new Notice("ClidePress: active file is not a Markdown note");
    return;
  }

  if (!settings.repoRoot) {
    new Notice("ClidePress: set the Repo root in settings first");
    return;
  }
  if (!fs.existsSync(settings.repoRoot)) {
    new Notice(`ClidePress: repo root does not exist: ${settings.repoRoot}`);
    return;
  }

  const original = await app.vault.read(file);
  const existingFm = app.metadataCache.getFileCache(file)?.frontmatter as
    | ExistingFrontmatter
    | undefined;
  const displayTitle = extractTitleFromBody(original, file.basename);

  const matchedType = matchContentType(file.path, settings);
  const defaultType: ContentType = matchedType ?? "article";
  const defaultSlug =
    slugify((typeof existingFm?.title === "string" && existingFm.title) || displayTitle) ||
    "untitled";

  let type = defaultType;
  let slug = defaultSlug;

  // Only skip the picker when there's confirm-before-publish is off AND the
  // vault folder unambiguously identified the type. Type/slug selection is
  // the core interaction now, so default to always showing it.
  const skipModal = !settings.confirmBeforePublish && matchedType !== null;

  if (!skipModal) {
    const picked = await pickTypeAndSlug(app, {
      title: displayTitle,
      sourcePath: file.path,
      defaultType,
      defaultSlug,
      settings
    });
    if (!picked) {
      new Notice("Publish cancelled.");
      return;
    }
    type = picked.type;
    slug = picked.slug;
  }

  const sectionSubpath = settings[type].sectionSubpath;
  const targetMdAbs = path.join(settings.repoRoot, sectionSubpath, slug, "INDEX.md");
  const imagesAbsDir = path.join(settings.repoRoot, settings.imagesSubpath, slug);
  const imageLinkPrefix = settings.imageLinkPrefix + slug + "/";

  const exists = fs.existsSync(targetMdAbs);

  // Transform pipeline.
  const warnings: string[] = [];
  const log: string[] = [];

  let body = stripExistingFrontmatter(original);

  body = rewriteImages(body, {
    app,
    sourceFile: file,
    repoRoot: settings.repoRoot,
    imagesAbsDir,
    imageLinkPrefix,
    ownLine: type === "gallery",
    dryRun: opts.dryRun,
    warnings,
    log
  });

  body = rewriteWikilinks(body, {
    app,
    sourceFile: file,
    behavior: settings.wikilinkBehavior,
    settings,
    warnings
  });

  const { yaml } = buildFrontmatter(body, file.basename, existingFm);
  const finalContent = yaml + body.trimStart();

  if (opts.dryRun) {
    console.group("[ClidePress] Dry run");
    console.log("Source note:", file.path);
    console.log("Type:", type);
    console.log("Would write:", targetMdAbs);
    console.log("Overwrite?:", exists);
    console.log("--- Frontmatter ---");
    console.log(yaml);
    console.log("--- Image / file log ---");
    log.forEach((l) => console.log(l));
    if (warnings.length) {
      console.warn("--- Warnings ---");
      warnings.forEach((w) => console.warn(w));
    }
    console.log("--- Final body preview (first 800 chars) ---");
    console.log(finalContent.slice(0, 800));
    console.groupEnd();
    new Notice(
      `Dry run complete. ${log.length} file ops, ${warnings.length} warnings. See console.`
    );
    return;
  }

  fs.mkdirSync(path.dirname(targetMdAbs), { recursive: true });
  fs.writeFileSync(targetMdAbs, finalContent, "utf8");

  const summary =
    `Published ${file.name} as ${TYPE_LABELS[type]} (${slug})` +
    (warnings.length ? ` with ${warnings.length} warning(s).` : ".");
  new Notice(summary);

  if (warnings.length) {
    console.group("[ClidePress] Warnings");
    warnings.forEach((w) => console.warn(w));
    console.groupEnd();
  }
}

interface PickerContext {
  title: string;
  sourcePath: string;
  defaultType: ContentType;
  defaultSlug: string;
  settings: ClidePressSettings;
}

interface PickerResult {
  type: ContentType;
  slug: string;
}

function pickTypeAndSlug(app: App, ctx: PickerContext): Promise<PickerResult | null> {
  return new Promise((resolve) => {
    const modal = new PublishPickerModal(app, ctx, resolve);
    modal.open();
  });
}

class PublishPickerModal extends Modal {
  private resolved = false;
  private type: ContentType;
  private slug: string;

  private previewNote!: HTMLElement;
  private previewImages!: HTMLElement;
  private warningEl!: HTMLElement;

  constructor(
    app: App,
    private ctx: PickerContext,
    private resolveFn: (v: PickerResult | null) => void
  ) {
    super(app);
    this.type = ctx.defaultType;
    this.slug = ctx.defaultSlug;
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    const ctx = this.ctx;
    this.modalEl.addClass("cp-modal");
    titleEl.setText("Publish to clide");

    const header = contentEl.createDiv({ cls: "cp-modal-header" });
    const titleRow = header.createDiv({ cls: "cp-header-row" });
    titleRow.createDiv({ cls: "cp-header-label", text: "Title" });
    titleRow.createDiv({ cls: "cp-header-value", text: ctx.title });
    const srcRow = header.createDiv({ cls: "cp-header-row" });
    srcRow.createDiv({ cls: "cp-header-label", text: "Source note" });
    srcRow.createDiv({ cls: "cp-header-value cp-mono", text: ctx.sourcePath });

    new Setting(contentEl)
      .setName("Type")
      .setDesc("Which clide section this publishes into.")
      .addDropdown((dd: DropdownComponent) => {
        (["article", "gallery", "project"] as ContentType[]).forEach((t) =>
          dd.addOption(t, TYPE_LABELS[t])
        );
        dd.setValue(this.type).onChange((value: ContentType) => {
          this.type = value;
          this.updatePreview();
        });
      });

    new Setting(contentEl)
      .setName("Slug")
      .setDesc("Folder name and URL stem. Lowercase, dashes.")
      .addText((text: TextComponent) => {
        text.setValue(this.slug).onChange((value) => {
          this.slug = slugify(value) || "untitled";
          this.updatePreview();
        });
      });

    const grid = contentEl.createDiv({ cls: "cp-field-grid" });
    grid.createDiv({ cls: "cp-field-label", text: "Note →" });
    this.previewNote = grid.createDiv({ cls: "cp-field-value" });
    grid.createDiv({ cls: "cp-field-label", text: "Images →" });
    this.previewImages = grid.createDiv({ cls: "cp-field-value" });

    this.warningEl = contentEl.createEl("p", { cls: "cp-warning" });
    this.warningEl.hide();

    this.updatePreview();

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.resolved = true;
          this.resolveFn(null);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Publish")
          .setCta()
          .onClick(() => {
            this.resolved = true;
            this.resolveFn({ type: this.type, slug: this.slug });
            this.close();
          })
      );
  }

  private updatePreview(): void {
    const { settings } = this.ctx;
    const sectionSubpath = settings[this.type].sectionSubpath;
    const targetMdAbs = path.join(settings.repoRoot, sectionSubpath, this.slug, "INDEX.md");
    const imagesAbsDir = path.join(settings.repoRoot, settings.imagesSubpath, this.slug);

    this.previewNote.setText(targetMdAbs);
    this.previewImages.setText(imagesAbsDir);

    if (fs.existsSync(targetMdAbs)) {
      this.warningEl.setText("⚠ The target note already exists and will be overwritten.");
      this.warningEl.show();
    } else {
      this.warningEl.hide();
    }
  }

  onClose(): void {
    if (!this.resolved) this.resolveFn(null);
    this.contentEl.empty();
  }
}
