import { isValidTimezone } from "../scheduling/launchTime.js";

export interface ApprovalCandidate {
  ourCreativeStorageUrl?: string | null;
  ourCreativeUrl?: string | null;
  ourPrimaryText?: string | null;
  ourHeadline?: string | null;
  ourCta?: string | null;
  ourLandingPageUrl?: string | null;
  launchDate?: string | null;
  launchTime?: string | null;
  timezone?: string | null;
}

export interface MetaAccountConfig {
  accessToken: string;
  adAccountId: string;
  pageId: string;
  campaignId: string;
  adSetId: string;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Gate before anything is allowed into the Meta publishing pipeline. Only a
 * fully-specified row may transition to APPROVED; everything else is
 * BLOCKED with a specific, human-readable reason.
 */
export function validateApprovalCandidate(
  candidate: ApprovalCandidate,
  meta: MetaAccountConfig,
): ValidationResult {
  const hasCreative = Boolean(candidate.ourCreativeStorageUrl || candidate.ourCreativeUrl);
  if (!hasCreative) return { ok: false, reason: "Missing our creative (creative URL or upload)" };
  if (!candidate.ourPrimaryText?.trim()) return { ok: false, reason: "Missing our primary text/copy" };
  if (!candidate.ourHeadline?.trim()) return { ok: false, reason: "Missing our headline" };
  if (!candidate.ourCta?.trim()) return { ok: false, reason: "Missing our CTA" };
  if (!candidate.ourLandingPageUrl?.trim()) return { ok: false, reason: "Missing landing page" };
  if (!candidate.launchDate?.trim()) return { ok: false, reason: "Missing launch date" };
  if (!candidate.timezone?.trim()) return { ok: false, reason: "Missing timezone" };
  if (!isValidTimezone(candidate.timezone)) {
    return { ok: false, reason: `Invalid timezone: ${candidate.timezone}` };
  }
  try {
    new URL(candidate.ourLandingPageUrl);
  } catch {
    return { ok: false, reason: `Invalid landing page URL: ${candidate.ourLandingPageUrl}` };
  }

  if (!meta.accessToken) return { ok: false, reason: "Meta account not configured (META_ACCESS_TOKEN)" };
  if (!meta.adAccountId) return { ok: false, reason: "Meta account not configured (META_AD_ACCOUNT_ID)" };
  if (!meta.pageId) return { ok: false, reason: "Meta account not configured (META_PAGE_ID)" };
  if (!meta.campaignId) return { ok: false, reason: "No Meta campaign configured (META_DEFAULT_CAMPAIGN_ID)" };
  if (!meta.adSetId) return { ok: false, reason: "No Meta ad set configured (META_DEFAULT_ADSET_ID)" };

  return { ok: true };
}
