import { describe, expect, it } from "vitest";
import { replyIsDue } from "../webhook-processor.server";

describe("reply delay", () => {
  const t0 = Date.parse("2026-11-12T20:00:00Z");
  it("waits 47s before replying", () => {
    expect(replyIsDue("2026-11-12T20:00:00Z", 47, t0 + 46_000)).toBe(false);
    expect(replyIsDue("2026-11-12T20:00:00Z", 47, t0 + 47_000)).toBe(true);
  });
});
