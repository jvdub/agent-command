/**
 * Creates an IPC handler registry with shared validation and error wrapping.
 *
 * @param {{ handle: Function }} ipcMain
 * @param {object} services
 */
function createIpcHandlerRegistry(ipcMain, services) {
  const registrations = [];

  function register(domain, channel, { validate, handler }) {
    if (!domain || typeof domain !== "string") {
      throw new Error("IPC registration requires a domain string.");
    }

    if (!channel || typeof channel !== "string") {
      throw new Error(
        `IPC registration in domain '${domain}' requires a channel string.`,
      );
    }

    if (typeof handler !== "function") {
      throw new Error(
        `IPC registration '${domain}:${channel}' requires a handler function.`,
      );
    }

    registrations.push({
      channel,
      domain,
      handler,
      validate: typeof validate === "function" ? validate : null,
    });
  }

  async function runValidation(validate, payload, context) {
    if (!validate) {
      return;
    }

    const result = await validate(payload, context);
    if (result === false) {
      throw new Error("Invalid request payload.");
    }

    if (typeof result === "string" && result.trim()) {
      throw new Error(result.trim());
    }

    if (result instanceof Error) {
      throw result;
    }
  }

  function normalizeHandlerResult(result) {
    if (result instanceof Error) {
      throw result;
    }

    if (result && typeof result === "object") {
      if (result.error instanceof Error) {
        throw result.error;
      }

      if (typeof result.error === "string" && result.error.trim()) {
        throw new Error(result.error.trim());
      }
    }

    return result;
  }

  function wrapIpcError(domain, channel, error) {
    if (error instanceof Error) {
      error.message = `[${domain}:${channel}] ${error.message}`;
      return error;
    }

    return new Error(
      `[${domain}:${channel}] ${String(error || "Unknown IPC error")}`,
    );
  }

  function setup() {
    for (const registration of registrations) {
      ipcMain.handle(registration.channel, async (event, payload) => {
        try {
          const context = {
            channel: registration.channel,
            domain: registration.domain,
            event,
            services,
          };

          await runValidation(registration.validate, payload, context);
          const result = await registration.handler(event, payload, services);
          return normalizeHandlerResult(result);
        } catch (error) {
          throw wrapIpcError(registration.domain, registration.channel, error);
        }
      });
    }
  }

  function registerFromModules(modules) {
    if (!Array.isArray(modules)) {
      throw new Error("registerFromModules requires an array of modules.");
    }

    for (const moduleEntry of modules) {
      const registerHandlers =
        typeof moduleEntry === "function"
          ? moduleEntry
          : moduleEntry?.registerHandlers;

      if (typeof registerHandlers !== "function") {
        throw new Error(
          "Each IPC module must export registerHandlers(registry, services).",
        );
      }

      registerHandlers({ register }, services);
    }
  }

  return {
    register,
    registerFromModules,
    setup,
  };
}

module.exports = {
  createIpcHandlerRegistry,
};