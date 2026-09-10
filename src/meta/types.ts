export type MetaMediaKind = "image" | "video";

export interface MetaCreativeInput {
  name: string;
  pageId: string;
  instagramActorId?: string;
  mediaKind: MetaMediaKind;
  imageHash?: string;
  videoId?: string;
  thumbnailUrl?: string;
  primaryText: string;
  headline?: string;
  linkDescription?: string;
  landingPageUrl: string;
  ctaType: string;
  urlTags?: string;
}

export interface MetaAdInsights {
  dateStart: string;
  dateStop: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  conversionValue: number;
  raw: unknown;
}
