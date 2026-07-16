# 01 — Delegate a Review Changes playbook through Ask Agent

**What to build:** Add an Ask Agent action beside Changed Files that lets a user open a Review Changes playbook in an ephemeral composer, edit or copy it, and deliberately send it once to the active agent session. The prompt must be concise, provider-neutral, include the session working directory, require inspection of live Git state, and keep the review strictly read-only. The interaction must preserve existing Changed Files behavior and remain safe when the session is unavailable or a send fails.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Ask Agent is available beside Changed Files only when the selected agent session is eligible; it never targets a manual terminal.
- [ ] Selecting Review Changes opens an accessible ephemeral composer without writing anything to the PTY.
- [ ] The generated prompt includes the working directory, requires fresh inspection of staged, unstaged, and untracked changes, and requests a concise read-only review of intent, risks, accidental files, secrets, generated artifacts, tests, and commit scope.
- [ ] The user can edit, copy, dismiss, or send the prompt, and dismissal does not persist a draft.
- [ ] A successful send dispatches exactly one complete paste-safe prompt, closes the composer, and restores terminal focus.
- [ ] A failed send preserves the edited prompt and presents an actionable error; repeated interaction cannot double-send accidentally.
- [ ] Stopped, starting, unavailable, or restarted sessions cannot receive an unconfirmed prompt.
- [ ] Existing Changed Files refresh and current-file opening behavior remain intact.
- [ ] A renderer-level Electron test verifies the menu, composer, prompt context, editing, copying, dismissal, eligibility, successful send, focus, and failure behavior through external UI behavior.
- [ ] No native Git mutation or new Git execution dependency is introduced.
