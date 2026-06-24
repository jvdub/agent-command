# Third-Party Notices

Agentic Command includes third-party software. The principal runtime components
are listed below; their license texts are included in their installed packages
and must be preserved in distributed builds.

| Component | License | Project |
| --- | --- | --- |
| Electron | MIT | https://github.com/electron/electron |
| node-pty | MIT | https://github.com/microsoft/node-pty |
| Monaco Editor | MIT | https://github.com/microsoft/monaco-editor |
| xterm.js and addons | MIT | https://github.com/xtermjs/xterm.js |

Development and test dependencies are listed in `package-lock.json` and remain
subject to their respective licenses. Before each public release, the packaged
artifact should be scanned to regenerate a complete dependency license report.
