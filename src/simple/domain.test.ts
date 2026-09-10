import { describe, expect, it } from "vitest";
import { extractDomain } from "./domain.js";

describe("extractDomain", () => {
  it("extracts the hostname from a full URL", () => {
    expect(extractDomain("https://www.acme.com/landing-page?utm=1")).toBe("acme.com");
  });

  it("strips www", () => {
    expect(extractDomain("https://www.example.com")).toBe("example.com");
  });

  it("accepts a bare domain without a scheme", () => {
    expect(extractDomain("acme.com/some/page")).toBe("acme.com");
  });

  it("throws a clear error on garbage input", () => {
    expect(() => extractDomain("not a url at all !!!")).toThrow();
  });
});
