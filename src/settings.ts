import { App, PluginSettingTab, Setting } from "obsidian";
import type ClidePressPlugin from "../main";

/** Per-content-type config: which vault folder it comes from, and which clide
 * section (docs/<section>/) it publishes into. */
export interface TypeConfig {
  vaultFolder: string;
  sectionSubpath: string;
}

export type ContentType = "article" | "gallery" | "project";

export interface ClidePressSettings {
  repoRoot: string;
  article: TypeConfig;
  gallery: TypeConfig;
  project: TypeConfig;
  imagesSubpath: string;
  imageLinkPrefix: string;
  wikilinkBehavior: "convert-html" | "strip";
  confirmBeforePublish: boolean;
}

export const DEFAULT_SETTINGS: ClidePressSettings = {
  repoRoot: "",
  article: { vaultFolder: "Articles", sectionSubpath: "docs/articles" },
  gallery: { vaultFolder: "Galleries", sectionSubpath: "docs/gallery" },
  project: { vaultFolder: "Projects", sectionSubpath: "docs/projects" },
  imagesSubpath: "images",
  imageLinkPrefix: "../../../images/",
  wikilinkBehavior: "convert-html",
  confirmBeforePublish: true
};

const TYPE_LABELS: Record<ContentType, string> = {
  article: "Article",
  gallery: "Gallery",
  project: "Project"
};

export class ClidePressSettingTab extends PluginSettingTab {
  plugin: ClidePressPlugin;

  constructor(app: App, plugin: ClidePressPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "ClidePress Settings" });

    new Setting(containerEl)
      .setName("Repo root")
      .setDesc("Absolute path to your local clide site repo (e.g. C:\\repos\\clide)")
      .addText((text) =>
        text
          .setPlaceholder("C:\\repos\\clide")
          .setValue(this.plugin.settings.repoRoot)
          .onChange(async (value) => {
            this.plugin.settings.repoRoot = value.trim();
            await this.plugin.saveSettings();
          })
      );

    for (const type of ["article", "gallery", "project"] as ContentType[]) {
      containerEl.createEl("h3", { text: TYPE_LABELS[type] });

      new Setting(containerEl)
        .setName("Vault folder")
        .setDesc(`Vault folder this type's notes normally live in. Used to pre-select ${TYPE_LABELS[type]} in the publish dialog.`)
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS[type].vaultFolder)
            .setValue(this.plugin.settings[type].vaultFolder)
            .onChange(async (value) => {
              this.plugin.settings[type].vaultFolder = value.trim();
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Section subpath")
        .setDesc("Relative to repo root. The clide docs/<section> this type publishes into.")
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS[type].sectionSubpath)
            .setValue(this.plugin.settings[type].sectionSubpath)
            .onChange(async (value) => {
              this.plugin.settings[type].sectionSubpath = value.trim();
              await this.plugin.saveSettings();
            })
        );
    }

    containerEl.createEl("h3", { text: "Images & links" });

    new Setting(containerEl)
      .setName("Images subpath")
      .setDesc("Relative to repo root. clide serves this folder verbatim as /images/, so this should stay 'images'.")
      .addText((text) =>
        text
          .setPlaceholder("images")
          .setValue(this.plugin.settings.imagesSubpath)
          .onChange(async (value) => {
            this.plugin.settings.imagesSubpath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Image link prefix")
      .setDesc("Prepended to image filenames in the rewritten MD, before the per-note slug folder. clide only reads the basename, so the exact depth just needs to reach the images folder.")
      .addText((text) =>
        text
          .setPlaceholder("../../../images/")
          .setValue(this.plugin.settings.imageLinkPrefix)
          .onChange(async (value) => {
            this.plugin.settings.imageLinkPrefix = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Wikilink behavior (non-image)")
      .setDesc("How to handle [[note]] links to other notes. clide has no wikilink support.")
      .addDropdown((dd) =>
        dd
          .addOption("convert-html", "Convert to relative HTML link + warn if unresolved")
          .addOption("strip", "Strip to plain text")
          .setValue(this.plugin.settings.wikilinkBehavior)
          .onChange(async (value: "convert-html" | "strip") => {
            this.plugin.settings.wikilinkBehavior = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Confirm before publish")
      .setDesc("Show the publish dialog (type, slug, destinations) before each publish. Type selection needs this, so it's on by default.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.confirmBeforePublish).onChange(async (value) => {
          this.plugin.settings.confirmBeforePublish = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
