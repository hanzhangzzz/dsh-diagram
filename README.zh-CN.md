# dsh-diagram

[English](https://github.com/hanzhangzzz/dsh-diagram/blob/master/README.md) | 简体中文

[![npm version](https://img.shields.io/npm/v/dsh-diagram?style=flat-square)](https://www.npmjs.com/package/dsh-diagram)
[![GitHub release](https://img.shields.io/github/v/release/hanzhangzzz/dsh-diagram?display_name=tag&style=flat-square)](https://github.com/hanzhangzzz/dsh-diagram/releases/latest)
[![license](https://img.shields.io/github/license/hanzhangzzz/dsh-diagram?style=flat-square)](./LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek_Harness-0.1.0--rc.6-4c6ef5?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)

把已经进入 DeepSeek Harness 会话的任意文章变成可编辑的 Excalidraw 画布。Agent 负责提炼结构，你直接在 DSH 中调整文字、节点和连线。

![dsh-diagram 画布演示](https://raw.githubusercontent.com/hanzhangzzz/dsh-diagram/assets/dsh-diagram-demo.gif)

## 为什么用 dsh-diagram？

- **生成后仍可编辑。** 得到的是完整 Excalidraw 画布，不是用完即弃的静态图片。
- **留在当前会话。** 直接打开 DSH 会话中的“画布”标签，不必离开文章上下文。
- **自动保存不静默覆盖。** 基于 revision 的 compare-and-set 会阻止旧编辑器覆盖新版本。
- **可以直接交付。** 支持导出 `.excalidraw`、SVG 和 PNG。
- **模型上下文显式可控。** 只有明确要求 Agent 调用 `diagram_read`，手工修改才会进入对话记录。

## 快速安装

前置条件：

- DeepSeek Harness `0.1.0-rc.6`
- Node.js `^22.19.0` 或 `>=24.0.0`
- `PATH` 中可用的 pnpm `>=10`（DSH 的插件命令会把包管理交给 pnpm）
- DSH Web 绑定 `127.0.0.1`

以下命令假设 `dsh` 已在 `PATH` 中：

```sh
dsh plugin --profile web add dsh-diagram@latest
dsh --profile web --dump-config
dsh web
```

配置输出中应出现：

```yaml
# == dsh-diagram
- id: diagram
  name: dsh-diagram
```

如果 DSH Web 已经在运行，添加或更新插件后需要重启。打开一个已有会话后，顶部应出现“画布”标签。

### 从 DSH 源码运行

在与受支持的 `0.1.0-rc.6` API 匹配的 DeepSeek Harness 源码目录执行相同命令，并把 `dsh` 换成 `pnpm dsh`：

```sh
pnpm dsh plugin --profile web add dsh-diagram@latest
pnpm dsh --profile web --dump-config
pnpm dsh web
```

### 通过 npx 运行 DSH

不安装全局 `dsh` 命令也可以使用，但首次运行较慢，且 `PATH` 中仍需有 pnpm。

```sh
npx -y @deepseek-ai/dsh@0.1.0-rc.6 plugin --profile web add dsh-diagram@latest
npx -y @deepseek-ai/dsh@0.1.0-rc.6 --profile web --dump-config
npx -y @deepseek-ai/dsh@0.1.0-rc.6 web
```

## 创建第一张图

1. 打开已经包含文章内容的 DSH 会话，或先让 Agent 使用 DSH 现有的文件或 Web 工具读取文章。
2. 发送类似下面的提示：

   ```text
   为这篇文章提炼一张清晰的主图。选择最合适的 diagram 类型，调用 diagram_create，标题和节点文字保持简洁。
   ```

3. 工具执行完成后，点击会话顶部的“画布”。
4. 直接修改画布。“已保存”表示 Host 已完成持久化写入。
5. 导出结果；如果希望 Agent 继续处理手工修改后的内容，先让它调用 `diagram_read`。

插件支持流程图、架构图、时间线、层级图、对比图和关系图。

## 插件增加了什么

| 界面或能力 | 行为 |
| --- | --- |
| `diagram_create` | 根据紧凑的语义描述，为当前 Agent Session 创建 diagram。 |
| `diagram_read` | 把当前可编辑 scene 的受限摘要读取到正常对话记录中。 |
| “画布”标签 | 只在用户打开时加载 Excalidraw 编辑器，不进入普通聊天首屏启动路径。 |
| Diagram 列表 | 可在桌面端折叠，窄屏改为选择器。 |
| 自动保存 | 去抖持久化、revision 冲突保护和当前浏览器标签内的待保存草稿恢复。 |
| 导出 | 下载 `.excalidraw`、SVG 或 PNG 文件。 |

插件不会抓取文章，也不会向任意网站注入 UI。文章内容仍由 DSH 对话、文件工具或 Web 工具取得。

## 兼容性

| 项目 | `0.1.1` 支持范围 |
| --- | --- |
| DeepSeek Harness | `0.1.0-rc.6` |
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
dsh plugin --profile web update dsh-diagram
```

更新后重启 DSH Web。

### 安装指定的 GitHub Release 产物

Release 页面提供同一份预构建 tarball 及其 SHA-256 校验值：

```sh
dsh plugin --profile web add \
  https://github.com/hanzhangzzz/dsh-diagram/releases/download/v0.1.1/dsh-diagram-0.1.1.tgz
```

校验值和版本说明见 [v0.1.1](https://github.com/hanzhangzzz/dsh-diagram/releases/tag/v0.1.1)。

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
pnpm dsh plugin --profile web add /absolute/path/to/dsh-diagram-0.1.1.tgz
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

产品和实现决策见 [`DESIGN.md`](./DESIGN.md)。

## 参与贡献

欢迎通过 [GitHub Issues](https://github.com/hanzhangzzz/dsh-diagram/issues) 报告问题或提交范围明确的改进。如果它改善了你的文章配图流程，可以给仓库一个 Star，让更多 DSH 用户找到它。

## 许可证

插件自有代码使用 [MIT License](./LICENSE)。发布包内嵌的 JavaScript 与自托管字体许可见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) 和 `third_party_licenses/`。
