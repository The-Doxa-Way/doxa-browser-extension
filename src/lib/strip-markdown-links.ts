/**
 * Encouragement text arrives with inline markdown links like
 * "[Joshua 4:6-7](https://doxa.app/...)". The toast and popup render plain
 * text, and the scriptures array already carries the same links as pills,
 * so collapse each link to its visible text.
 */
export function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1');
}
