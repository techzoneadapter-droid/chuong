// Bound each page, including imported chapters containing a single huge paragraph.
// Slicing preserves every character; prefer a word boundary when one is nearby.
export function paginateReader(content: string[], target: number): string[][] {
  const pages: string[][] = [];
  let page: string[] = [], size = 0;
  const limit = Math.max(200, Math.floor(target));
  for (const paragraph of content) {
    let from = 0;
    do {
      let end = Math.min(paragraph.length, from + limit);
      if (end < paragraph.length) {
        const space = paragraph.lastIndexOf(' ', end);
        if (space > from + limit * .7) end = space + 1;
        // Never split a surrogate pair.
        if (end > from && /[\uD800-\uDBFF]/.test(paragraph[end - 1])) end--;
      }
      const chunk = paragraph.slice(from, end);
      if (page.length && size + chunk.length + 2 > limit) { pages.push(page); page = []; size = 0; }
      page.push(chunk); size += chunk.length + 2;
      from = end;
    } while (from < paragraph.length);
  }
  if (page.length || !pages.length) pages.push(page);
  return pages;
}
