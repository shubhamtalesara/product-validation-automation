import { google, type sheets_v4 } from "googleapis";
import { JWT, OAuth2Client } from "google-auth-library";
import { createLogger } from "../lib/logger.js";
import { RetryableError, toSanitizedMessage } from "../lib/errors.js";

const logger = createLogger("sheets");

const SHEETS_SCOPE = ["https://www.googleapis.com/auth/spreadsheets"];

// Google Sheets hard-rejects an entire write if any single cell exceeds
// 50,000 characters - not just that cell, the whole batched request fails.
// A cell should never legitimately be this long (ad copy tops out at a few
// thousand characters); it's a sign of a malformed upstream value (e.g. a
// URL field). Truncate defensively so one bad field can never take down an
// otherwise-good write.
const SHEETS_MAX_CELL_LENGTH = 50_000;
const TRUNCATION_SUFFIX = " …[truncated, too long for a sheet cell]";

function truncateCell(value: string | number): string | number {
  if (typeof value !== "string" || value.length <= SHEETS_MAX_CELL_LENGTH) return value;
  logger.warn(
    `Truncating an oversized sheet cell (${value.length} chars) to fit Google Sheets' 50,000-character limit`,
    { preview: value.slice(0, 200) },
  );
  return `${value.slice(0, SHEETS_MAX_CELL_LENGTH - TRUNCATION_SUFFIX.length)}${TRUNCATION_SUFFIX}`;
}

function truncateRow(values: (string | number)[]): (string | number)[] {
  return values.map(truncateCell);
}

function truncateRows(rows: (string | number)[][]): (string | number)[][] {
  return rows.map(truncateRow);
}

export interface OAuthCredentials {
  kind: "oauth";
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface ServiceAccountCredentials {
  kind: "service-account";
  /** Full contents of the downloaded service-account JSON key file. */
  json: string;
}

export type SheetsCredentials = OAuthCredentials | ServiceAccountCredentials;

export interface SheetsClientOptions {
  credentials: SheetsCredentials;
  spreadsheetId: string;
  sheetTab: string;
}

function buildAuth(credentials: SheetsCredentials): OAuth2Client | JWT {
  if (credentials.kind === "service-account") {
    let parsed: { client_email?: string; private_key?: string };
    try {
      parsed = JSON.parse(credentials.json);
    } catch {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON - paste the entire contents of the downloaded key file.",
      );
    }
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email/private_key - paste the entire downloaded key file.",
      );
    }
    return new JWT({
      email: parsed.client_email,
      key: parsed.private_key,
      scopes: SHEETS_SCOPE,
    });
  }

  const auth = new OAuth2Client(credentials.clientId, credentials.clientSecret);
  auth.setCredentials({ refresh_token: credentials.refreshToken });
  return auth;
}

/**
 * Thin wrapper around the Google Sheets v4 API. Supports two auth modes:
 *  - Service account (recommended for simple/unattended use): share the
 *    sheet with the service account's `client_email` as an Editor.
 *  - OAuth refresh token (for the advanced pipeline / user-owned sheets).
 */
export class SheetsClient {
  private readonly sheets: sheets_v4.Sheets;
  readonly spreadsheetId: string;
  readonly sheetTab: string;

  constructor(options: SheetsClientOptions) {
    const auth = buildAuth(options.credentials);
    this.sheets = google.sheets({ version: "v4", auth });
    this.spreadsheetId = options.spreadsheetId;
    this.sheetTab = options.sheetTab;
  }

  /**
   * A1-notation ranges must single-quote the sheet name whenever it
   * contains a space or special character (e.g. "Competitor Ads"), or the
   * Sheets API rejects the whole call with "Unable to parse range". Quoting
   * unconditionally is always valid, even for simple names like "Research".
   */
  private get quotedTab(): string {
    return `'${this.sheetTab.replace(/'/g, "''")}'`;
  }

  private wrapErrors<T>(promise: Promise<T>, action: string): Promise<T> {
    return promise.catch((err) => {
      logger.error(`Sheets API call failed: ${action}`, { error: toSanitizedMessage(err) });
      throw new RetryableError(`Google Sheets ${action} failed: ${toSanitizedMessage(err)}`);
    });
  }

  private ensuredTab: Promise<void> | null = null;

  /**
   * A range referencing a tab that doesn't exist yet fails with
   * "Unable to parse range", not a clearer "sheet not found" error. Rather
   * than make that a manual setup step, create the tab on first use if it's
   * missing (e.g. a brand new spreadsheet only has a default "Sheet1").
   */
  private async ensureTabExists(): Promise<void> {
    if (!this.ensuredTab) {
      this.ensuredTab = (async () => {
        const meta = await this.sheets.spreadsheets.get({
          spreadsheetId: this.spreadsheetId,
          fields: "sheets.properties.title",
        });
        const titles = (meta.data.sheets ?? []).map((s) => s.properties?.title);
        if (!titles.includes(this.sheetTab)) {
          await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: { requests: [{ addSheet: { properties: { title: this.sheetTab } } }] },
          });
          logger.info(`Created missing sheet tab "${this.sheetTab}"`);
        }
      })().catch((err) => {
        this.ensuredTab = null; // let a later call retry instead of caching a failure forever
        throw err;
      });
    }
    return this.ensuredTab;
  }

  /** Reads the full used range of the configured tab as a 2D array of strings. */
  async getAllRows(): Promise<string[][]> {
    await this.ensureTabExists();
    const response = await this.wrapErrors(
      this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: this.quotedTab,
      }),
      "getAllRows",
    );
    return (response.data.values as string[][] | undefined) ?? [];
  }

  async updateRow(rowNumber: number, values: (string | number)[]): Promise<void> {
    await this.ensureTabExists();
    const range = `${this.quotedTab}!A${rowNumber}`;
    await this.wrapErrors(
      this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [truncateRow(values)] },
      }),
      "updateRow",
    );
  }

  /** Appends a row and returns the 1-indexed row number it landed on. */
  async appendRow(values: (string | number)[]): Promise<number> {
    await this.ensureTabExists();
    const response = await this.wrapErrors(
      this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: this.quotedTab,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [truncateRow(values)] },
      }),
      "appendRow",
    );
    const updatedRange = response.data.updates?.updatedRange ?? "";
    const match = updatedRange.match(/![A-Z]+(\d+)/);
    return match ? Number(match[1]) : -1;
  }

  /** Replaces the entire tab's contents (header + all rows) in one call. */
  async replaceAll(rows: (string | number)[][]): Promise<void> {
    await this.ensureTabExists();
    await this.wrapErrors(
      this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: this.quotedTab,
      }),
      "clear",
    );
    await this.wrapErrors(
      this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.quotedTab}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: truncateRows(rows) },
      }),
      "replaceAll",
    );
  }

  async writeHeader(headers: string[]): Promise<void> {
    await this.ensureTabExists();
    await this.wrapErrors(
      this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.quotedTab}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [headers] },
      }),
      "writeHeader",
    );
  }
}
