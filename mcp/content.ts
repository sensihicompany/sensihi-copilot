/**
 * Optional fallback when vector search returns no results.
 * Can be extended to fetch static pages or a sitemap.
 */
export async function getFallbackContent(_query: string): Promise<string[]> {
  // e.g. return static sensihi.com snippets or fetch /sitemap
  return []
}
