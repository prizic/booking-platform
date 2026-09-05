export function applyPrivateNoStoreHeaders(headers: Headers): void {
  headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Expires", "0");
  headers.set("Pragma", "no-cache");
}
