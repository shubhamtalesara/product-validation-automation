import type { PrismaClient } from "@prisma/client";
import { createLogger } from "../lib/logger.js";
import { toSanitizedMessage } from "../lib/errors.js";
import { SHEET_COLUMNS } from "./columns.js";
import { buildRowIndex, rowFromRecord, type ResearchRecord } from "./sheetsSync.js";
import type { SheetsClient } from "./sheetsClient.js";

const logger = createLogger("sheets-sync");

export async function syncSheet(prisma: PrismaClient, sheets: SheetsClient): Promise<number> {
  logger.info("Starting Google Sheets sync");
  const existingRows = await sheets.getAllRows();
  if (existingRows.length === 0) {
    await sheets.writeHeader([...SHEET_COLUMNS]);
    existingRows.push([...SHEET_COLUMNS]);
  }
  const rowIndex = buildRowIndex(existingRows);

  const records = (await prisma.competitorAd.findMany({
    include: { competitor: true, testCreative: { include: { performanceSnapshots: true } } },
    orderBy: { createdAt: "asc" },
  })) as ResearchRecord[];

  let synced = 0;
  for (const record of records) {
    try {
      const row = rowFromRecord(record);
      const existingRowNumber = rowIndex.get(record.id);
      if (existingRowNumber) {
        await sheets.updateRow(existingRowNumber, row);
      } else {
        const newRowNumber = await sheets.appendRow(row);
        rowIndex.set(record.id, newRowNumber);
        if (record.testCreative && newRowNumber > 0) {
          await prisma.testCreative.update({
            where: { id: record.testCreative.id },
            data: { sheetRowNumber: newRowNumber },
          });
        }
      }
      synced += 1;
    } catch (err) {
      logger.error("Failed to sync row", {
        researchId: record.id,
        error: toSanitizedMessage(err),
      });
    }
  }

  logger.info(`Synced ${synced} records to Google Sheets`);
  return synced;
}
