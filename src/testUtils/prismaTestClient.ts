import { PrismaClient } from "@prisma/client";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDbPath = resolve(__dirname, "../../prisma/test.db");

export function createTestPrismaClient(): PrismaClient {
  return new PrismaClient({ datasourceUrl: `file:${testDbPath}` });
}

export async function resetTestDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.performanceSnapshot.deleteMany();
  await prisma.testCreative.deleteMany();
  await prisma.competitorAd.deleteMany();
  await prisma.jobRun.deleteMany();
  await prisma.competitor.deleteMany();
}
