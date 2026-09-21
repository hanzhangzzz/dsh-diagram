# dsh-diagram

[English](https://github.com/hanzhangzzz/dsh-diagram/blob/master/README.md) | 简体中文

[![npm version](https://img.shields.io/npm/v/dsh-diagram?style=flat-square)](https://www.npmjs.com/package/dsh-diagram)
[![GitHub release](https://img.shields.io/github/v/release/hanzhangzzz/dsh-diagram?display_name=tag&style=flat-square)](https://github.com/hanzhangzzz/dsh-diagram/releases/latest)
[![license](https://img.shields.io/github/license/hanzhangzzz/dsh-diagram?style=flat-square)](./LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek_Harness-0.1.5--rc.1-4c6ef5?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)

**dsh-diagram 是 DeepSeek Harness（DSH）的画布插件。** 在现有对话里生成图表，打开同一会话的“画布”标签继续编辑、保存和导出。

**入口：** 在 DSH 输入 `/` 选择 **canvas-diagram** → 对话内生成预览 → 点击“在画布中编辑”或顶部“画布”标签。

![DSH 内的 dsh-diagram：画布标签、Excalidraw 编辑器、已保存状态与导出按钮](https://raw.githubusercontent.com/hanzhangzzz/dsh-diagram/34505294d34c460471b70820e96da03c3f80410a/editorial-preview/dsh-canvas-editor.jpg)

> 当前源码预览：`0.6.0-editorial.3` 的真实 DSH 界面截图。该版本尚未发布到 npm；下面的安装命令目前安装稳定版 `0.5.0`。

一行安装，然后在任意 DSH 会话输入 `/` 选择 **canvas-diagram**：

```sh
npx -y @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web add dsh-diagram@latest
```

> pnpm 11 默认会把发布不满 24 小时的版本排除在解析之外（`minimumReleaseAge`，默认 1440 分钟）。新版本刚发布时 `dsh-diagram@latest` 可能仍装到上一版；此时请显式指定版本，例如 `dsh-diagram@0.5.0`。

> 适合放进你的 DSH 工具箱？先 Star，下一次处理长文章时就能快速找回。

完整前置条件与验证见[快速安装](#快速安装)。

## 为什么用 dsh-diagram？

- **生成后仍可编辑。** 得到的是完整 Excalidraw 画布，不是用完即弃的静态图片。
- **清晰图与手绘信息图可选。** 默认保持精确克制；也可以显式要求暖白纸张、手写文字、低饱和马克笔色块和可编辑语义线稿图标。
- **留在当前会话。** 创建后对话流中立即出现实时预览卡片；“画布”标签打开完整编辑器，全程不离开文章上下文。
- **自动保存并随时交付。** revision 保护避免旧版本覆盖新工作，支持导出 `.excalidraw`、SVG 和 PNG。

<details>
<summary>查看 DSH 对话中的预览与“在画布中编辑”入口</summary>

Agent 生成图表后，预览直接出现在当前对话中。右上角“在画布中编辑”和会话顶部“画布”标签都可进入上面的编辑器。

![DSH 对话中的图表预览与编辑入口](https://raw.githubusercontent.com/hanzhangzzz/dsh-diagram/34505294d34c460471b70820e96da03c3f80410a/editorial-preview/dsh-chat-preview.jpg)

</details>

<details>
<summary>查看导出效果：同一内容，清晰与手绘两种风格</summary>

以下是插件画布导出的 PNG，不是独立应用界面。两种风格在 0.5.0 已支持；这里展示 0.6.0-editorial.3 改进后的效果。

![新版清晰风格：发布完成的三个检查点](https://raw.githubusercontent.com/hanzhangzzz/dsh-diagram/6427235eb0148edcb21bee65ea2a3fa7c9bb5c11/editorial-preview/clean-report.png)

![同一发布复盘的手绘风格](https://raw.githubusercontent.com/hanzhangzzz/dsh-diagram/6427235eb0148edcb21bee65ea2a3fa7c9bb5c11/editorial-preview/sketchnote-report.png)

</details>

<details>
<summary>已发布 0.5.0 的操作演示：创建、编辑与保存</summary>

![从 DSH 文章会话到可编辑、已保存的 Excalidraw 画布](https://raw.githubusercontent.com/hanzhangzzz/dsh-diagram/assets/dsh-diagram-workflow-v1.gif)

这是稳定版的真实操作录像；界面和图表外观与上方源码预览有所不同。

</details>

## 快速安装

前置条件：

- DeepSeek Harness `0.1.5-rc.1`（最新版）；`0.1.5-rc.2`、`0.1.2-rc.1` 同样经过真实安装验证。DSH `0.1.1-rc.2` 及更早版本请使用 dsh-diagram `0.4.0`
- Node.js `^22.19.0` 或 `>=24.0.0`
- `PATH` 中可用的 pnpm `>=10`（DSH 的插件命令会把包管理交给 pnpm）
- DSH Web 绑定 `127.0.0.1`

DeepSeek Harness 默认不会安装全局 `dsh` 命令，官方启动方式是通过 `npx`。满足前置条件的机器都可以直接执行：

```sh
npx -y @deepseek-ai/dsh@0.1.5-rc.1 plugin --profile web add dsh-diagram@latest
npx -y @deepseek-ai/dsh@0.1.5-rc.1 --profile web --dump-config
npx -y @deepseek-ai/dsh@0.1.5-rc.1 web
```

配置输出中应出现：

```yaml
# == dsh-diagram
- id: diagram
  name: dsh-diagram
```

如果 DSH Web 已经在运行，添加或更新插件后需要重启。打开一个已有会话后，顶部应出现“画布”标签。

### 从 DSH 源码运行

在与受支持发行版 API 匹配的 DeepSeek Harness 源码目录执行相同命令，前缀改为 `pnpm dsh`：

```sh
pnpm dsh plugin --profile web add dsh-diagram@latest
pnpm dsh --profile web --dump-config
pnpm dsh web
```

### 如果 `dsh` 已在 `PATH` 中

如果你全局安装了 CLI 或配置了 shell alias，短形式效果相同：

```sh
dsh plugin --profile web add dsh-diagram@latest
dsh --profile web --dump-config
dsh web
```

后文各节以短形式 `dsh` 书写；请按你实际的启动方式替换为 `npx -y @deepseek-ai/dsh@0.1.5-rc.1` 或 `pnpm dsh` 前缀。

## 创建第一张图

1. 打开已经包含文章内容的 DSH 会话，或先让 Agent 使用 DSH 现有的文件或 Web 工具读取文章。
2. 在输入框敲 `/` 选择 **canvas-diagram**——插件自带这个 skill，不需要记住任何工具名。「把这篇文章画成架构图」这类自然说法也会自动路由到画布。显式提示同样有效：

   ```text
   为这篇文章提炼一张清晰的主图。选择最合适的 diagram 类型，调用 diagram_create，标题和节点文字保持简洁。
   ```

   如需本文演示的编辑式手绘风格，明确提出即可：

   ```text
   把这篇文章做成一张可编辑的 sketchnote 图，只给关键概念使用语义图标。
   ```

3. 工具执行完成后，点击会话顶部的“画布”。
4. 直接修改画布。“已保存”表示 Host 已完成持久化写入。
5. 导出结果；如果希望 Agent 继续处理手工修改后的内容，先让它调用 `diagram_read`。

插件支持报告图、流程图、架构图、时间线、层级图、对比图和关系图。视觉风格与图类型正交：省略或使用 `clean` 会保留原有渲染；`sketchnote` 使用暖白纸张、近黑墨线、低饱和马克笔填充、手写字体和一组受控的原生 Excalidraw 图标。信息密集的报告图采用确定性的顶部/底部通栏、对齐主体列、语义配色和基于 Excalidraw 实际测量尺寸的原生文字定位。报告图和带分组的架构图会选择稳定的节点边界端口与正交通道，并绕开无关节点、分组标题和已经布置的独立连线。

## 插件增加了什么

| 界面或能力 | 行为 |
| --- | --- |
| `diagram_create` | 根据紧凑的语义描述，为当前 Agent Session 创建 diagram。`visualStyle: "sketchnote"` 启用可选手绘编译器；受控 `icon` 会编译成可编辑原生图元，而不是图片。 |
| `diagram_read` | 把当前可编辑 scene 的受限摘要读取到正常对话记录中。 |
| `canvas-diagram` skill | 内置中英双语路由入口：可在输入框 `/` 菜单中选择，泛化的图表请求也会自动命中，无需在提示里点名工具。 |
| 对话内嵌预览 | `diagram_create` 之后，对话流中出现一张预览卡片，始终以静态 SVG 展示该图表的当前内容（含画布后续编辑）。 |
| “画布”标签 | 只在用户打开时加载 Excalidraw 编辑器，不进入普通聊天首屏启动路径。 |
| Diagram 列表 | 可在桌面端折叠，窄屏改为选择器。 |
| 自动保存 | 去抖持久化、revision 冲突保护和当前浏览器标签内的待保存草稿恢复。 |
| 导出 | 下载 `.excalidraw`、SVG 或 PNG 文件。 |

插件不会抓取文章，也不会向任意网站注入 UI。文章内容仍由 DSH 对话、文件工具或 Web 工具取得。

## 兼容性

| 项目 | `0.5.0` 支持范围 |
| --- | --- |
| DeepSeek Harness | `0.1.5-rc.1`、`0.1.5-rc.2`、`0.1.2-rc.1`（更早的 DSH 请用 `dsh-diagram@0.4.0`） |
| Profile | `web` |
| Web 绑定地址 | 仅 `127.0.0.1` |
| Node.js | `^22.19.0` 或 `>=24.0.0` |
| 编辑器 | Excalidraw `0.18.1` |
| 存储 | 插件独立的 DSH storage-domain sidecar |
| 安装产物 | 预构建 npm 包，或带 SHA-256 校验值的 GitHub Release |

npm 包没有 install lifecycle script。安装只会把 bundle 加入指定的 DSH profile，不会现场编译，也不会修改 DeepSeek Harness 源码。

## 管理安装

### 更新

```sh
dsh plugin --profile web update dsh-diagram --latest
```

更新后重启 DSH Web。

### 安装最新公开 GitHub Release 的精确产物

Release 页面提供同一份预构建 tarball 及其 SHA-256 校验值：

```sh
dsh plugin --profile web add \
  https://github.com/hanzhangzzz/dsh-diagram/releases/download/v0.5.0/dsh-diagram-0.5.0.tgz
```

校验值和版本说明见 [v0.5.0](https://github.com/hanzhangzzz/dsh-diagram/releases/tag/v0.5.0)。

### 移除

```sh
dsh plugin --profile web remove dsh-diagram
```

移除 bundle 不会删除已保存的 diagram sidecar 数据。重新安装后，同一个 Session 身份仍可读取这些数据。

## 数据、安全与限制

- Excalidraw scene 是当前文档；创建时的语义描述只保留为来源记录。
- Diagram 绑定 Session id 与 `{createdAt, cwd}` 生命周期指纹；复用的 Session id 无法读取旧数据。
- Session fork 和 Session export 不复制或携带 diagram sidecar。
- Editor 资源与字体均由 bundle 自托管，画布不依赖外部 CDN。
- Host 会在持久化前校验静态路径、RPC 请求体、请求来源、Session 归属和 scene 内容。
- 当前版本拒绝 image、iframe、embeddable、外部 link 和非空 binary files。
- 默认每个 scene 最多 1 MiB，全部 diagram 记录合计最多 64 MiB；元素数、文字、diagram 条数和字节限制均显式配置在 [`cordis.patch.yml`](./cordis.patch.yml)。
- DSH Web 绑定 `0.0.0.0` 时插件会拒绝加载；当前版本不把画布 RPC 暴露到局域网。

## 常见问题

### 为什么没有“画布”标签？

确认插件安装到了 `web` profile，`--dump-config` 输出包含上面的 `dsh-diagram` 配置块，并在安装后重启了 DSH Web。

### 为什么 Agent 写了 SVG 或 Mermaid 文件，而不是用画布？

模型会在会话内所有工具和工作区 skill 中自主选择。插件自带 `canvas-diagram` skill，泛化的图表请求通常会自动路由到画布；如果工作区里存在描述更匹配的 skill 抢走了请求，在 `/` 菜单里选择 **canvas-diagram**，或明确点名画布——例如「调用 diagram_create，我要在画布标签里编辑结果」。

### 为什么 Agent 不知道我手工修改了画布？

手工修改不会静默注入模型上下文。明确要求 Agent 调用 `diagram_read`，结果才会写入正常对话记录。

### 插件能直接抓取网页文章吗？

不能。先让 DSH 通过对话、文件工具或 Web 工具取得内容，再要求生成 diagram。

### 为什么使用 `0.0.0.0` 会启动失败？

当前版本的画布 RPC 不面向局域网暴露。除非 DSH Web 物理绑定 `127.0.0.1`，否则插件会失败关闭。

### 出现 revision 冲突怎么办？

编辑器会保留本地稿。如果需要保留两个版本，先“导出本地稿”，再选择“重新载入服务器版本”。

### 为什么导出 SVG 时控制台可能出现字体 fallback 日志？

在严格 CSP 下，Excalidraw 可能从 glyph subsetting 回退到内嵌完整的自托管字体。导出的 SVG 仍然自包含；插件不会为了消除日志开启 `unsafe-eval`。

## 从源码构建

```sh
git clone https://github.com/hanzhangzzz/dsh-diagram.git
cd dsh-diagram
pnpm install --frozen-lockfile
pnpm run bundle
pnpm pack
```

然后从 DeepSeek Harness 源码目录安装生成的 tarball：

```sh
cd /path/to/deepseek-harness
pnpm dsh plugin --profile web add /absolute/path/to/dsh-diagram-VERSION.tgz
pnpm dsh --profile web --dump-config
pnpm dsh web
```

开发检查：

```sh
pnpm run typecheck
pnpm run test
pnpm run bundle
pnpm pack --json
pnpm run smoke:dsh-install
```

每个可安装的开发提交都必须使用新的预发布版本，禁止修改代码后继续以旧版本号重新打包。公开发布前只打包一次，并从上一公开版本通过真实 DSH profile 更新链路更新到这一个确定的 tarball：

```sh
pnpm run smoke:dsh-install -- \
  --tarball /absolute/path/to/dsh-diagram-VERSION.tgz \
  --upgrade-from PREVIOUS_PUBLIC_VERSION
```

该验证不会发布候选包，但会覆盖客户端更新机制以及更新前、更新后的两次 Web 启动。npm `@latest` 的 registry 发现能力在版本公开发布后另行验证。

产品和实现决策见 [`DESIGN.md`](./DESIGN.md)。

## 参与贡献

欢迎通过 [GitHub Issues](https://github.com/hanzhangzzz/dsh-diagram/issues) 报告问题或提交范围明确的改进。如果它改善了你的文章配图流程，可以给仓库一个 Star，让更多 DSH 用户找到它。

## 许可证

插件自有代码使用 [MIT License](./LICENSE)。发布包内嵌的 JavaScript 与自托管字体许可见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) 和 `third_party_licenses/`。
