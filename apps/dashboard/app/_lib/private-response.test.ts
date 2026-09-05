import { describe, expect, it } from "vitest";

import { applyPrivateNoStoreHeaders } from "./private-response";

describe("private Dashboard response headers", () => {
  it("overwrites shared-cache headers with fail-closed directives", () => {
    const headers = new Headers({ "Cache-Control": "public, s-maxage=3600" });
    applyPrivateNoStoreHeaders(headers);

    expect(headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0, must-revalidate",
    );
    expect(headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(headers.get("Pragma")).toBe("no-cache");
  });
});
