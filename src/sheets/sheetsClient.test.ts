import { beforeEach, describe, expect, it, vi } from "vitest";

const valuesMock = {
  get: vi.fn().mockResolvedValue({ data: { values: [] } }),
  update: vi.fn().mockResolvedValue({ data: {} }),
  append: vi.fn().mockResolvedValue({ data: { updates: { updatedRange: "'Competitor Ads'!A2:K2" } } }),
  clear: vi.fn().mockResolvedValue({ data: {} }),
};

const spreadsheetsMock = {
  get: vi.fn().mockResolvedValue({ data: { sheets: [{ properties: { title: "Competitor Ads" } }] } }),
  batchUpdate: vi.fn().mockResolvedValue({ data: {} }),
  values: valuesMock,
};

vi.mock("googleapis", () => ({
  google: {
    sheets: () => ({ spreadsheets: spreadsheetsMock }),
  },
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    setCredentials() {}
  },
  JWT: class {},
}));

const { SheetsClient } = await import("./sheetsClient.js");

function newClient(sheetTab: string) {
  return new SheetsClient({
    credentials: { kind: "oauth", clientId: "id", clientSecret: "secret", refreshToken: "token" },
    spreadsheetId: "sheet123",
    sheetTab,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  spreadsheetsMock.get.mockResolvedValue({
    data: { sheets: [{ properties: { title: "Competitor Ads" } }] },
  });
  valuesMock.get.mockResolvedValue({ data: { values: [] } });
  valuesMock.append.mockResolvedValue({
    data: { updates: { updatedRange: "'Competitor Ads'!A2:K2" } },
  });
});

describe("SheetsClient range quoting", () => {
  it("quotes a tab name containing spaces so the Sheets API can parse the range", async () => {
    const client = newClient("Competitor Ads");
    await client.getAllRows();
    expect(valuesMock.get).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'Competitor Ads'" }),
    );
  });

  it("quotes the tab name in updateRow, appendRow, writeHeader, and replaceAll", async () => {
    const client = newClient("Competitor Ads");

    await client.updateRow(3, ["a"]);
    expect(valuesMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'Competitor Ads'!A3" }),
    );

    await client.appendRow(["a"]);
    expect(valuesMock.append).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'Competitor Ads'" }),
    );

    await client.writeHeader(["h1"]);
    expect(valuesMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'Competitor Ads'!A1" }),
    );

    await client.replaceAll([["h1"]]);
    expect(valuesMock.clear).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'Competitor Ads'" }),
    );
  });

  it("still works for a tab name with no special characters", async () => {
    const client = newClient("Research");
    await client.getAllRows();
    expect(valuesMock.get).toHaveBeenCalledWith(expect.objectContaining({ range: "'Research'" }));
  });

  it("escapes a literal single quote in the tab name", async () => {
    const client = newClient("Bob's Sheet");
    await client.getAllRows();
    expect(valuesMock.get).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'Bob''s Sheet'" }),
    );
  });
});

describe("SheetsClient auto-creates a missing tab", () => {
  it("creates the tab when it doesn't exist yet", async () => {
    spreadsheetsMock.get.mockResolvedValueOnce({
      data: { sheets: [{ properties: { title: "Sheet1" } }] },
    });
    const client = newClient("Competitor Ads");

    await client.getAllRows();

    expect(spreadsheetsMock.batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: {
          requests: [{ addSheet: { properties: { title: "Competitor Ads" } } }],
        },
      }),
    );
  });

  it("does not create the tab when it already exists", async () => {
    const client = newClient("Competitor Ads");
    await client.getAllRows();
    expect(spreadsheetsMock.batchUpdate).not.toHaveBeenCalled();
  });

  it("only checks once per client instance across multiple calls", async () => {
    const client = newClient("Competitor Ads");
    await client.getAllRows();
    await client.getAllRows();
    await client.writeHeader(["h1"]);
    expect(spreadsheetsMock.get).toHaveBeenCalledTimes(1);
  });

  it("retries the check on a later call if it failed the first time", async () => {
    spreadsheetsMock.get.mockRejectedValueOnce(new Error("boom"));
    const client = newClient("Competitor Ads");

    await expect(client.getAllRows()).rejects.toThrow();
    await client.getAllRows();

    expect(spreadsheetsMock.get).toHaveBeenCalledTimes(2);
  });
});
