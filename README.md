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

## 本地安装

当前版本面向同级目录中的 DeepSeek Harness `0.1.0-rc.5` 源码开发。先构建插件：

```sh
pnpm install
pnpm run build
```

再从 `deepseek-harness` 仓库安装到 Web profile：

```sh
pnpm dsh plugin --profile web add ../dsh-diagram
pnpm dsh --profile web --dump-config
pnpm dsh web
```

首版只支持 DSH Web 绑定 `127.0.0.1`。如果 WebServer 配置为 `0.0.0.0`，插件会在加载时明确拒绝启动；当前版本不把画布 RPC 暴露到局域网。

也可以安装 `pnpm pack` 生成的预编译 tarball。当前不支持直接从 Git URL 安装源码：公开 registry 尚未提供本项目开发时使用的全部 DSH `rc.5` 类型包，因此仓库没有声明会在目标机器执行的 `prepare` 脚本。

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
- editor 只在“画布”标签挂载后加载。它由同一 bundle 的 Host 路由提供，并受路径白名单、CSP、loopback RPC、请求 schema 和 Session 归属检查约束。
- Excalidraw 字体随 bundle 自托管在 `/diagram-assets/fonts/`，画布不依赖外部 CDN。
- 首版拒绝 image、iframe、embeddable、外部 link 和非空 binary files，并限制 scene 大小、元素数及文字长度。
- 默认每个 scene 最多 1 MiB，全部 diagram 记录合计最多 64 MiB；条数和字节预算都可在 bundle patch 中显式配置。

## 已知限制

- Excalidraw 0.18.1 在严格 CSP 下导出包含非系统字体的 SVG 时，会在开发者控制台记录 glyph subsetting fallback；导出会改为内嵌完整字体，文件仍自包含且内容完整。插件不为消除该日志放开 `unsafe-eval`。
- DSH `0.1.0-rc.5` 的独立 Connection RPC 通道在解析前仍继承 Host 的通用 160 MiB 请求上限；插件会在解析后执行 1 MiB scene 限制，并且首版强制 Web 只绑定 `127.0.0.1`。独立通道的解析前限额需要 DSH 上游 API 支持。
- DSH `0.1.0-rc.5` 尚无 typed `inspect-if-present` Session API；首次查询不存在或冷 Session 时会扫描 snapshot 列表，不影响已打开 Session 的正常编辑路径。

## 开发

```sh
pnpm run typecheck
pnpm run test
pnpm run build
pnpm pack --json
```

设计基线和明确的非目标见 [DESIGN.md](./DESIGN.md)。

## License

MIT
