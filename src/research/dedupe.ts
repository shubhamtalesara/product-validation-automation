import { normalizeMediaUrl, normalizeText } from "../lib/hash.js";

export interface DedupCandidate {
  id: string;
  collationId?: string | null;
  advertiserId: string;
  mediaUrl?: string | null;
  headline?: string | null;
  primaryText?: string | null;
  mediaHash?: string | null;
  reach?: number | null;
  daysRunning?: number | null;
}

export interface DedupGroup<T extends DedupCandidate> {
  fingerprint: string;
  representative: T;
  members: T[];
  duplicateCount: number;
}

/**
 * Computes a stable fingerprint for a creative concept.
 *
 * Priority order:
 *  1. TrendTrack's own `collationId` (scoped per advertiser) when present -
 *     trust TrendTrack's own grouping of related Meta ad instances.
 *  2. A media fingerprint/hash, when the asset has already been downloaded.
 *  3. Fallback: normalized media URL + normalized headline + normalized
 *     primary text + advertiser ID. All four must match, so genuinely
 *     different variants (different copy, different creative) are never
 *     collapsed together.
 */
export function computeFingerprint(candidate: DedupCandidate): string {
  if (candidate.collationId) {
    return `collation:${candidate.advertiserId}:${candidate.collationId}`;
  }
  if (candidate.mediaHash) {
    return `hash:${candidate.advertiserId}:${candidate.mediaHash}`;
  }
  const normMedia = normalizeMediaUrl(candidate.mediaUrl);
  const normHeadline = normalizeText(candidate.headline);
  const normCopy = normalizeText(candidate.primaryText);
  return `fallback:${candidate.advertiserId}:${normMedia}:${normHeadline}:${normCopy}`;
}

function pickRepresentative<T extends DedupCandidate>(members: T[]): T {
  return members.reduce((best, current) => {
    const bestReach = best.reach ?? -1;
    const currentReach = current.reach ?? -1;
    if (currentReach !== bestReach) return currentReach > bestReach ? current : best;
    const bestDays = best.daysRunning ?? -1;
    const currentDays = current.daysRunning ?? -1;
    return currentDays > bestDays ? current : best;
  }, members[0]);
}

/**
 * Groups Meta-ad-instance-level records into creative concepts. A creative
 * that appears as 8 near-identical Meta ads collapses into a single group
 * with `duplicateCount = 8`, so it occupies one Top-N slot, not eight.
 */
export function dedupeCreatives<T extends DedupCandidate>(candidates: T[]): DedupGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const candidate of candidates) {
    const fingerprint = computeFingerprint(candidate);
    const existing = groups.get(fingerprint);
    if (existing) {
      existing.push(candidate);
    } else {
      groups.set(fingerprint, [candidate]);
    }
  }

  const result: DedupGroup<T>[] = [];
  for (const [fingerprint, members] of groups.entries()) {
    result.push({
      fingerprint,
      representative: pickRepresentative(members),
      members,
      duplicateCount: members.length,
    });
  }
  return result;
}
