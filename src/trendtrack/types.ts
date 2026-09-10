export type TrendtrackMediaType = "image" | "video" | "carousel" | string;

export interface TrendtrackAdSummary {
  id: string;
  collationId?: string | null;
  platform?: string;
  status?: string;
  mediaType?: TrendtrackMediaType;
  daysRunning?: number;
  createdAt?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  rank?: number;
  [key: string]: unknown;
}

export interface TrendtrackAdListResponse {
  data: TrendtrackAdSummary[];
  total?: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
}

export interface TrendtrackAdContent {
  /** Usually null in practice - most ads only have body copy, no separate headline. */
  title?: string | null;
  /** The actual ad copy/primary text. */
  body?: string;
  callToAction?: string;
  landingPageUrl?: string;
  landingPageDomain?: string;
  ctaDescription?: string | null;
  ctaLinkDescription?: string | null;
  [key: string]: unknown;
}

export interface TrendtrackAdRank {
  positionInPage?: number;
  currentRank?: number;
  rankDelta?: number | null;
  improvementPct?: number | null;
}

export interface TrendtrackAdMetrics {
  reach?: number;
  reachDelta1d?: number;
  reachDelta7d?: number;
  reachDelta30d?: number;
  [key: string]: unknown;
}

export interface TrendtrackAdvertiser {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export interface TrendtrackAdDetail {
  id: string;
  collationId?: string | null;
  platform?: string;
  status?: string;
  createdAt?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  daysRunning?: number;
  /** Note: the nested media type field is `type`, not `mediaType`. */
  media?: { type?: TrendtrackMediaType; mediaUrl?: string; thumbnailUrl?: string | null };
  advertiser?: TrendtrackAdvertiser;
  content?: TrendtrackAdContent;
  metrics?: TrendtrackAdMetrics;
  audience?: unknown;
  rank?: TrendtrackAdRank;
  flags?: unknown;
  /** Either a plain transcript string, or `{ language, segments, fullText, ... }` for videos. */
  transcript?: string | { fullText?: string; [key: string]: unknown } | null;
  creativeAnalysis?: string | { hook?: { text?: string; [key: string]: unknown }; [key: string]: unknown } | null;
  links?: unknown;
  shops?: unknown;
  pageAnalytics?: unknown;
  [key: string]: unknown;
}

/** The API wraps every single-resource response as `{ requestId, data }`. */
export interface TrendtrackEnvelope<T> {
  requestId?: string;
  data: T;
}

export interface TrendtrackMediaUrlResponse {
  mediaType: TrendtrackMediaType;
  url: string;
  urlType?: string;
  mediaUrl: string;
  thumbnailUrl?: string | null;
  filename?: string;
}

export interface TrendtrackLookupMatch {
  id: string;
  name?: string;
  facebookPageId?: string;
  domain?: string;
}

/** One row of GET /v1/lookup's `data` array. */
export interface TrendtrackLookupResult {
  type: "brandtracker" | "advertiser" | "shop";
  matchType: "exact" | "fuzzy";
  matchField: "name" | "domain" | "facebookPageId" | "instagramHandle";
  score: number;
  brandtracker?: TrendtrackLookupMatch;
  advertiser?: TrendtrackLookupMatch;
  shop?: TrendtrackLookupMatch;
  signals?: { hasAdvertiser?: boolean; [key: string]: unknown };
}

/** One row of GET /v1/shops/{shopId}/advertisers's `data` array. */
export interface TrendtrackShopAdvertiser {
  id: string;
  platform?: string;
  facebookPageId?: string;
  name?: string;
  isPrimary?: boolean;
  activeAds?: number;
}

/** `data` from POST /v1/ads/{adId}/share - a public TrendTrack webapp preview link for one ad. */
export interface TrendtrackAdShare {
  adId: string;
  id: string;
  slug?: string;
  shareUrl: string;
  sharePath?: string;
  createdAt?: string;
}

export type TrendtrackSortBy = "longestRunning" | "reach" | "duplicates" | "newest" | "createdAt";

export interface ListAdsParams {
  limit?: number;
  offset?: number;
  status?: string;
  mediaType?: string;
  sortBy?: TrendtrackSortBy;
  order?: "asc" | "desc";
  cpm?: number;
}
