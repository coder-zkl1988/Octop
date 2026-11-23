# Octop desktop

The desktop client is a Wails 3 shell around the Octop Dashboard and the
portable Python runtime.

| Path | Role |
|------|------|
| [`src/main.go`](src/main.go) | Wails application, window lifecycle, tray, sidecar and file drop |
| [`src/assets/`](src/assets/) | Wails shell assets and splash page |
| [`src/Taskfile.yml`](src/Taskfile.yml) | Wails build and package tasks |
| [`portable/`](portable/) | Green Python runtime packaging |
| [`package-dev.sh`](package-dev.sh) | Start a local Octop backend and Wails development shell |
| [`package-release.sh`](package-release.sh) | Build a native Wails release |

## Local development

Requirements are Go 1.25 or newer, `wails3`, `uv`, and Node/npm for the
Dashboard build.

```bash
make build-frontend
bash desktop/package-dev.sh
```

When `~/.octop/config.json` contains `enterprise_backend_url`,
`package-dev.sh` starts the enterprise proxy and dashboard automatically. Set
`OCTOP_ENTERPRISE_URL` to override that backend, or set `OCTOP_DESKTOP_URL` to
attach the shell to an already running dashboard. With an enterprise backend
configured, the shell requires that Dashboard's server to advertise enterprise
login. The development enterprise Dashboard listens on port 8091 by default.

## Release packaging

The release script builds the Dashboard, assembles the portable Python
runtime, verifies imports, and invokes the Wails package task for the native
host platform.

```bash
bash desktop/package-release.sh darwin-arm64
```

The shell owns the desktop sidecar lifecycle. Product logic remains in the
Octop Python service and the Dashboard remains usable in a normal browser.
