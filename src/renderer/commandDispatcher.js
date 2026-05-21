/**
 * Command Dispatcher - Simple event emitter for commands
 *
 * Provides a central hub for command-driven architecture in the renderer.
 * Commands are emitted with optional payloads and handled by registered listeners.
 *
 * Usage:
 *   const dispatcher = createCommandDispatcher();
 *   dispatcher.on('selectSession', (id) => { ... });
 *   dispatcher.emit('selectSession', sessionId);
 */

/**
 * Creates a command dispatcher instance
 * @returns {CommandDispatcher}
 */
export function createCommandDispatcher() {
  const handlers = new Map();

  return {
    /**
     * Register a handler for a command
     * @param {string} command - Command name
     * @param {Function} handler - Handler function that receives the payload
     * @returns {Function} Unsubscribe function
     */
    on(command, handler) {
      if (typeof command !== "string") {
        throw new Error("Command name must be a string");
      }
      if (typeof handler !== "function") {
        throw new Error("Handler must be a function");
      }

      if (!handlers.has(command)) {
        handlers.set(command, []);
      }

      handlers.get(command).push(handler);

      // Return unsubscribe function
      return () => {
        const commandHandlers = handlers.get(command);
        const index = commandHandlers.indexOf(handler);
        if (index > -1) {
          commandHandlers.splice(index, 1);
        }
      };
    },

    /**
     * Emit a command with optional payload
     * @param {string} command - Command name
     * @param {any} payload - Command payload (optional)
     */
    emit(command, payload) {
      if (typeof command !== "string") {
        throw new Error("Command name must be a string");
      }

      const commandHandlers = handlers.get(command);
      if (!commandHandlers || commandHandlers.length === 0) {
        return;
      }

      for (const handler of commandHandlers) {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in handler for command "${command}":`, error);
        }
      }
    },

    /**
     * Get all registered handlers for debugging
     * @param {string} command - Command name (optional, returns all if not provided)
     * @returns {Map|Array}
     */
    _getHandlers(command) {
      if (command) {
        return handlers.get(command) || [];
      }
      return handlers;
    },
  };
}
