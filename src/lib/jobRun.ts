import type { PrismaClient } from "@prisma/client";
import { toSanitizedMessage } from "./errors.js";

export type JobType = "research" | "approval" | "publish" | "performance";

export async function startJobRun(prisma: PrismaClient, jobType: JobType) {
  return prisma.jobRun.create({ data: { jobType, status: "RUNNING" } });
}

export async function finishJobRun(
  prisma: PrismaClient,
  jobRunId: string,
  summary: Record<string, unknown>,
) {
  await prisma.jobRun.update({
    where: { id: jobRunId },
    data: { status: "SUCCESS", finishedAt: new Date(), summary: JSON.stringify(summary) },
  });
}

export async function failJobRun(prisma: PrismaClient, jobRunId: string, err: unknown) {
  await prisma.jobRun.update({
    where: { id: jobRunId },
    data: { status: "FAILED", finishedAt: new Date(), error: toSanitizedMessage(err) },
  });
}
