/**
 * Build the frontmatter block for a note published to clide.
 *
 * clide silently skips any .md file that has no YAML frontmatter, so `title`
 * is mandatory. Fields (same shape for every content type): title, date,
 * description, tags. See src/clide/builder.py::load_page in the clide repo.
 *
 * Values are carried over from the note's own existing frontmatter where
 * present, falling back to derived defaults (title from first H1, date from
 * today).
 */

export interface ExistingFrontmatter {
  title?: unknown;
  date?: unknown;
  description?: unknown;
  tags?: unknown;
}

export interface FrontmatterResult {
  yaml: string;
  title: string;
}

/**
 * Find the first H1 (`# Heading`) line in the body and return its text.
 * Falls back to a provided default if none is found.
 */
export function extractTitleFromBody(body: string, fallback: string): string {
  // Strip an existing frontmatter block before scanning so we don't pick up
  // a `# something` inside it (rare but possible).
  const stripped = body.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const lines = stripped.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return m[1].trim();
  }
  return fallback;
}

/**
 * Sanitize a title for safe inclusion as a double-quoted YAML scalar.
 * - Replace YAML-breaking and filesystem-iffy characters with a space
 * - Collapse whitespace
 * - Escape any remaining double quotes and backslashes
 */
export function sanitizeTitle(raw: string): string {
  // Replace characters that frequently cause YAML parse issues or just look ugly.
  // Colon is the big one. Also handle some quote-y bits.
  let t = raw
    .replace(/[:#\[\]{}|>!&*?%@`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Escape backslash first, then double quotes, for safe quoting.
  t = t.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return t;
}

/**
 * Today's date in YYYY-MM-DD using local time.
 */
export function todayISODate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Quote a scalar for safe inclusion as a double-quoted YAML string. */
function quoteYamlString(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** True if `value` looks like a valid YYYY-MM-DD date string. */
function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

/**
 * Normalize an existing `tags` value (YAML list, or comma/space separated
 * string) into a `tags: [a, b]` flow-sequence line. Returns null if there are
 * no usable tags.
 */
function normalizeTags(raw: unknown): string | null {
  let items: string[];
  if (Array.isArray(raw)) {
    items = raw.map((t) => String(t).trim());
  } else if (typeof raw === "string") {
    items = raw.split(/[,\s]+/).map((t) => t.trim());
  } else {
    return null;
  }
  items = items.filter((t) => t.length > 0);
  if (items.length === 0) return null;
  return `[${items.map((t) => quoteYamlString(t)).join(", ")}]`;
}

/**
 * Build the YAML frontmatter block (with leading/trailing `---` fences) in
 * clide's expected shape, carrying over title/date/description/tags from the
 * note's existing frontmatter where present.
 */
export function buildFrontmatter(
  body: string,
  fallbackTitle: string,
  existing: ExistingFrontmatter | undefined,
  now: Date = new Date()
): FrontmatterResult {
  const rawTitle =
    typeof existing?.title === "string" && existing.title.trim().length > 0
      ? existing.title.trim()
      : extractTitleFromBody(body, fallbackTitle);
  const safeTitle = sanitizeTitle(rawTitle);

  const date = isIsoDate(existing?.date) ? (existing!.date as string).trim() : todayISODate(now);

  const description =
    typeof existing?.description === "string" && existing.description.trim().length > 0
      ? existing.description.trim()
      : null;

  const tags = normalizeTags(existing?.tags);

  let yaml = `---\n` + `title: "${safeTitle}"\n` + `date: ${date}\n`;
  if (description) yaml += `description: "${quoteYamlString(description)}"\n`;
  if (tags) yaml += `tags: ${tags}\n`;
  yaml += `---\n`;

  return { yaml, title: safeTitle };
}

/**
 * If the body already starts with a `---\n...\n---\n` block, strip it so
 * we can replace it with our generated one. This avoids double frontmatter.
 */
export function stripExistingFrontmatter(body: string): string {
  return body.replace(/^---\n[\s\S]*?\n---\n?/, "");
}
