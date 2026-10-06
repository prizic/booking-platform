import { expect, it } from "vitest";
import { authenticatorQrCode } from "./auth-qr-code";
it("preserves SVG while encoding whitespace and URI delimiters", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text># &</text></svg>\n';
  const image = authenticatorQrCode(`data:image/svg+xml;utf-8,${svg}`);
  expect(image).not.toMatch(/[\r\n ]/u);
  expect(decodeURIComponent(image.slice(image.indexOf(",") + 1))).toBe(svg);
  expect(() => authenticatorQrCode("https://example.invalid/image")).toThrow();
});
