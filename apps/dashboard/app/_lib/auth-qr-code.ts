/** The Auth SDK returns an SVG data URI containing literal XML/newlines.
 * Encode the payload so image validation accepts it without logging the XML. */
export function authenticatorQrCode(source: string): string {
  const prefix = "data:image/svg+xml;utf-8,";
  if (!source.startsWith(prefix)) throw new Error("Unsupported authenticator image");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source.slice(prefix.length))}`;
}
