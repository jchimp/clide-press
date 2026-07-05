import { Plugin } from "obsidian";
import {
  DEFAULT_SETTINGS,
  ClidePressSettings,
  ClidePressSettingTab
} from "./src/settings";
import { publishActiveNote } from "./src/publisher";

export default class ClidePressPlugin extends Plugin {
  settings!: ClidePressSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "clide-press-publish-current",
      name: "Publish current note",
      callback: () => publishActiveNote(this.app, this.settings, { dryRun: false })
    });

    this.addCommand({
      id: "clide-press-publish-current-dry-run",
      name: "Publish current note (dry run)",
      callback: () => publishActiveNote(this.app, this.settings, { dryRun: true })
    });

    this.addRibbonIcon("upload-cloud", "ClidePress Publish", () => {
      publishActiveNote(this.app, this.settings, { dryRun: false });
    });

    this.addSettingTab(new ClidePressSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
