/**
 * Creates a hierarchical state manager with path-based get/set access.
 * Returned values are immutable snapshots to avoid direct external mutation.
 *
 * State shape:
 * {
 *   app: { capabilities, uiState },
 *   data: { sessions, sessionBuffers, sessionInsights, sessionProcesses },
 *   features: { sessionPanel, terminalView, processPanel, workspace }
 * }
 */
export function createStateManager() {
  const rootState = {
    app: {
      capabilities: {
        processInspectionSupported: true,
      },
      uiState: {
        activeSessionId: null,
        refreshScheduled: false,
        refreshTimeoutId: null,
        isProcessPanelOpen: false,
        terminalContextTarget: null,
        isAgentSearchOpen: false,
        defaultWorkspaceRoot: "",
        isWorkspaceSearchOpen: false,
        platformName: "linux",
      },
    },
    data: {
      sessions: new Map(),
      sessionBuffers: new Map(),
      sessionInsights: new Map(),
      sessionProcesses: new Map(),
    },
    features: {
      sessionPanel: {},
      terminalView: {},
      processPanel: {},
      workspace: {},
    },
  };

  /** @type {Map<string, Set<Function>>} */
  const subscriptions = new Map();

  function parsePath(path) {
    if (path === "" || path == null) {
      return [];
    }

    if (typeof path !== "string") {
      throw new TypeError("State path must be a string");
    }

    const trimmed = path.trim();
    if (!trimmed) {
      return [];
    }

    return trimmed
      .split(".")
      .map((segment) => segment.trim())
      .filter(Boolean);
  }

  function getValueAtPath(target, segments) {
    let current = target;
    for (const segment of segments) {
      if (current == null || typeof current !== "object") {
        return undefined;
      }
      current = current[segment];
    }
    return current;
  }

  function setValueAtPath(target, segments, value) {
    if (segments.length === 0) {
      if (value == null || typeof value !== "object") {
        throw new TypeError("Root state must be an object");
      }

      for (const key of Object.keys(target)) {
        delete target[key];
      }
      for (const [key, nextValue] of Object.entries(value)) {
        target[key] = nextValue;
      }
      return;
    }

    let current = target;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      if (current[segment] == null || typeof current[segment] !== "object") {
        current[segment] = {};
      }
      current = current[segment];
    }

    current[segments[segments.length - 1]] = value;
  }

  function cloneValue(value) {
    if (value instanceof Map) {
      const cloned = new Map();
      for (const [key, entry] of value.entries()) {
        cloned.set(key, cloneValue(entry));
      }
      return cloned;
    }

    if (Array.isArray(value)) {
      return value.map((entry) => cloneValue(entry));
    }

    if (value && typeof value === "object") {
      const cloned = {};
      for (const [key, entry] of Object.entries(value)) {
        cloned[key] = cloneValue(entry);
      }
      return cloned;
    }

    return value;
  }

  function deepFreeze(value) {
    if (value instanceof Map) {
      for (const [key, entry] of value.entries()) {
        deepFreeze(key);
        deepFreeze(entry);
      }
      Object.freeze(value);
      return value;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        deepFreeze(entry);
      }
      Object.freeze(value);
      return value;
    }

    if (value && typeof value === "object") {
      for (const entry of Object.values(value)) {
        deepFreeze(entry);
      }
      Object.freeze(value);
      return value;
    }

    return value;
  }

  function toImmutableSnapshot(value) {
    return deepFreeze(cloneValue(value));
  }

  function shouldNotify(subscriptionPath, changedPath) {
    if (subscriptionPath === "*" || subscriptionPath === "") {
      return true;
    }

    if (subscriptionPath === changedPath) {
      return true;
    }

    return (
      changedPath.startsWith(`${subscriptionPath}.`) ||
      subscriptionPath.startsWith(`${changedPath}.`)
    );
  }

  function notifySubscribers(changedPath, previousValue, nextValue) {
    for (const [subscriptionPath, callbacks] of subscriptions.entries()) {
      if (!shouldNotify(subscriptionPath, changedPath)) {
        continue;
      }

      const prevSnapshot = toImmutableSnapshot(previousValue);
      const nextSnapshot = toImmutableSnapshot(nextValue);

      for (const callback of callbacks) {
        try {
          callback(nextSnapshot, prevSnapshot, { path: changedPath });
        } catch (error) {
          console.error("State subscription callback failed", error);
        }
      }
    }
  }

  function getState(path = "") {
    const segments = parsePath(path);
    const value = getValueAtPath(rootState, segments);
    return toImmutableSnapshot(value);
  }

  function setState(path, value) {
    const segments = parsePath(path);
    const normalizedPath = segments.join(".");
    const previousValue = getValueAtPath(rootState, segments);
    setValueAtPath(rootState, segments, value);
    const nextValue = getValueAtPath(rootState, segments);
    notifySubscribers(normalizedPath, previousValue, nextValue);
  }

  function subscribe(path, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Subscription callback must be a function");
    }

    const normalizedPath = path == null ? "" : String(path).trim();
    if (!subscriptions.has(normalizedPath)) {
      subscriptions.set(normalizedPath, new Set());
    }

    const pathSubscriptions = subscriptions.get(normalizedPath);
    pathSubscriptions.add(callback);

    return () => {
      const callbacks = subscriptions.get(normalizedPath);
      if (!callbacks) {
        return;
      }

      callbacks.delete(callback);
      if (callbacks.size === 0) {
        subscriptions.delete(normalizedPath);
      }
    };
  }

  function getAppState() {
    return getState("app");
  }

  function getDataState() {
    return getState("data");
  }

  function getFeatureState(featureName) {
    if (!featureName || typeof featureName !== "string") {
      throw new TypeError("featureName must be a non-empty string");
    }

    return getState(`features.${featureName}`);
  }

  function clearSubscriptions() {
    subscriptions.clear();
  }

  /**
   * Transitional escape hatch for legacy modules while migrating.
   * @deprecated Use getState/setState instead.
   */
  function getMutableStateForMigration() {
    return rootState;
  }

  return Object.freeze({
    getAppState,
    getDataState,
    getFeatureState,
    getState,
    setState,
    subscribe,
    clearSubscriptions,
    getMutableStateForMigration,
  });
}
