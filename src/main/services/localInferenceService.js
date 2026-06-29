function createLocalInferenceService({
  baseUrl = process.env.AGENTIC_MANAGED_LOCAL_URL || "http://127.0.0.1:11434",
  model = process.env.AGENTIC_MANAGED_LOCAL_MODEL || "qwen2.5-coder:7b",
  fetchImpl = global.fetch,
} = {}) {
  async function completeStructured({ prompt, schema, timeoutMs = 120000 }) {
    if (typeof fetchImpl !== "function") {
      throw new Error("Local inference is unavailable in this runtime.");
    }
    const response = await fetchImpl(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: schema,
        messages: [{ role: "user", content: prompt }],
        options: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Local inference returned HTTP ${response.status}.`);
    }
    const body = await response.json();
    return JSON.parse(body?.message?.content || "{}");
  }

  function getConfiguration() {
    return { baseUrl, model };
  }

  return { completeStructured, getConfiguration };
}

module.exports = { createLocalInferenceService };
