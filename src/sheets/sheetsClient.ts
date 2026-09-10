import { google, type sheets_v4 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { createLogger } from "../lib/logger.js";
import { RetryableError, toSanitizedMessage } from "../lib/errors.js";

const logger = createLogger("sheets");

export interface SheetsClientOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  spreadsheetId: string;
  sheetTab: string;
}

/**
 * Thin wrapper around the Google Sheets v4 API, authenticated via a
 * long-lived OAuth refresh token (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN).
 */
export class SheetsClient {
  private readonly sheets: sheets_v4.Sheets;
  readonly spreadsheetId: string;
  readonly sheetTab: string;

  constructor(options: SheetsClientOptions) {
    const auth = new OAuth2Client(options.clientId, options.clientSecret);
    auth.setCredentials({ refresh_token: options.refreshToken });
    this.sheets = google.sheets({ version: "v4", auth });
    this.spreadsheetId = options.spreadsheetId;
    this.sheetTab = options.sheetTab;
  }

  private wrapErrors<T>(promise: Promise<T>, action: string): Promise<T> {
    return promise.catch((err) => {
      logger.error(`Sheets API call failed: ${action}`, { error: toSanitizedMessage(err) });
      throw new RetryableError(`Google Sheets ${action} failed: ${toSanitizedMessage(err)}`);
    });
  }

  /** Reads the full used range of the configured tab as a 2D array of strings. */
  async getAllRows(): Promise<string[][]> {
    const response = await this.wrapErrors(
      this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: this.sheetTab,
      }),
      "getAllRows",
    );
    return (response.data.values as string[][] | undefined) ?? [];
  }

  async updateRow(rowNumber: number, values: (string | number)[]): Promise<void> {
    const range = `${this.sheetTab}!A${rowNumber}`;
    await this.wrapErrors(
      this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [values] },
      }),
      "updateRow",
    );
  }

  /** Appends a row and returns the 1-indexed row number it landed on. */
  async appendRow(values: (string | number)[]): Promise<number> {
    const response = await this.wrapErrors(
      this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: this.sheetTab,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [values] },
      }),
      "appendRow",
    );
    const updatedRange = response.data.updates?.updatedRange ?? "";
    const match = updatedRange.match(/![A-Z]+(\d+)/);
    return match ? Number(match[1]) : -1;
  }

  async writeHeader(headers: string[]): Promise<void> {
    await this.wrapErrors(
      this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetTab}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [headers] },
      }),
      "writeHeader",
    );
  }
}
