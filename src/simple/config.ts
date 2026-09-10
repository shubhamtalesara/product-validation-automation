import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIG_PATH = resolve(projectRoot, "competitors.simple.json");

const configSchema = z.object({
  competitors: z
    .array(
      z.object({
        name: z.string().min(1),
        landingPage: z.string().min(1),
        /** Optional manual override if domain-based lookup doesn't match TrendTrack's advertiserId. */
        advertiserId: z.string().optional(),
      }),
    )
    .min(1, "competitors.simple.json must list at least one competitor"),
});

export type SimpleCompetitor = z.infer<typeof configSchema>["competitors"][number];

export async function loadSimpleConfig(): Promise<SimpleCompetitor[]> {
  let raw: string;
  try {
    raw = await readFile(CONFIG_PATH, "utf-8");
  } catch {
    throw new Error(
      `Could not find competitors.simple.json at ${CONFIG_PATH}. Copy the example and fill in your 3 competitor landing pages.`,
    );
  }
  const parsed = configSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `competitors.simple.json is invalid: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  return parsed.data.competitors;
}
