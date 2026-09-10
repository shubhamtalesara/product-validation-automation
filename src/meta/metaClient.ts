import { PermanentError, RetryableError, toSanitizedMessage } from "../lib/errors.js";
import { withRetry } from "../lib/httpClient.js";
import { createLogger } from "../lib/logger.js";
import type { MetaAdInsights, MetaCreativeInput } from "./types.js";

const logger = createLogger("meta");

export interface MetaClientOptions {
  accessToken: string;
  adAccountId: string;
  apiVersion: string;
  baseUrl?: string;
}

interface MetaErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

function isPermanentMetaError(status: number): boolean {
  if (status === 429) return false;
  if (status >= 500) return false;
  // OAuth/permission errors and validation errors are not retryable.
  return status >= 400;
}

/**
 * Client for the Meta Marketing API (Graph API under /act_{ad_account_id}).
 * Handles image/video upload, ad creative creation, ad creation, status
 * checks, and insights retrieval - the minimal surface this pipeline needs.
 */
export class MetaClient {
  private readonly accessToken: string;
  private readonly adAccountId: string;
  private readonly baseUrl: string;

  constructor(options: MetaClientOptions) {
    this.accessToken = options.accessToken;
    this.adAccountId = options.adAccountId.startsWith("act_")
      ? options.adAccountId
      : `act_${options.adAccountId}`;
    this.baseUrl = options.baseUrl ?? `https://graph.facebook.com/${options.apiVersion}`;
  }

  private async call<T>(
    path: string,
    init: { method?: string; body?: FormData | URLSearchParams } = {},
  ): Promise<T> {
    return withRetry(
      async () => {
        const method = init.method ?? "GET";
        let target = `${this.baseUrl}${path}`;
        let body: FormData | URLSearchParams | undefined;

        if (init.body instanceof FormData) {
          init.body.set("access_token", this.accessToken);
          body = init.body;
        } else {
          const params = init.body ?? new URLSearchParams();
          params.set("access_token", this.accessToken);
          if (method === "GET") {
            target = `${target}?${params.toString()}`;
          } else {
            body = params;
          }
        }

        const response = await fetch(target, { method, body });
        const json = (await response.json().catch(() => ({}))) as MetaErrorBody & T;

        if (!response.ok) {
          const message = json.error?.message ?? response.statusText;
          const sanitized = toSanitizedMessage(message);
          const fullMessage = `Meta API error (${response.status}${json.error?.code ? `, code ${json.error.code}` : ""}) on ${path}: ${sanitized}`;
          if (isPermanentMetaError(response.status)) {
            throw new PermanentError(fullMessage);
          }
          throw new RetryableError(fullMessage);
        }
        return json as T;
      },
      { logger, label: `meta:${path}` },
    );
  }

  /** POST /act_{id}/adimages - returns the image hash to reference in a creative. */
  async uploadImage(bytes: Buffer, filename: string): Promise<string> {
    const form = new FormData();
    form.set("bytes", bytes.toString("base64"));
    const result = await this.call<{ images: Record<string, { hash: string }> }>(
      `/${this.adAccountId}/adimages`,
      { method: "POST", body: form },
    );
    const entry = Object.values(result.images ?? {})[0];
    if (!entry?.hash) throw new PermanentError(`Meta did not return an image hash for ${filename}`);
    return entry.hash;
  }

  /** POST /act_{id}/advideos - returns the video ID to reference in a creative. */
  async uploadVideo(bytes: Buffer, filename: string): Promise<string> {
    const form = new FormData();
    form.set("source", new Blob([bytes]), filename);
    const result = await this.call<{ id: string }>(`/${this.adAccountId}/advideos`, {
      method: "POST",
      body: form,
    });
    if (!result.id) throw new PermanentError(`Meta did not return a video id for ${filename}`);
    return result.id;
  }

  /** POST /act_{id}/adcreatives - our creative, built from object_story_spec. */
  async createAdCreative(input: MetaCreativeInput): Promise<string> {
    const callToAction = {
      type: input.ctaType,
      value: { link: input.landingPageUrl },
    };

    const objectStorySpec =
      input.mediaKind === "video"
        ? {
            page_id: input.pageId,
            instagram_actor_id: input.instagramActorId,
            video_data: {
              video_id: input.videoId,
              image_url: input.thumbnailUrl,
              title: input.headline,
              message: input.primaryText,
              link_description: input.linkDescription,
              call_to_action: callToAction,
            },
          }
        : {
            page_id: input.pageId,
            instagram_actor_id: input.instagramActorId,
            link_data: {
              message: input.primaryText,
              link: input.landingPageUrl,
              name: input.headline,
              caption: input.linkDescription,
              image_hash: input.imageHash,
              call_to_action: callToAction,
            },
          };

    const params = new URLSearchParams();
    params.set("name", input.name);
    params.set("object_story_spec", JSON.stringify(objectStorySpec));
    if (input.urlTags) params.set("url_tags", input.urlTags);

    const result = await this.call<{ id: string }>(`/${this.adAccountId}/adcreatives`, {
      method: "POST",
      body: params,
    });
    return result.id;
  }

  /** POST /act_{id}/ads - creates the ad, attached to the configured campaign/ad set via adset_id. */
  async createAd(params: {
    name: string;
    adSetId: string;
    creativeId: string;
    status: "ACTIVE" | "PAUSED";
  }): Promise<string> {
    const body = new URLSearchParams();
    body.set("name", params.name);
    body.set("adset_id", params.adSetId);
    body.set("creative", JSON.stringify({ creative_id: params.creativeId }));
    body.set("status", params.status);

    const result = await this.call<{ id: string }>(`/${this.adAccountId}/ads`, {
      method: "POST",
      body,
    });
    return result.id;
  }

  async getAdEffectiveStatus(adId: string): Promise<string> {
    const result = await this.call<{ effective_status: string }>(`/${adId}`, {
      body: new URLSearchParams({ fields: "effective_status" }),
    });
    return result.effective_status;
  }

  /** GET /{ad_id}/insights - aggregated performance for the ad's lifetime to date. */
  async getAdInsights(adId: string): Promise<MetaAdInsights | null> {
    const fields = [
      "spend",
      "impressions",
      "clicks",
      "ctr",
      "cpc",
      "cpm",
      "actions",
      "action_values",
      "date_start",
      "date_stop",
    ].join(",");
    const result = await this.call<{ data: Record<string, unknown>[] }>(`/${adId}/insights`, {
      body: new URLSearchParams({ fields, date_preset: "maximum" }),
    });
    const row = result.data?.[0];
    if (!row) return null;

    const actions = (row.actions as { action_type: string; value: string }[] | undefined) ?? [];
    const actionValues =
      (row.action_values as { action_type: string; value: string }[] | undefined) ?? [];
    const conversions = actions
      .filter((a) => a.action_type === "offsite_conversion.fb_pixel_purchase" || a.action_type === "purchase")
      .reduce((sum, a) => sum + Number(a.value ?? 0), 0);
    const conversionValue = actionValues
      .filter((a) => a.action_type === "offsite_conversion.fb_pixel_purchase" || a.action_type === "purchase")
      .reduce((sum, a) => sum + Number(a.value ?? 0), 0);

    return {
      dateStart: String(row.date_start ?? ""),
      dateStop: String(row.date_stop ?? ""),
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      ctr: Number(row.ctr ?? 0),
      cpc: Number(row.cpc ?? 0),
      cpm: Number(row.cpm ?? 0),
      conversions,
      conversionValue,
      raw: row,
    };
  }
}
