import { describe, expect, it } from "vitest";
import { workspaceStamp } from "./status-stamp";

describe("workspace status stamps", () => {
  it("never reads a queued or sent message as delivered", () => {
    expect(workspaceStamp("queued")).toBe("pending");
    expect(workspaceStamp("sending")).toBe("pending");
    expect(workspaceStamp("sent")).toBe("active");
    expect(workspaceStamp("delivered")).toBe("confirmed");
  });
  it("marks failures as failed and unknown states as neutral", () => {
    expect(workspaceStamp("failed")).toBe("failed");
    expect(workspaceStamp("bounced")).toBe("failed");
    expect(workspaceStamp("something_new")).toBe("neutral");
  });
});
