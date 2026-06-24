# Privacy

Agentic Command is a local desktop application. It does not include telemetry,
analytics, advertising, or an Agentic Command cloud service.

## Data stored locally

The app stores session metadata, preferences, diagnostics, and limited terminal
history in Electron's per-user application-data directory. Terminal history is
encrypted with the operating system's protected storage when available. On
Linux, Electron's unprotected `basic_text` fallback is not used for terminal
history. When protected storage is unavailable, terminal output is not
persisted.

Use **Open data folder** to inspect the local files. Use **Clear history** to
remove stopped sessions and their saved terminal output. Running sessions are
not removed.

## Clipboard and external activity

**Copy diagnostics** places local application and environment information on
the clipboard so the user can choose where to share it. Agent CLIs and shell
commands launched inside Agentic Command may access networks or external
services according to their own configuration and privacy policies.

Agentic Command opens web links only when the user activates them. It does not
send diagnostics or session content automatically.
