# Star Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repository's weak first-screen proof with a concise bilingual value proposition, a privacy-safe real DSH workflow GIF, a one-line install path, and an honest Star reminder.

**Architecture:** Keep the plugin and package unchanged. Publish the binary demo only on the existing `assets` branch, then update `README.md` and `README.zh-CN.md` on the task branch to reference the immutable new asset path; preserve all detailed install, security, compatibility, and troubleshooting content below the first screen.

**Tech Stack:** Markdown, GitHub README rendering, DeepSeek Harness Web `0.1.0-rc.6`, dsh-diagram `0.3.4`, macOS Computer Use screenshots, ffmpeg GIF assembly, Git/GitHub CLI.

---

### Task 1: Prove the recording environment is safe and current

**Files:**
- Read: `AGENTS.md`
- Read: `README.md`
- Read: `README.zh-CN.md`
- Read-only dependency: `/Users/doing/Desktop/code/github/deepseek-harness`
- Create outside repository: `/tmp/dsh-diagram-dsh-status-before.txt`
- Create outside repository: `/tmp/dsh-diagram-baseline.json`

- [ ] **Step 1: Capture the upstream DSH worktree baseline**

Run:

```sh
git -C /Users/doing/Desktop/code/github/deepseek-harness \
  status --porcelain=v2 --untracked-files=all \
  > /tmp/dsh-diagram-dsh-status-before.txt
```

Expected: the file is empty. If it is not empty, preserve the contents exactly and continue read-only; never clean or reset the checkout.

- [ ] **Step 2: Confirm the active Web profile contains dsh-diagram**

Run from the DSH checkout:

```sh
pnpm dsh --profile web --dump-config | rg -n -C 2 'dsh-diagram|id: diagram'
```

Expected: the output contains `# == dsh-diagram`, `id: diagram`, and `name: dsh-diagram`.

- [ ] **Step 3: Capture the public conversion baseline**

Run:

```sh
gh api repos/hanzhangzzz/dsh-diagram > /tmp/dsh-diagram-repo.json
gh api repos/hanzhangzzz/dsh-diagram/traffic/popular/paths > /tmp/dsh-diagram-paths.json
jq -n \
  --arg capturedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson repo "$(cat /tmp/dsh-diagram-repo.json)" \
  --argjson paths "$(cat /tmp/dsh-diagram-paths.json)" \
  '{capturedAt:$capturedAt,stars:$repo.stargazers_count,overview:($paths[]|select(.path=="/hanzhangzzz/dsh-diagram")|.uniques)}' \
  > /tmp/dsh-diagram-baseline.json
```

Expected: valid JSON with numeric `stars` and `overview`. This is an external evidence artifact, not a tracked project document.

### Task 2: Capture and assemble the real DSH proof GIF

**Files:**
- Create outside repository: `/tmp/dsh-diagram-capture/frame-01.png` through `frame-07.png`
- Create outside repository: `/tmp/dsh-diagram-capture/frames.txt`
- Create outside repository: `/tmp/dsh-diagram-workflow-v1.gif`

- [ ] **Step 1: Open the active local DSH Web in a clean browser window**

Use Computer Use to open `http://127.0.0.1:3080`. Create a new Session with only this public generic article text:

```text
Reliable automation has three stages: observe the current state, choose one bounded action, and verify the result. If verification fails, preserve the evidence and retry from the observed state instead of guessing.
```

Expected: the visible Session contains no user workspace path, prior conversation, API key, private article, or personal identifier.

- [ ] **Step 2: Capture the request and inline-preview states**

Invoke `/canvas-diagram` or send this request:

```text
把这段内容画成一张流程图，使用画布并保持节点文字简短。
```

Save actual Computer Use screenshots as:

```text
/tmp/dsh-diagram-capture/frame-01.png  clean article and request
/tmp/dsh-diagram-capture/frame-02.png  tool running or completed
/tmp/dsh-diagram-capture/frame-03.png  inline preview visible in chat
```

Expected: frame 03 visibly proves the diagram belongs to the current conversation.

- [ ] **Step 3: Capture edit, save, and export states**

Open the preview in the Canvas, edit the first node to `Observe current state`, wait for `Saved`, then open or expose the export controls. Save actual screenshots as:

```text
/tmp/dsh-diagram-capture/frame-04.png  Canvas opened
/tmp/dsh-diagram-capture/frame-05.png  node edited
/tmp/dsh-diagram-capture/frame-06.png  Saved visible
/tmp/dsh-diagram-capture/frame-07.png  .excalidraw, SVG, and PNG controls visible
```

Expected: the screenshots show one continuous Session lifecycle and no private data.

- [ ] **Step 4: Assemble an optimized GIF without inventing UI states**

Create `/tmp/dsh-diagram-capture/frames.txt` with these exact durations:

```text
file 'frame-01.png'
duration 1.5
file 'frame-02.png'
duration 1.0
file 'frame-03.png'
duration 2.0
file 'frame-04.png'
duration 1.5
file 'frame-05.png'
duration 1.5
file 'frame-06.png'
duration 1.5
file 'frame-07.png'
duration 2.0
file 'frame-07.png'
```

Run:

```sh
cd /tmp/dsh-diagram-capture
ffmpeg -y -f concat -safe 0 -i frames.txt \
  -vf "fps=10,scale=1200:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" \
  -loop 0 /tmp/dsh-diagram-workflow-v1.gif
ffprobe -v error -show_entries format=duration,size \
  -of default=noprint_wrappers=1 /tmp/dsh-diagram-workflow-v1.gif
```

Expected: duration is at most 15 seconds, the width is 1200 pixels, and the file is small enough to render promptly on GitHub.

- [ ] **Step 5: Perform visual privacy and legibility review**

Extract a contact sheet and inspect it at original detail:

```sh
ffmpeg -y -v error -i /tmp/dsh-diagram-workflow-v1.gif \
  -vf "fps=1,scale=600:-1,tile=4x3" -frames:v 1 \
  /tmp/dsh-diagram-workflow-v1-contact.jpg
```

Expected: the Ask → Preview → Canvas → Edit → Saved → Export chain is readable; no private data appears. If either condition fails, recapture the affected real state rather than annotating or fabricating it.

### Task 3: Publish the media asset without polluting master

**Files:**
- Create on `assets` branch: `dsh-diagram-workflow-v1.gif`

- [ ] **Step 1: Verify GitHub publishing identity**

Run:

```sh
gh api user --jq '{login,id}'
```

Expected: `{"id":258429709,"login":"huajuan404"}`. Stop before push if the identity differs.

- [ ] **Step 2: Add the asset through a temporary assets worktree**

Run:

```sh
DSH_ASSET_WORKTREE="$(mktemp -d)"
git worktree add "$DSH_ASSET_WORKTREE" assets
cp /tmp/dsh-diagram-workflow-v1.gif "$DSH_ASSET_WORKTREE/dsh-diagram-workflow-v1.gif"
git -C "$DSH_ASSET_WORKTREE" add dsh-diagram-workflow-v1.gif
git -C "$DSH_ASSET_WORKTREE" commit -m "assets: add concise DSH workflow demo"
git -C "$DSH_ASSET_WORKTREE" push origin assets
```

Expected: the push succeeds without force and the commit author/committer is huajuan404.

- [ ] **Step 3: Verify the public raw asset**

Run:

```sh
curl -L --fail --silent --show-error \
  https://raw.githubusercontent.com/hanzhangzzz/dsh-diagram/assets/dsh-diagram-workflow-v1.gif \
  -o /tmp/dsh-diagram-workflow-public.gif
cmp /tmp/dsh-diagram-workflow-v1.gif /tmp/dsh-diagram-workflow-public.gif
```

Expected: `cmp` exits 0.

### Task 4: Rewrite the bilingual README first screen

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Replace the English first-screen copy**

Keep the title, language link, and badges. Replace the current lead, demo URL, install lead-in, and first benefit list with wording that contains these exact decisions:

````markdown
Your DSH session already understands the article. Turn that understanding into an Excalidraw canvas you can keep editing.

The Agent creates the first structure; you refine it in DSH, autosave it, and export it. The result stays editable instead of becoming disposable Mermaid output.

![From a DSH article session to an editable, saved Excalidraw canvas](https://raw.githubusercontent.com/hanzhangzzz/dsh-diagram/assets/dsh-diagram-workflow-v1.gif)

Install it in one command:

```sh
npx -y @deepseek-ai/dsh@0.1.0-rc.6 plugin --profile web add dsh-diagram@latest
```

> Useful for your DSH toolbox? Star the repo so you can find it when the next long article needs a diagram.
````

Follow with exactly three first-screen benefits: editable rather than disposable, native to the conversation, and durably saved plus exportable. Preserve the adaptive structure claim later under `What it adds` or the detailed creation section rather than deleting it.

- [ ] **Step 2: Mirror the same decisions in Chinese**

Use this lead and CTA contract:

```markdown
DSH Session 已经理解文章；dsh-diagram 把这份理解变成一张可以持续编辑的 Excalidraw 画布。

Agent 负责初始结构，你在 DSH 内继续修改、自动保存并导出。结果始终可编辑，而不是一次性的 Mermaid 输出。

> 适合放进你的 DSH 工具箱？先 Star，下一次处理长文章时就能快速找回。
```

Use the same asset URL, install command, three benefits, and section order as the English README.

- [ ] **Step 3: Validate bilingual parity and Markdown integrity**

Run:

```sh
rg -n 'dsh-diagram-workflow-v1.gif|Star the repo|先 Star|plugin --profile web add' README.md README.zh-CN.md
git diff --check
```

Expected: both README files reference the same GIF and install command; each contains exactly one first-screen Star prompt; `git diff --check` exits 0.

- [ ] **Step 4: Commit the README change**

Run:

```sh
git add README.md README.zh-CN.md
git commit -m "docs: sharpen README star conversion path"
```

Expected: only the two README files are included in this commit.

### Task 5: Verify the final public delivery and preserve upstream state

**Files:**
- Read: `README.md`
- Read: `README.zh-CN.md`
- Create outside repository: `/tmp/dsh-diagram-dsh-status-after.txt`

- [ ] **Step 1: Run local document gates**

Run:

```sh
git diff origin/master...HEAD --check
! rg -n '/Users/|/home/[^/]+/|api[_-]?key|sk-[A-Za-z0-9]' README.md README.zh-CN.md
git status --short --branch
```

Expected: no whitespace errors or leaked paths/secrets; only intentional commits are ahead of `origin/master`; worktree is clean.

- [ ] **Step 2: Prove the DSH checkout is unchanged**

Run:

```sh
git -C /Users/doing/Desktop/code/github/deepseek-harness \
  status --porcelain=v2 --untracked-files=all \
  > /tmp/dsh-diagram-dsh-status-after.txt
cmp /tmp/dsh-diagram-dsh-status-before.txt /tmp/dsh-diagram-dsh-status-after.txt
```

Expected: `cmp` exits 0.

- [ ] **Step 3: Push the task branch and open a pull request**

Run:

```sh
gh api user --jq '{login,id}'
git push -u origin docs/star-conversion
gh pr create \
  --base master \
  --head docs/star-conversion \
  --title "docs: improve README Star conversion" \
  --body "Refocuses the first screen on current DSH users, replaces the old demo with a privacy-safe real workflow, and adds an honest find-it-later Star reminder. No plugin code or package behavior changes."
```

Expected: identity is huajuan404 and GitHub returns a pull-request URL.

- [ ] **Step 4: Verify the rendered pull-request README**

Open the branch's rendered GitHub repository page and the Chinese README in a real browser. Check desktop and narrow widths for the lead, GIF legibility, command wrapping, CTA, and the three benefits. Check browser console for failed asset requests.

Expected: both documents render without broken media or horizontal overflow. If browser tooling is unavailable, report this gate as unverified and do not claim visual completion.
