# Third-party notices

## Checksum Toolkit (`src/checksums/`)

The Checksum Toolkit feature area is a derivative work: it was written from scratch in TypeScript,
but its behaviour, checksum algorithm, backup approach and `product.json` handling were taken from
the **vscode-fix-checksums** extension.

- Upstream: <https://github.com/RimuruChan/vscode-fix-checksums>
- Referenced revision: `6446260369d2abb665a17fb327f01f07334672d8` (version 1.4.0)
- Original project by Jürg Lehni: <https://github.com/lehni/vscode-fix-checksums>

No upstream source file is bundled with this extension, and none of its runtime dependencies
(`sudo-prompt`, `tmp`) are used — this extension never elevates privileges. The licence below is
reproduced because the feature is nevertheless derived from that work.

```text
MIT License

Copyright (c) 2018 Jürg Lehni
Copyright (c) 2024 RimuruChan

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Port Toolkit (`src/ports/`)

No third-party code. Only the choice of platform commands (`lsof`, `ss` / `netstat`, PowerShell) was
informed by `hassansaadfr/vscode-port-cleaner` (MIT); nothing was copied, so no notice is required.

## Everything else

Written for this repository. The extension ships as a single bundled file with no runtime
dependencies.
