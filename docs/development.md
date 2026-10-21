# Build from source

**English** · [简体中文](../zh/docs/development.md)

This page is for contributors who want to build, test or package the extension locally. You need Node.js matching `.nvmrc` and the npm that comes with it.

## Build, test and package

```bash
npm ci
npm run check
npm run typecheck
npm run lint:check  # oxlint; `npm run lint` also applies fixes
npm run fmt:check  # oxfmt; `npm run fmt` formats in place
npm test
npm run package
```

`npm run package` builds `artifacts/<name>-<version>.vsix` and checks its contents against `package.json`.

## Refresh the screenshots

`npm run shots` (macOS only) opens a separate VS Code window with its own profile, runs each feature and saves compressed screenshots to `media/screenshots/`, with full-size originals in `artifacts/shots/`. Leave the window alone while it runs. It is not part of packaging or release: rerun it when the UI changes and commit the images with the docs.

## npm 12 and install scripts

With npm 12, `npm ci` accepts only a lockfile resolved from `registry.npmjs.org`, and dependency install scripts (`esbuild`, `@vscode/vsce-sign`, `fsevents`) are skipped. None of them is needed to check, test or package. If local signing or publishing fails, approve one with `npm install-scripts approve <package>`.
