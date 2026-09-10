import { HttpClient } from "../lib/httpClient.js";
import { createLogger } from "../lib/logger.js";
import type {
  ListAdsParams,
  TrendtrackAdDetail,
  TrendtrackAdListResponse,
  TrendtrackEnvelope,
  TrendtrackLookupResult,
  TrendtrackMediaUrlResponse,
  TrendtrackShopAdvertiser,
} from "./types.js";

const logger = createLogger("trendtrack");

export interface TrendtrackClientOptions {
  apiKey: string;
  baseUrl: string;
}

/**
 * Client for the TrendTrack API. Only wraps the three documented endpoints
 * we need: advertiser ad listing, ad detail, and media URL resolution.
 */
export class TrendtrackClient {
  private readonly http: HttpClient;
  private readonly apiKey: string;

  constructor(options: TrendtrackClientOptions) {
    this.apiKey = options.apiKey;
    this.http = new HttpClient(options.baseUrl, { logger });
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  /** GET /v1/advertisers/{advertiserId}/ads */
  async listAdvertiserAds(
    advertiserId: string,
    params: ListAdsParams = {},
  ): Promise<TrendtrackAdListResponse> {
    return this.http.request<TrendtrackAdListResponse>(`/v1/advertisers/${advertiserId}/ads`, {
      method: "GET",
      headers: this.authHeaders(),
      query: {
        limit: params.limit,
        offset: params.offset,
        status: params.status,
        mediaType: params.mediaType,
        sortBy: params.sortBy,
        order: params.order,
        cpm: params.cpm,
      },
    });
  }

  /**
   * Paginates through all active ads for an advertiser up to `maxRecords`,
   * following `hasMore`/`total` from the API.
   */
  async *paginateAdvertiserAds(
    advertiserId: string,
    params: ListAdsParams = {},
    maxRecords = 500,
  ): AsyncGenerator<TrendtrackAdListResponse["data"][number]> {
    const pageSize = params.limit ?? 50;
    let offset = params.offset ?? 0;
    let fetched = 0;

    while (fetched < maxRecords) {
      const page = await this.listAdvertiserAds(advertiserId, {
        ...params,
        limit: pageSize,
        offset,
      });
      const items = page.data ?? [];
      for (const item of items) {
        if (fetched >= maxRecords) return;
        yield item;
        fetched += 1;
      }
      const noMorePages =
        items.length === 0 ||
        page.hasMore === false ||
        (page.total !== undefined && offset + items.length >= page.total);
      if (noMorePages) return;
      offset += items.length;
    }
  }

  /**
   * GET /v1/ads/{adId}
   * Single-resource responses are wrapped as `{ requestId, data }` - unwrap
   * here so every caller works with the ad object directly.
   */
  async getAdDetail(adId: string): Promise<TrendtrackAdDetail> {
    const envelope = await this.http.request<TrendtrackEnvelope<TrendtrackAdDetail>>(
      `/v1/ads/${adId}`,
      { method: "GET", headers: this.authHeaders() },
    );
    return envelope.data;
  }

  /** GET /v1/ads/{adId}/media-url - also wrapped as `{ requestId, data }`. */
  async getAdMediaUrl(adId: string): Promise<TrendtrackMediaUrlResponse> {
    const envelope = await this.http.request<TrendtrackEnvelope<TrendtrackMediaUrlResponse>>(
      `/v1/ads/${adId}/media-url`,
      { method: "GET", headers: this.authHeaders() },
    );
    return envelope.data;
  }

  /**
   * GET /v1/lookup?q=... - resolves a brand name, domain, Facebook page ID,
   * or Instagram handle to candidate brandtracker/advertiser/shop matches.
   * Zero-credit. Returns `data`, an array of `{ type, matchType, score,
   * brandtracker?, advertiser?, shop? }` rows - exact matches first.
   */
  async lookup(
    query: string,
    options: { type?: "auto" | "brandtracker" | "advertiser" | "shop"; limit?: number } = {},
  ): Promise<TrendtrackLookupResult[]> {
    const envelope = await this.http.request<{ data?: TrendtrackLookupResult[] }>("/v1/lookup", {
      method: "GET",
      headers: this.authHeaders(),
      query: { q: query, type: options.type, limit: options.limit },
    });
    return envelope?.data ?? [];
  }

  /**
   * GET /v1/shops/{shopId}/advertisers - every Facebook advertiser page
   * linked to one shop, so a multi-page brand's ads can be pooled together.
   */
  async getShopAdvertisers(shopId: string): Promise<TrendtrackShopAdvertiser[]> {
    const envelope = await this.http.request<{ data?: TrendtrackShopAdvertiser[] }>(
      `/v1/shops/${encodeURIComponent(shopId)}/advertisers`,
      { method: "GET", headers: this.authHeaders() },
    );
    return envelope?.data ?? [];
  }
}
