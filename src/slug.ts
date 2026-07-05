// Unicode combining diacritical marks (U+0300–U+036F); used to strip accents
// left behind after NFKD normalization.
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Turn arbitrary text into a websafe slug:
 *   "My Great Post! (2026)" -> "my-great-post-2026"
 *
 * - NFKD-normalize and strip diacritics so accented letters fold to ASCII
 * - lowercase
 * - replace any run of non-alphanumeric chars with a single dash
 * - trim leading/trailing dashes
 *
 * May return an empty string if `text` has no alphanumeric content; callers that
 * need a non-empty result should supply a fallback.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
