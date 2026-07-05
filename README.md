# ClidePress (Obsidian Plugin)

Publish the active Obsidian note into a local clone of your
[clide](https://github.com/) static-site repo, as an **Article**, **Gallery**, or **Project**.

## What it does

- Prompts for the note's **type** (Article / Gallery / Project) and a **slug**, pre-filled
  by matching the note's vault folder against your configured per-type vault folders and
  slugifying its title. Both are editable in the dialog before publishing.
- Writes the note to `<repo>/<section-subpath>/<slug>/INDEX.md`, matching clide's
  one-folder-per-page convention (`docs/articles/<slug>/INDEX.md`, `docs/gallery/<slug>/INDEX.md`,
  `docs/projects/<slug>/INDEX.md` by default).
- Copies referenced images into `<repo>/images/<slug>/`, **keeping their original filenames**
  (clide's source convention — no slugifying image names). Rewrites:
  - `![[image.png]]` and `![[image.png|alt]]` → `![alt](../../../images/<slug>/image.png)`
  - Standard MD images with local paths get rewritten the same way.
  - For **Gallery** notes, each rewritten image is placed on its own blank-line-separated
    line, matching clide's convention for grid/lightbox images (a lone image in its own paragraph).
- Rewrites non-image wikilinks: `[[Note]]` / `[[Note|alias]]` → a relative HTML link
  `[alias](../<section>/<slug>.html)`, resolving the target note's type from its vault
  folder. clide has no wikilink support, so this is required for any inter-note links to
  render. (Or, optionally, strip to plain text instead.)
- Injects clide-shaped YAML frontmatter, carrying `title` / `date` / `description` / `tags`
  over from the note's existing frontmatter where present:
  ```yaml
  ---
  title: "Sanitized Title"
  date: 2026-06-27
  description: "Optional description"
  tags: [tag-one, tag-two]
  ---
  ```
  `title` is always emitted — clide silently skips any `.md` with no frontmatter, so a
  missing title would drop the page entirely. YAML-unsafe characters in the title
  (`: # [ ] { } | > ! & * ? % @ \``) are stripped.
- Shows the publish dialog with the resolved **Note →** and **Images →** destination paths,
  live-updating as you change type/slug (and warns if the target note already exists).
  Skipped only when **Confirm before publish** is off and the note's vault folder
  unambiguously matched one configured type.
- Skips remote images (`http(s)://`, `data:`).
- Dedupes images by SHA-256; on filename collision with different content, appends a short hash suffix.

## What it does NOT do

- Does not run git. Commit/push however you normally do.
- Does not bulk-publish folders. Single active note only.
- Does not convert Obsidian callouts (`> [!note]`) to any special syntax.
- Does not build the site. Run `clide build` (or `clide serve`) yourself afterward.

## Install (manual)

ClidePress is not in the Obsidian Community Plugins directory; install it by hand
from a GitHub release.

1. Go to the [**Releases**](../../releases/latest) page and download these three
   files from the latest release:
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. Create the folder `<your-vault>/.obsidian/plugins/clide-press/` and drop the three
   files into it.
3. In Obsidian: **Settings → Community plugins**, make sure *Restricted mode* is
   **off**, then enable **ClidePress**.
4. Open the plugin's settings tab and set **Repo root** (absolute path to your clide
   repo clone); adjust the per-type vault folder / section subpath if needed.

To update later, replace those three files with the ones from a newer release.

## Build from source / dev setup

1. **Clone or unzip this folder** somewhere convenient (NOT inside the vault).
2. `npm install`
3. `npm run dev` (watch build) or `npm run build` (one-shot production build).
4. Copy or symlink `main.js`, `manifest.json`, and `styles.css` into:
   ```
   <your-vault>/.obsidian/plugins/clide-press/
   ```
   On Windows you can do this with `mklink /J`:
   ```
   mklink /J "C:\path\to\vault\.obsidian\plugins\clide-press" "C:\path\to\this\repo"
   ```
5. In Obsidian: **Settings → Community plugins** → enable **ClidePress**.
6. Open the plugin's settings tab and set:
   - **Repo root** (absolute path to your clide repo clone)
   - Per-type vault folder + section subpath (Article/Gallery/Project)

## Usage

- Open the note in Obsidian.
- Command palette: **ClidePress: Publish current note**.
- Or use the ribbon icon (cloud-upload).
- Pick (or confirm) the type and slug in the dialog, then **Publish**.
- For a no-write preview, use **Publish current note (dry run)** and open the developer
  console (Ctrl+Shift+I) to see what it would do.

## File layout

```
clide-press/
  main.ts                 plugin entry, command registration
  src/
    publisher.ts          orchestration: read -> transform -> write, publish picker modal
    frontmatter.ts         clide-shaped YAML build + title sanitization
    slug.ts                websafe slug helper
    images.ts              image resolution, copy, dedup, path rewrite (+ copyAsset)
    wikilinks.ts           non-image wikilink conversion to relative HTML links
    settings.ts            settings tab UI + defaults
  styles.css               publish-dialog styling (header, two-column grid, warning)
  manifest.json
  package.json
  tsconfig.json
  esbuild.config.mjs
  README.md
  .gitignore
```

## Known limitations / future work

- Non-image embeds (e.g. `![[some-note]]`) are left untouched and warned about; clide
  won't render them.
- No granular date control yet beyond carrying over an existing `date` field or defaulting
  to today.
- No callout/admonition translation.
- No automatic cleanup of orphaned previously-published pages: republishing under a new
  slug (e.g. after a rename) leaves the old output folder behind.
- Two notes that slug to the same value publish to the same folder; the publish dialog's
  overwrite warning is the only guard.

## Releasing (maintainer)

```sh
npm version patch   # or minor / major — bumps manifest.json + versions.json, commits, tags (no "v" prefix)
git push --follow-tags
```

## License

MIT
