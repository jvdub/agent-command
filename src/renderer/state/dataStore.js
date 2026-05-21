/**
 * Creates a data store that manages session data through a state manager.
 * All writes flow through stateManager.setState() for subscription updates.
 *
 * @param {Object} stateManager - State manager created by createStateManager
 */
export function createDataStore(stateManager) {
  if (!stateManager || typeof stateManager.getState !== "function") {
    throw new TypeError("A valid stateManager is required");
  }

  if (typeof stateManager.setState !== "function") {
    throw new TypeError("stateManager.setState must be a function");
  }

  function readDataMap(key) {
    const value = stateManager.getState(`data.${key}`);
    if (!(value instanceof Map)) {
      throw new TypeError(`data.${key} is expected to be a Map`);
    }
    return new Map(value);
  }

  function writeDataMap(key, nextMap) {
    if (!(nextMap instanceof Map)) {
      throw new TypeError(`nextMap for ${key} must be a Map`);
    }

    stateManager.setState(`data.${key}`, nextMap);
  }

  function createDefaultSessionInsight() {
    return {
      lastActivityAt: null,
      lastInputAt: null,
      lastWorkingAt: null,
      lastReadyAt: null,
      workingDetail: null,
      awaitingPermission: false,
      permissionDetail: "",
      awaitingQuestion: false,
      questionDetail: "",
      hasError: false,
      errorMessage: "",
      lastErrorAt: null,
    };
  }

  function normalizeSessionInput(sessionData) {
    if (!sessionData || typeof sessionData !== "object") {
      throw new TypeError("sessionData must be an object");
    }

    if (!sessionData.id || typeof sessionData.id !== "string") {
      throw new TypeError("sessionData.id must be a non-empty string");
    }

    const createdAt = Number(sessionData.createdAt);
    return {
      ...sessionData,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    };
  }

  function addSession(sessionData) {
    const normalizedSession = normalizeSessionInput(sessionData);
    const sessions = readDataMap("sessions");
    sessions.set(normalizedSession.id, normalizedSession);
    writeDataMap("sessions", sessions);
    return normalizedSession;
  }

  function getSession(id) {
    if (!id || typeof id !== "string") {
      return null;
    }

    const sessions = readDataMap("sessions");
    const session = sessions.get(id);
    return session ? { ...session } : null;
  }

  function getSessions() {
    const sessions = readDataMap("sessions");
    return Array.from(sessions.values())
      .map((session) => ({ ...session }))
      .sort((left, right) => Number(right.createdAt) - Number(left.createdAt));
  }

  function updateSession(id, updates) {
    if (!id || typeof id !== "string") {
      throw new TypeError("id must be a non-empty string");
    }

    if (!updates || typeof updates !== "object") {
      throw new TypeError("updates must be an object");
    }

    const sessions = readDataMap("sessions");
    const existing = sessions.get(id);
    if (!existing) {
      throw new Error(`Session not found: ${id}`);
    }

    const nextSession = { ...existing, ...updates, id: existing.id };
    sessions.set(id, nextSession);
    writeDataMap("sessions", sessions);
    return { ...nextSession };
  }

  function removeSession(id) {
    if (!id || typeof id !== "string") {
      throw new TypeError("id must be a non-empty string");
    }

    const sessions = readDataMap("sessions");
    const didRemove = sessions.delete(id);
    if (!didRemove) {
      return false;
    }

    writeDataMap("sessions", sessions);

    const buffers = readDataMap("sessionBuffers");
    buffers.delete(id);
    writeDataMap("sessionBuffers", buffers);

    const insights = readDataMap("sessionInsights");
    insights.delete(id);
    writeDataMap("sessionInsights", insights);

    const processes = readDataMap("sessionProcesses");
    processes.delete(id);
    writeDataMap("sessionProcesses", processes);

    return true;
  }

  function appendSessionBuffer(sessionId, chunk) {
    if (!sessionId || typeof sessionId !== "string") {
      throw new TypeError("sessionId must be a non-empty string");
    }

    const textChunk = chunk == null ? "" : String(chunk);
    const buffers = readDataMap("sessionBuffers");
    const current = buffers.get(sessionId) || "";
    const next = `${current}${textChunk}`;
    buffers.set(sessionId, next);
    writeDataMap("sessionBuffers", buffers);
    return next;
  }

  function getSessionBuffer(sessionId) {
    if (!sessionId || typeof sessionId !== "string") {
      return "";
    }

    const buffers = readDataMap("sessionBuffers");
    return buffers.get(sessionId) || "";
  }

  function setSessionBuffer(sessionId, content) {
    if (!sessionId || typeof sessionId !== "string") {
      throw new TypeError("sessionId must be a non-empty string");
    }

    const buffers = readDataMap("sessionBuffers");
    const next = content == null ? "" : String(content);
    buffers.set(sessionId, next);
    writeDataMap("sessionBuffers", buffers);
    return next;
  }

  function getSessionInsight(sessionId) {
    if (!sessionId || typeof sessionId !== "string") {
      throw new TypeError("sessionId must be a non-empty string");
    }

    const insights = readDataMap("sessionInsights");
    if (!insights.has(sessionId)) {
      insights.set(sessionId, createDefaultSessionInsight());
      writeDataMap("sessionInsights", insights);
    }

    return { ...insights.get(sessionId) };
  }

  function updateSessionInsight(sessionId, updates) {
    if (!sessionId || typeof sessionId !== "string") {
      throw new TypeError("sessionId must be a non-empty string");
    }

    if (!updates || typeof updates !== "object") {
      throw new TypeError("updates must be an object");
    }

    const insights = readDataMap("sessionInsights");
    const current = insights.get(sessionId) || createDefaultSessionInsight();
    const next = {
      ...current,
      ...updates,
    };

    insights.set(sessionId, next);
    writeDataMap("sessionInsights", insights);
    return { ...next };
  }

  return Object.freeze({
    addSession,
    getSession,
    getSessions,
    updateSession,
    removeSession,
    appendSessionBuffer,
    getSessionBuffer,
    setSessionBuffer,
    getSessionInsight,
    updateSessionInsight,
  });
}
