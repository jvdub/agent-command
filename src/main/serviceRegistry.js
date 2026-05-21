/**
 * Creates a lazy singleton service registry for the main process.
 *
 * @param {object} baseContext
 * @returns {{
 *   register: (name: string, serviceName: string, factory: Function, dependencies?: string[]) => void,
 *   resolve: (name: string) => any,
 *   resolveAll: (names: string[]) => Record<string, any>,
 *   getRegistry: () => { registrations: Array<{name: string, serviceName: string, dependencies: string[], resolved: boolean}>, resolved: string[] },
 *   setupIpcHandlers: (ipcRegistry: { setup: Function }) => any,
 * }}
 */
function createServiceRegistry(baseContext) {
  const registrations = new Map();
  const singletons = new Map();
  const resolutionStack = [];

  function register(name, serviceName, factory, dependencies = []) {
    if (!name || typeof name !== "string") {
      throw new Error("Service registration requires a string 'name'.");
    }

    if (!serviceName || typeof serviceName !== "string") {
      throw new Error(
        `Service '${name}' registration requires a human-readable serviceName.`,
      );
    }

    if (typeof factory !== "function") {
      throw new Error(
        `Service '${name}' (${serviceName}) registration requires a factory function.`,
      );
    }

    if (!Array.isArray(dependencies)) {
      throw new Error(
        `Service '${name}' (${serviceName}) dependencies must be an array.`,
      );
    }

    if (registrations.has(name)) {
      throw new Error(`Service '${name}' is already registered.`);
    }

    registrations.set(name, {
      dependencies,
      factory,
      name,
      serviceName,
    });
  }

  function resolve(name) {
    if (singletons.has(name)) {
      return singletons.get(name);
    }

    const entry = registrations.get(name);
    if (!entry) {
      throw new Error(
        `Service '${name}' is not registered. Available services: ${Array.from(registrations.keys()).join(", ") || "<none>"}.`,
      );
    }

    const cycleStartIndex = resolutionStack.indexOf(name);
    if (cycleStartIndex >= 0) {
      const cycle = [...resolutionStack.slice(cycleStartIndex), name].join(
        " -> ",
      );
      throw new Error(`Circular service dependency detected: ${cycle}`);
    }

    resolutionStack.push(name);

    try {
      const resolvedDependencies = {};

      for (const dependencyName of entry.dependencies) {
        if (!registrations.has(dependencyName)) {
          throw new Error(
            `Service '${entry.name}' (${entry.serviceName}) depends on missing service '${dependencyName}'.`,
          );
        }

        resolvedDependencies[dependencyName] = resolve(dependencyName);
      }

      const instance = entry.factory({
        ...baseContext,
        ...resolvedDependencies,
      });

      if (typeof instance === "undefined") {
        throw new Error(
          `Service '${entry.name}' (${entry.serviceName}) factory returned undefined.`,
        );
      }

      singletons.set(name, instance);
      return instance;
    } finally {
      resolutionStack.pop();
    }
  }

  function resolveAll(names) {
    if (!Array.isArray(names)) {
      throw new Error("resolveAll requires an array of service names.");
    }

    return names.reduce((accumulator, serviceName) => {
      accumulator[serviceName] = resolve(serviceName);
      return accumulator;
    }, {});
  }

  function getRegistry() {
    const registrationsList = Array.from(registrations.values()).map(
      (entry) => ({
        dependencies: [...entry.dependencies],
        name: entry.name,
        resolved: singletons.has(entry.name),
        serviceName: entry.serviceName,
      }),
    );

    return {
      registrations: registrationsList,
      resolved: Array.from(singletons.keys()),
    };
  }

  function setupIpcHandlers(ipcRegistry) {
    if (!ipcRegistry || typeof ipcRegistry.setup !== "function") {
      throw new Error(
        "setupIpcHandlers requires an IPC registry with a setup() method.",
      );
    }

    ipcRegistry.setup();
    return ipcRegistry;
  }

  return {
    getRegistry,
    register,
    resolve,
    resolveAll,
    setupIpcHandlers,
  };
}

module.exports = {
  createServiceRegistry,
};