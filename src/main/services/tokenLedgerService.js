function createTokenLedgerService() {
  function createLedger() {
    return {
      workerCount: 0,
      premiumWorkerCount: 0,
      hasTokenData: false,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
      reportedCost: 0,
      localInferenceCalls: 0,
    };
  }

  function record(ledger, worker) {
    const target = ledger || createLedger();
    const usage = worker?.usage || {};
    target.workerCount += 1;
    target.premiumWorkerCount += worker?.tier === "premium" ? 1 : 0;
    for (const key of [
      "inputTokens",
      "outputTokens",
      "cachedTokens",
      "reasoningTokens",
    ]) {
      if (typeof usage[key] === "number") {
        target[key] += usage[key];
        target.hasTokenData = true;
      }
    }
    if (typeof usage.reportedCost === "number") {
      target.reportedCost += usage.reportedCost;
    }
    return target;
  }

  return { createLedger, record };
}

module.exports = { createTokenLedgerService };
