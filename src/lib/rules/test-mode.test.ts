import { describe, expect, it } from "vitest";
import { aiAllowedFor } from "./test-mode";

describe("test mode", () => {
  it("answers the owner's test number ending 0191", () => {
    expect(aiAllowedFor("553195650191", true, "553195650191")).toBe(true);
    expect(aiAllowedFor("5531995650191", true, "+55 31 9565-0191")).toBe(true);
  });
  it("ignores other numbers while testing", () => {
    expect(aiAllowedFor("5511988887777", true, "553195650191")).toBe(false);
  });
  it("answers everyone when test mode is off", () => {
    expect(aiAllowedFor("5511988887777", false, "553195650191")).toBe(true);
  });
});
