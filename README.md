# dsh-diagram

English | [简体中文](https://github.com/hanzhangzzz/dsh-diagram/blob/master/README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/dsh-diagram?style=flat-square)](https://www.npmjs.com/package/dsh-diagram)
[![GitHub release](https://img.shields.io/github/v/release/hanzhangzzz/dsh-diagram?display_name=tag&style=flat-square)](https://github.com/hanzhangzzz/dsh-diagram/releases/latest)
[![license](https://img.shields.io/github/license/hanzhangzzz/dsh-diagram?style=flat-square)](./LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek_Harness-0.1.5--rc.1-4c6ef5?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)

**dsh-diagram is a canvas plugin for DeepSeek Harness (DSH).** Generate a diagram in your existing conversation, then open the same session’s **Canvas** tab to edit, save, and export it.

**Where to find it:** type `/` in DSH and select **canvas-diagram** → get a preview in the conversation → click **Edit in canvas** or the **Canvas** tab.

![Open the DSH canvas, edit text, drag a node, change its color, and autosave](https://raw.githubusercontent.com/hanzhangzzz/dsh-diagram/b0c1bf08a4fc9248be16c22d8c920604a0e6090d/editorial-preview/dsh-editable-workflow.gif)

Real interaction: chat preview → open canvas → edit the title, drag a node, and change its color → reload with edits preserved → updated preview in the conversation.

> Current source preview: a real DSH interaction recording from `0.6.0-editorial.3` (Chinese UI). This version is not on npm yet. The install command below currently installs stable `0.5.0`.

Install it in one command, then type `/` and pick **canvas-diagram** in any DSH session:

```sh
npx -y @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web add dsh-diagram@latest
```

> pnpm 11 holds back versions published less than 24 hours ago (`minimumReleaseAge`, default 1440 minutes). Right after a release, `dsh-diagram@latest` may still resolve to the previous version; pin the version instead, e.g. `dsh-diagram@0.5.0`.

> Useful for your DSH toolbox? Star the repo so you can find it when the next long article needs a diagram.

Full requirements and verification: [Quick install](#quick-install).

## Why dsh-diagram?

- **Editable, not disposable.** Continue working in a full Excalidraw canvas instead of accepting a static generated image.
- **Clean or sketchnote.** Keep the default precise diagram, or ask for a warm-paper editorial sketch with handwritten text, marker washes, and editable semantic line icons.
- **Built into the conversation.** A live preview card lands in the chat flow right after creation, and the **Canvas** tab opens the full editor without leaving the DSH session.
- **Saved and ready to share.** Revision-safe autosave protects newer work, and export produces `.excalidraw`, SVG, or PNG.

<details>
<summary>See the chat preview and the Edit in canvas entry point</summary>

After the Agent creates a diagram, its preview appears in the current conversation. The top-right **Edit in canvas** button and the session’s **Canvas** tab both open the editor demonstrated above.

![Diagram preview and Edit in canvas button in a DSH conversation](https://raw.githubusercontent.com/hanzhangzzz/dsh-diagram/34505294d34c460471b70820e96da03c3f80410a/editorial-preview/dsh-chat-preview.jpg)

</details>

<details>
<summary>See exported results: the same content in clean and sketchnote styles</summary>

These PNGs are exports from the plugin’s canvas, not a separate app interface. Both styles were already supported in 0.5.0; these examples show the improved output from 0.6.0-editorial.3.

![Clean editorial style: three checkpoints for a complete release](https://raw.githubusercontent.com/hanzhangzzz/dsh-diagram/6427235eb0148edcb21bee65ea2a3fa7c9bb5c11/editorial-preview/clean-report.png)

![The same release review in sketchnote style](https://raw.githubusercontent.com/hanzhangzzz/dsh-diagram/6427235eb0148edcb21bee65ea2a3fa7c9bb5c11/editorial-preview/sketchnote-report.png)

</details>

<details>
<summary>Published 0.5.0 workflow: create, edit, and save</summary>

![From a DSH article session to an editable, saved Excalidraw canvas](https://raw.githubusercontent.com/hanzhangzzz/dsh-diagram/assets/dsh-diagram-workflow-v1.gif)

This is a real recording of the stable version; its interface and diagram appearance differ from the source preview above.

</details>

## Quick install

Requirements:

- DeepSeek Harness `0.1.5-rc.1` (latest); also verified on `0.1.5-rc.2` and `0.1.2-rc.1`. DSH `0.1.1-rc.2` and older need dsh-diagram `0.4.0`
- Node.js `^22.19.0` or `>=24.0.0`
- pnpm `>=10` on `PATH` (the DSH plugin command delegates package management to pnpm)
- DSH Web bound to `127.0.0.1`

DeepSeek Harness does not install a global `dsh` command by default; the official way to launch it is through `npx`. The commands below work on any machine that meets the requirements:

```sh
npx -y @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web add dsh-diagram@latest
npx -y @deepseek-ai/dsh@0.1.5-rc.1 --profile web --dump-config
npx -y @deepseek-ai/dsh@0.1.5-rc.1 web
```

The config dump should contain this block:

```yaml
# == dsh-diagram
- id: diagram
  name: dsh-diagram
```

If DSH Web was already running, restart it after adding or updating the plugin. Then open an existing session and look for the **Canvas** tab.

### Running DSH from source

Run the same commands from a DeepSeek Harness checkout that matches a supported release, using `pnpm dsh` as the prefix:

```sh
pnpm dsh plugin --profile web add dsh-diagram@latest
pnpm dsh --profile web --dump-config
pnpm dsh web
```

### If `dsh` is on your `PATH`

If you installed the CLI globally or created a shell alias, the short form works the same way:

```sh
dsh plugin --profile web add dsh-diagram@latest
dsh --profile web --dump-config
dsh web
```

Later sections use this short `dsh` form; substitute the `npx -y @deepseek-ai/dsh@0.1.5-rc.1` or `pnpm dsh` prefix that matches how you run DSH.

## Create your first diagram

1. Open a DSH session that already contains the article, or let the Agent read it with DSH's existing file or Web tools.
2. Type `/` in the composer and pick **canvas-diagram** — the plugin registers this skill so you never have to remember a tool name. Plain requests such as "把这篇文章画成架构图" route through the same skill automatically. An explicit prompt also works:

   ```text
   Create one clear diagram for this article. Choose the most suitable diagram type, call diagram_create, and keep the title and node labels concise.
   ```

   For the optional editorial hand-drawn treatment, say so explicitly:

   ```text
   Turn this article into an editable sketchnote diagram. Use semantic icons only for the key concepts.
   ```

3. After the tool finishes, select **Canvas** at the top of the conversation.
4. Edit the diagram directly. **Saved** means the Host has completed a durable write.
5. Export the result, or ask the Agent to call `diagram_read` before continuing from your manual changes.

The plugin supports report boards, flowcharts, architecture diagrams, timelines, hierarchies, comparisons, and relationship diagrams. Visual style is independent of diagram type: omitted/`clean` preserves the original rendering, while `sketchnote` uses warm paper, near-black ink, low-saturation marker fills, handwritten text, and a controlled set of native Excalidraw icons. Evidence-heavy reports use deterministic full-width context/outcome bands, aligned main columns, semantic colors, and converter-measured native text placement. Report and grouped-architecture connectors select stable node-boundary ports and orthogonal corridors while avoiding unrelated nodes, group headings, and independent routed edges.

## What it adds

| Surface | Behavior |
| --- | --- |
| `diagram_create` | Creates a diagram for the current Agent Session from a compact semantic specification. `visualStyle: "sketchnote"` selects the optional hand-drawn compiler; controlled `icon` values compile to editable native primitives rather than images. |
| `diagram_read` | Reads a bounded summary of the current editable scene into the conversation transcript. |
| `canvas-diagram` skill | Built-in bilingual routing entry: selectable from the composer's `/` menu and matched by generic diagram requests, so the Agent reaches `diagram_create` without exact tool-name prompts. |
| Inline chat preview | After `diagram_create`, a preview card appears in the conversation flow and always renders the diagram's current content — including later canvas edits — as a static SVG. |
| **Canvas** tab | Opens the Excalidraw editor only when selected, keeping it out of the normal chat startup path. |
| Diagram list | Switches between diagrams; collapses on desktop and becomes a selector on narrow screens. |
| Autosave | Debounced durable writes with revision conflict protection and tab-local pending-draft recovery. |
| Export | Downloads `.excalidraw`, SVG, or PNG files. |

The plugin does not fetch articles and does not inject UI into arbitrary websites. Article acquisition stays with the DSH conversation, file tools, or Web tools.

## Compatibility

| Item | Supported in `0.5.0` |
| --- | --- |
| DeepSeek Harness | `0.1.5-rc.1`, `0.1.5-rc.2`, `0.1.2-rc.1` (older DSH: use `dsh-diagram@0.4.0`) |
| Profile | `web` |
| Web bind address | `127.0.0.1` only |
| Node.js | `^22.19.0` or `>=24.0.0` |
| Editor | Excalidraw `0.18.1` |
| Storage | Plugin-owned DSH storage-domain sidecar |
| Install artifact | Prebuilt npm package or GitHub Release tarball with SHA-256 checksum |

The npm package has no install lifecycle scripts. Installation adds a bundle to the selected DSH profile; it does not compile code or modify the DeepSeek Harness source tree.

## Manage the installation

### Update

```sh
dsh plugin --profile web update dsh-diagram --latest
```

Restart DSH Web after the update.

### Install the exact latest public GitHub Release artifact

The release page publishes the same prebuilt tarball with a SHA-256 checksum:

```sh
dsh plugin --profile web add \
  https://github.com/hanzhangzzz/dsh-diagram/releases/download/v0.5.0/dsh-diagram-0.5.0.tgz
```

See [v0.5.0](https://github.com/hanzhangzzz/dsh-diagram/releases/tag/v0.5.0) for the checksum and release notes.

### Remove

```sh
dsh plugin --profile web remove dsh-diagram
```

Removing the bundle does not delete saved diagram sidecar data. Reinstalling the plugin can make that data available again to the same Session identity.

## Data, security, and limits

- The Excalidraw scene is the current document. The original semantic specification is retained only as its creation source.
- A diagram is bound to its Session id and `{createdAt, cwd}` lifecycle fingerprint. A reused Session id cannot read older data.
- Session fork and Session export do not copy or include diagram sidecar data.
- Editor assets and fonts are self-hosted by the bundle; the canvas does not depend on an external CDN.
- Static paths, RPC bodies, request origin, Session ownership, and scene contents are validated by the Host before persistence.
- Images, iframes, embeddables, external links, and non-empty binary files are rejected in this release.
- Defaults limit each scene to 1 MiB and all stored diagram records to 64 MiB. Element, text, diagram-count, and byte limits are explicit in [`cordis.patch.yml`](./cordis.patch.yml).
- The plugin intentionally refuses to load when DSH Web binds to `0.0.0.0`; this release does not expose the canvas RPC to a LAN.

## Troubleshooting

### The Canvas tab is missing

Confirm that you installed the plugin into the `web` profile, that `--dump-config` contains the `dsh-diagram` block shown above, and that DSH Web was restarted after installation.

### The Agent wrote an SVG or Mermaid file instead of using the Canvas

The model chooses freely among all tools and workspace skills in the session. The plugin registers its own `canvas-diagram` skill so generic diagram requests normally route to the canvas; if a workspace skill with a stronger matching description still wins, pick **canvas-diagram** from the `/` menu or mention the Canvas explicitly — for example, "call diagram_create so I can edit the result in the Canvas tab".

### The Agent does not know about my manual edits

Manual edits are not silently injected into model context. Ask the Agent to call `diagram_read`; its result is then recorded in the normal conversation transcript.

### Can the plugin fetch an article from a URL?

No. First let DSH obtain the content through the conversation, a file tool, or a Web tool. Then ask for a diagram.

### Why does startup fail with `0.0.0.0`?

The canvas RPC is not designed for LAN exposure in this release. The plugin fails closed unless DSH Web is physically bound to `127.0.0.1`.

### What should I do after a revision conflict?

The editor keeps the local draft. Export it before choosing **Reload server version** if you need to preserve both versions.

### Why can SVG export log a font fallback warning?

Under the strict content security policy, Excalidraw may fall back from glyph subsetting to embedding the full self-hosted font. The exported SVG remains self-contained; the plugin does not enable `unsafe-eval` to suppress the warning.

## Build from source

```sh
git clone https://github.com/hanzhangzzz/dsh-diagram.git
cd dsh-diagram
pnpm install --frozen-lockfile
pnpm run bundle
pnpm pack
```

Install the generated tarball from a DeepSeek Harness checkout:

```sh
cd /path/to/deepseek-harness
pnpm dsh plugin --profile web add /absolute/path/to/dsh-diagram-VERSION.tgz
pnpm dsh --profile web --dump-config
pnpm dsh web
```

Developer checks:

```sh
pnpm run typecheck
pnpm run test
pnpm run bundle
pnpm pack --json
pnpm run smoke:dsh-install
```

Every installable development commit must use a new prerelease version; never
repack changed code under an existing version. Before a public release, pack
once and exercise the same DSH profile update path from the previous public
version to that exact tarball:

```sh
pnpm run smoke:dsh-install -- \
  --tarball /absolute/path/to/dsh-diagram-VERSION.tgz \
  --upgrade-from PREVIOUS_PUBLIC_VERSION
```

This verifies the client-side update mechanics and both pre/post-update Web
boots without publishing the candidate. Registry discovery through `@latest`
is verified separately after the version is publicly released.

See [`DESIGN.md`](./DESIGN.md) for the product and implementation decisions.

## Contributing

Bug reports and focused pull requests are welcome in [GitHub Issues](https://github.com/hanzhangzzz/dsh-diagram/issues). If the plugin improves your article-to-diagram workflow, a GitHub star helps other DSH users discover it.

## License

The plugin's own code is licensed under [MIT](./LICENSE). Licenses for bundled JavaScript and self-hosted fonts are listed in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) and `third_party_licenses/`.
