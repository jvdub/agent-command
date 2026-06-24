# Release Readiness Checklist

Agentic Command v1 supports native Windows and native Linux. macOS and WSL/WSLg
are not supported release targets.

## Versioning

- Use semantic versioning.
- Keep pre-1.0 releases in the `0.x` line while workflows may still change.
- Update `package.json`, release notes, and the packaged artifact together.

## Automated gates

- `npm ci`
- `npm run check`
- `npm test -- --runInBand`
- `npm run test:e2e`
- `npm audit --audit-level=moderate`

## Fresh Windows and Linux machines

- Install on clean Windows and Ubuntu LTS systems without Node.js or a development checkout present.
- Launch from the Windows Start menu or Linux application launcher, then open a second instance.
- Verify the first-run warning when `claude` is absent from `PATH`.
- Install or expose an agent CLI and verify the readiness message updates.
- Start, stop, restart, remove, and switch between multiple sessions.
- Verify working directories containing spaces, Unicode, and long paths.
- Exercise permission prompts and interactive agent questions.
- Verify quick-open, editing, saving, autosave, and modified-file refresh.
- Confirm terminal history survives relaunch and is not plaintext on disk.
- Confirm Clear history retains running sessions and removes stopped sessions.
- Confirm Copy diagnostics and Open data folder work without DevTools.
- Test light, dark, system theme, keyboard-only navigation, and 125%/150% DPI.
- Test long-running output, large workspaces, offline startup, and CLI failure.
- On Windows, re-run the suite with antivirus and Windows Defender enabled.
- On Linux, verify GNOME Keyring or KWallet-backed history protection and confirm history is omitted when only `basic_text` storage is available.
- On Linux, verify executable permissions, CLI discovery from the desktop-session `PATH`, and behavior under X11 and Wayland where available.

## Release artifact

- Verify product name, publisher, application ID, version, and icons.
- Verify native `node-pty` binaries on a clean machine.
- Generate a complete third-party license report.
- Sign the executable and installer.
- Produce and verify AppImage and Debian artifacts for Linux.
- Confirm uninstall behavior and whether user data is preserved.
- Exercise install, upgrade, rollback, and uninstall paths.
- Publish checksums, release notes, privacy information, and support guidance.
