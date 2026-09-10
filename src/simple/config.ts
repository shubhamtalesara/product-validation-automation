import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIG_PATH = resolve(projectRoot, "competitors.simple.json");

const myLandingPageSchema = z.object({
  url: z.string().min(1),
  /** Free-text page type YOU assign (e.g. "PDP", "5 Reasons Why", "Quiz") - not auto-detected. */
  type: z.string().min(1),
});

const configSchema = z.object({
  /** Your own brand - used to swap the competitor's brand name into yours in ad copy. Omit to skip that swap. */
  myBrand: z.object({ name: z.string().min(1) }).optional(),
  competitors: z
    .array(
      z.object({
        name: z.string().min(1),
        landingPage: z.string().min(1),
        /** Optional manual override if domain-based lookup doesn't match TrendTrack's advertiserId. */
        advertiserId: z.string().optional(),
        /** Your own replicated landing pages for this competitor, each labeled with its own type. */
        myLandingPages: z.array(myLandingPageSchema).optional().default([]),
      }),
    )
    .min(1, "competitors.simple.json must list at least one competitor"),
});

export type SimpleCompetitor = z.infer<typeof configSchema>["competitors"][number];
export type MyLandingPage = z.infer<typeof myLandingPageSchema>;

export interface SimpleConfig {
  myBrand?: { name: string };
  competitors: SimpleCompetitor[];
}

export async function loadSimpleConfig(): Promise<SimpleConfig> {
  let raw: string;
  try {
    raw = await readFile(CONFIG_PATH, "utf-8");
  } catch {
    throw new Error(
      `Could not find competitors.simple.json at ${CONFIG_PATH}. Copy the example and fill in your competitor landing pages.`,
    );
  }
  const parsed = configSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `competitors.simple.json is invalid: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  return { myBrand: parsed.data.myBrand, competitors: parsed.data.competitors };
}
