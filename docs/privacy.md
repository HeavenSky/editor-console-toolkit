# Check what runs on your machine

**English** · [简体中文](../zh/docs/privacy.md)

This page lists what the extension does in the background, so you can decide whether it fits a locked-down machine. Nothing here needs setup.

- **No telemetry and no network access**: nothing about you or your code leaves your machine.
- No runtime dependencies; the extension ships as a single bundled file and downloads nothing.
- It activates only when you run one of its commands or open the Port Toolkit view.
- Console Toolkit runs only when you invoke a command: no listeners, no timers, no status bar item. A repository check rejects any change that adds one.
- Port Toolkit scans only while its view is visible, using `lsof`, `ss`, `netstat` or PowerShell that ship with the OS.
- Checksum Toolkit touches the disk only when you run it, and writes nothing outside the editor's installation folder and your temporary folder.
- Cleanup Toolkit runs only when you invoke it and deletes nothing by itself: it calls commands that the editor and your extensions already provide. One of them, Cloud Edit Sessions in Delete Work Data, deletes data stored online; uncheck it to keep that data.
