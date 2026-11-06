/** The host of a library's page, or null unless it is a plain web link. Library data is third-party, so nothing else may become a link. */
export function webHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}
