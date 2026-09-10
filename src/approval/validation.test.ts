import { describe, expect, it } from "vitest";
import { validateApprovalCandidate, type ApprovalCandidate, type MetaAccountConfig } from "./validation.js";

const fullCandidate: ApprovalCandidate = {
  ourCreativeUrl: "https://drive.google.com/our-ad",
  ourPrimaryText: "Our copy",
  ourHeadline: "Our headline",
  ourCta: "SHOP_NOW",
  ourLandingPageUrl: "https://ours.com/lp",
  launchDate: "2026-09-15",
  launchTime: "10:00",
  timezone: "America/New_York",
};

const fullMeta: MetaAccountConfig = {
  accessToken: "token",
  adAccountId: "act_123",
  pageId: "page_1",
  campaignId: "camp_1",
  adSetId: "set_1",
};

describe("validateApprovalCandidate", () => {
  it("passes a fully specified candidate", () => {
    expect(validateApprovalCandidate(fullCandidate, fullMeta)).toEqual({ ok: true });
  });

  it("blocks when landing page is missing", () => {
    const result = validateApprovalCandidate({ ...fullCandidate, ourLandingPageUrl: "" }, fullMeta);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/landing page/i);
  });

  it("blocks when our creative is missing", () => {
    const result = validateApprovalCandidate(
      { ...fullCandidate, ourCreativeUrl: null, ourCreativeStorageUrl: null },
      fullMeta,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/creative/i);
  });

  it("accepts storage URL as an alternative to a manual creative URL", () => {
    const result = validateApprovalCandidate(
      { ...fullCandidate, ourCreativeUrl: null, ourCreativeStorageUrl: "s3://bucket/x.mp4" },
      fullMeta,
    );
    expect(result.ok).toBe(true);
  });

  it("blocks when launch date is missing", () => {
    const result = validateApprovalCandidate({ ...fullCandidate, launchDate: "" }, fullMeta);
    expect(result.reason).toMatch(/launch date/i);
  });

  it("blocks on an invalid timezone", () => {
    const result = validateApprovalCandidate({ ...fullCandidate, timezone: "Not/AZone" }, fullMeta);
    expect(result.reason).toMatch(/timezone/i);
  });

  it("blocks on an invalid landing page URL", () => {
    const result = validateApprovalCandidate({ ...fullCandidate, ourLandingPageUrl: "not-a-url" }, fullMeta);
    expect(result.reason).toMatch(/landing page/i);
  });

  it("blocks when Meta account is not configured", () => {
    const result = validateApprovalCandidate(fullCandidate, { ...fullMeta, accessToken: "" });
    expect(result.reason).toMatch(/META_ACCESS_TOKEN/);
  });

  it("blocks when no campaign is configured", () => {
    const result = validateApprovalCandidate(fullCandidate, { ...fullMeta, campaignId: "" });
    expect(result.reason).toMatch(/campaign/i);
  });

  it("blocks when no ad set is configured", () => {
    const result = validateApprovalCandidate(fullCandidate, { ...fullMeta, adSetId: "" });
    expect(result.reason).toMatch(/ad set/i);
  });
});
