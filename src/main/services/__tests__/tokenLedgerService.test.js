const { createTokenLedgerService } = require("../tokenLedgerService");

describe("Managed Run token ledger", () => {
  test("records known usage without inventing unavailable values", () => {
    const service = createTokenLedgerService();
    const ledger = service.createLedger();
    service.record(ledger, {
      tier: "premium",
      usage: { inputTokens: 100, outputTokens: 25, reportedCost: 0.12 },
    });
    service.record(ledger, { tier: "standard", usage: {} });

    expect(ledger).toMatchObject({
      workerCount: 2,
      premiumWorkerCount: 1,
      hasTokenData: true,
      inputTokens: 100,
      outputTokens: 25,
      reportedCost: 0.12,
      cachedTokens: 0,
      localInferenceCalls: 0,
    });
  });
});
