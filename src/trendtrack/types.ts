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
  primaryText?: string;
  headline?: string;
  cta?: string;
  landingPageUrl?: string;
  [key: string]: unknown;
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
  media?: { mediaType?: TrendtrackMediaType; url?: string; thumbnailUrl?: string };
  advertiser?: TrendtrackAdvertiser;
  content?: TrendtrackAdContent;
  metrics?: TrendtrackAdMetrics;
  audience?: unknown;
  rank?: number;
  rankDelta?: number;
  flags?: unknown;
  transcript?: string;
  creativeAnalysis?: string;
  links?: unknown;
  shops?: unknown;
  pageAnalytics?: unknown;
  [key: string]: unknown;
}

export interface TrendtrackMediaUrlResponse {
  mediaType: TrendtrackMediaType;
  url: string;
  urlType?: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  filename?: string;
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
