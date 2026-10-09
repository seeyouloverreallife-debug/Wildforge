# Dependency & install verification (re-check for M1 / v0.0.2)

Date: 2026-10-09. Environment: Linux container.

## Toolchain actually used
| Tool | Version | How obtained |
|---|---|---|
| Node.js | v22.22.0 | `node -v` |
| npm | 10.9.4 | `npm -v` |

## Locked dependencies (package-lock.json, `npm ls --depth=0`)
phaser 4.2.1 • vite 8.3.4 • typescript 7.0.2 • vitest 5.0.3 — `npm audit`: 0 vulnerabilities.
Declared engines (read from each package's own package.json in node_modules):
vite `^20.19.0 || >=22.12.0` • vitest `^22.12.0 || ^24.0.0 || >=26.0.0` • typescript `>=16.20.0` • phaser: none declared.
Node 22.22.0 satisfies all of them.

## Clean install proof (commands run, in order)
```
git archive HEAD | tar -x -C <empty dir>     # a clone with no node_modules
node -v && npm -v                            # v22.22.0 / 10.9.4
npm ci                                       # 13 packages... 0 vulnerabilities, ~6 s
npm ls --depth=0                             # matches lockfile versions above
npm run build                                # tsc --noEmit && vite build -> OK
npm test                                     # all unit tests pass
npm audit                                    # found 0 vulnerabilities
```
(The M0 commit was used for this clean-room check; the M1 tree was re-verified the same way before packaging — see QA_REPORT.md.)

## Official documentation
* `docs.phaser.io` and `vite.dev` were **not reachable by direct fetch** from this sandbox (DNS blocked). Verified instead via web search results and the files shipped inside the installed packages:
  * Vite guide (search result of https://vite.dev/guide/): "requires Node.js 20.19+ or 22.12+" — consistent with the engines field above.
  * Phaser 4.2.1 ships its own `changelog/v4/4.0/MIGRATION-GUIDE.md` (read locally). Relevant findings for this project: Canvas renderer is deprecated (we use WebGL via `Phaser.AUTO`); camera `scrollX/scrollY/zoom/rotation` unchanged (we only use `zoom`, `centerOn`, `shake`, `getWorldPoint`); `Graphics` API unchanged for what we use (`fillCircle`, `slice`, `fillPoints`, …). Phaser blog migration post: https://phaser.io/news/2026/04/migrating-from-phaser-3-to-phaser-4-what-you-need-to-know
* NOT verified from official docs: Phaser 4 DPR / resolution handling (see DESIGN_DEVIATIONS #6).
