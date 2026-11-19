/**
 * The version of the app on the server: the ETag of the start page changes with every build.
 * Null when the server does not answer, so a dead connection never looks like an update.
 */
export async function serverVersion(): Promise<string | null> {
  try {
    const response = await fetch("/", { method: "HEAD", cache: "no-store" });
    return response.ok ? response.headers.get("etag") : null;
  } catch {
    return null;
  }
}
