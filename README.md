# dsh-diagram

`dsh-diagram` 是 DeepSeek Harness 的可安装 Web bundle。Agent 把当前上下文中的文章提炼为紧凑的 `DiagramSpec`，插件将其确定性布局为 Excalidraw 画布；用户可在 DSH 会话的“画布”标签页继续修改、自动保存并导出。

## 首版能力

- 支持流程图、架构图、时间线、层级图、对比图和关系图。
- `diagram_create` 为当前 Agent Session 创建 diagram。
- `diagram_read` 显式读取当前画布；手工编辑不会在后台自动进入模型上下文。
- 画布按 revision 做 compare-and-set 自动保存，冲突不会静默覆盖本地内容。
- 切换标签或页面卸载前会把一份未确认草稿写入当前浏览器标签的 `sessionStorage`，重开“画布”后按原 revision 恢复保存。
- 桌面端可折叠 diagram 列表，窄屏改用下拉选择，把主要空间留给画布。
- 导出 `.excalidraw`、SVG 和 PNG。
- 数据存放在插件自己的 storage-domain sidecar；刷新或重装插件后仍可恢复。

首版不抓取文章，也不在任意网页注入 UI。Agent 应先用 DSH 已有的对话、文件或 Web 工具取得文章内容，再调用 `diagram_create`。

## 安装

当前版本支持 DeepSeek Harness `0.1.0-rc.6` Web profile。发布包只包含预构建 Host、Client 和 editor 产物；包清单不声明 `build`、`prepack`、`prepare` 或任何 install lifecycle script，安装时不编译代码，也不修改 DeepSeek Harness 源码。

安装 npm 发布包：

```sh
dsh plugin --profile web add dsh-diagram
dsh --profile web --dump-config
dsh web
```

也可以安装 GitHub Release 中带 SHA-256 校验值的同一份 tarball。

### 从源码构建

从源码构建发布包：

```sh
pnpm install --frozen-lockfile
pnpm run bundle
pnpm pack
```

再在 DSH 安装目录将预构建 tarball 安装到 Web profile：

```sh
pnpm dsh plugin --profile web add /absolute/path/to/dsh-diagram-0.1.0.tgz
pnpm dsh --profile web --dump-config
pnpm dsh web
```

首版只支持 DSH Web 绑定 `127.0.0.1`。如果 WebServer 配置为 `0.0.0.0`，插件会在加载时明确拒绝启动；当前版本不把画布 RPC 暴露到局域网。

移除插件：

```sh
pnpm dsh plugin --profile web remove dsh-diagram
```

移除 bundle 不会删除已保存的 sidecar 数据。

## 使用

在一个已有文章内容的 DSH 会话中告诉 Agent：

```text
为这篇文章提炼一张主图。选择最合适的 diagram 类型，调用 diagram_create，标题和节点文字保持简洁。
```

Agent 创建后，点击会话顶部的“画布”标签。画布内容变化会去抖保存；“已保存”表示 Host 已完成 durable write。需要让 Agent 继续基于手工修改后的内容工作时，明确要求它调用 `diagram_read`。

## 数据与安全

- Excalidraw scene 是当前文档；创建时的 `DiagramSpec` 只保留为来源记录。
- diagram 绑定 Session id 与 `{createdAt, cwd}` 生命周期指纹；复用的 Session id 看不到旧数据。
- Session fork 和 Session export 不复制或携带 diagram sidecar。
- editor 只在“画布”标签挂载后加载。它由同一 bundle 的 Host 路由提供，并受路径白名单、CSP、loopback Host/Origin 检查、解析前请求字节上限、RPC/scene schema 和 Session 归属检查约束。
- Excalidraw 字体随 bundle 自托管在 `/diagram-assets/fonts/`，画布不依赖外部 CDN。
- 首版拒绝 image、iframe、embeddable、外部 link 和非空 binary files，并限制 scene 大小、元素数及文字长度。
- 默认每个 scene 最多 1 MiB，全部 diagram 记录合计最多 64 MiB；条数和字节预算都可在 bundle patch 中显式配置。

## 已知限制

- Excalidraw 0.18.1 在严格 CSP 下导出包含非系统字体的 SVG 时，会在开发者控制台记录 glyph subsetting fallback；导出会改为内嵌完整字体，文件仍自包含且内容完整。插件不为消除该日志放开 `unsafe-eval`。
- 画布 RPC 的单请求解析前上限由 `maxSceneBytes + 16 KiB` 推导，默认约 1.02 MiB。这一上限不提供并发请求总量配额或 slow-client 超时；首版因此仍强制 Web 只绑定 `127.0.0.1`。
- 当前支持的 DSH 版本尚无 typed `inspect-if-present` Session API；首次查询不存在或冷 Session 时会扫描 snapshot 列表，不影响已打开 Session 的正常编辑路径。

## 开发

```sh
pnpm run typecheck
pnpm run test
pnpm run bundle
pnpm pack --json
pnpm run smoke:dsh-install
```

设计基线和明确的非目标见 [DESIGN.md](./DESIGN.md)。

## License

插件自有代码使用 MIT License。发布包内嵌的第三方 JavaScript 和自托管字体许可见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) 与 `third_party_licenses/`。
