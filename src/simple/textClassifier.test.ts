import { describe, expect, it } from "vitest";
import { classifyText, type ClassificationRule } from "./textClassifier.js";

const angles: ClassificationRule[] = [
  { name: "Erectile Dysfunction", keywords: ["erectile", "erection"] },
  { name: "Nerve Pain", keywords: ["nerve pain", "neuropathy", "tingling"] },
];

describe("classifyText", () => {
  it("returns an empty string (not the fallback) when no rules are configured", () => {
    expect(classifyText("some ad copy about nerve pain", [])).toBe("");
  });

  it("matches a rule whose keyword appears in the text, case-insensitively", () => {
    expect(classifyText("Struggling with ERECTION issues?", angles)).toBe("Erectile Dysfunction");
  });

  it("matches on a multi-word keyword phrase", () => {
    expect(classifyText("This nerve pain relief formula works fast", angles)).toBe("Nerve Pain");
  });

  it("falls back to the default label when rules exist but none match", () => {
    expect(classifyText("Get glowing skin in 7 days", angles)).toBe("Uncategorized");
  });

  it("accepts a custom fallback label", () => {
    expect(classifyText("Get glowing skin in 7 days", angles, "Other")).toBe("Other");
  });

  it("returns the first matching rule in list order when text matches more than one", () => {
    const overlapping: ClassificationRule[] = [
      { name: "First", keywords: ["pain"] },
      { name: "Second", keywords: ["pain"] },
    ];
    expect(classifyText("chronic pain relief", overlapping)).toBe("First");
  });
});
