# AGENTS.md

`dsh-diagram` 是独立发布的 DeepSeek Harness Web 插件。它把已经进入 DSH Session 的文章内容转换为可编辑的 Excalidraw 画布，并通过插件自有 sidecar 持久化。插件仓库、npm 包和 DSH 源码必须保持分离。

本文件是开发代理的维护入口。`CLAUDE.md` 必须保持为指向本文件的软链。产品现状见 [README.md](README.md) 和 [README.zh-CN.md](README.zh-CN.md)，设计决策见 [DESIGN.md](DESIGN.md)，sidecar 的长期理由见 [.agents/notes/implemented/architecture/2026-08-14-diagram-canvas-sidecar.md](.agents/notes/implemented/architecture/2026-08-14-diagram-canvas-sidecar.md)。

## 发布身份与仓库

- GitHub 仓库：`https://github.com/hanzhangzzz/dsh-diagram`。
- npm 包：`dsh-diagram`。
- GitHub commit 的 author 和 committer 必须是 `huajuan404 <258429709+huajuan404@users.noreply.github.com>`。
- 推送或创建 Release 前运行 `gh api user --jq '{login,id}'`，只有返回 `huajuan404` 和 `258429709` 才能继续。
- npm 发布前运行 `npm whoami`；当前公开包 maintainer 是 `hanzhangz`。账号不匹配时停止，不要尝试换账号或改变 package ownership。
- 不得 force-push 已发布分支或移动已发布 tag。版本有问题时发布新 patch 版本。

## 开始开发

新环境只需要本仓库和公开 npm 依赖，不依赖相邻的 DSH 源码 checkout：

```sh
git clone https://github.com/hanzhangzzz/dsh-diagram.git
cd dsh-diagram
pnpm --version
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run test
```

要求 Node.js `^22.19.0 || >=24.0.0`，并确保 pnpm `>=10` 是 `PATH` 中可直接执行的二进制。不要假设 Corepack 在所有 Node 安装中都可用；先验证 `pnpm --version`。开发依赖使用公开的 DSH 版本，不要把 `package.json` 改回本机 `link:` 路径。

开始修改前：

1. 读取本文件、README、DESIGN 和与目标模块对应的测试。
2. 运行 `git status --short --branch`，保留不属于当前任务的改动。
3. 如果需要参考 DSH 源码，先记录其工作树状态；把它当只读依赖，任务结束时复核状态未变化。
4. 先写或更新能复现问题的 focused test，再改实现。

## 仓库分层

- `src/core/`：唯一的 `DiagramSpec`、scene、record 和 RPC 数据定义，以及确定性布局。
- `src/host/`：Session 归属、storage-domain、CAS、工具、HTTP RPC 和 editor 静态资源。
- `src/client/`：轻量 DSH Client 插件，只注册会话“画布”标签并挂载 iframe。
- `src/editor/`：Vite 构建的 Excalidraw 编辑器、RPC adapter、自动保存、草稿恢复和导出。
- `build/`：bundle、字体、第三方许可和真实安装 smoke 的生成器。
- `cordis.patch.yml`：保留在已安装包内，由 DSH 根据 `package.json.dsh.bundle.patch` 在组合 profile 时读取。`dsh plugin add` 只更新 profile 的 package dependency 和 `dsh.profile.bundles`；不要把它与 profile 自己的 patch 文件混为一谈。
- `lib/`：构建产物，始终由生成器重建，不直接编辑，也不提交。
- `tests/`：按上述分层覆盖协议、安全、生命周期、编辑器和发布安装。

跨 Host 与 editor 使用的数据只在 `src/core/` 定义。不要在两端复制 endpoint、错误联合、scene 字段或限制常量。

## 产品与数据不变量

- Agent 只生成紧凑的 `DiagramSpec`；确定性布局把它转换成初始 Excalidraw scene。不要让模型直接生成完整 Excalidraw JSON。
- `DiagramSpec.edges` 是 `from -> to` 的有向边。节点、分组 id 必须唯一，边端点和 group 引用必须存在。
- scene 一旦产生就是用户当前文档；`sourceSpec` 只记录生成来源。重新布局或读取不得覆盖用户编辑后的 scene。
- 每条记录同时保存 `sessionId` 和 `{createdAt, cwd}`。只比较 Session id 会在 id 重用后泄漏旧生命周期的数据。
- 未归属当前 Session lifecycle 的 diagram 必须与不存在相同地返回 `diagram-not-found`。
- 保存使用整 scene compare-and-set：必须先校验 `expectedRevision`。只有 scene 实质变化才生成新的不透明 UUID revision；相同 scene 返回 `unchanged: true` 并保留 revision，过期 revision 即使内容相同也必须冲突。冲突返回 Host 当前记录，绝不静默覆盖。
- 自动保存不写 Session log。只有显式调用 `diagram_read` 后，当前 scene 的受限摘要才通过普通 Tool Result 进入模型上下文。
- Session fork/export 不复制 sidecar；卸载插件不删除 sidecar。改变这些行为属于新的产品和数据迁移设计。
- 所有部署相关限制必须由 `DiagramConfig` 和 `cordis.patch.yml` 显式给出，不能在调用路径中藏默认值。
- 总记录数、单 Session 数和 canonical UTF-8 总字节预算必须共同生效。不要只限制每个 scene 而忽略持久化总量。

## Host、生命周期与 DSH 集成

- 普通插件工作不得修改 DeepSeek Harness 源码。发现 DSH API 缺口时，先记录上游需求；插件仍以当前公开 DSH 版本为发布目标。
- 当前支持 DSH `0.1.0-rc.6`。升级时同时更新 peerDependencies、devDependencies、README 徽章和兼容表、`build/smoke-dsh-install.mjs` 中的版本及真实安装测试。
- 不要对 DSH Service class 使用跨包 `instanceof`。DSH 的 source launch 和已构建 npm artifact 可能加载同一 class 的两个模块实例，导致合法 service 被误判。依赖 Cordis `static inject` 等待服务，再通过 `ctx.get("serviceKey")` 取得结构化接口。
- 注册必须跟随 Cordis 生命周期。WebServer route 用 `ctx.effect()` 包装 disposer；`Tools.register()` 自己已经注册 effect，不要重复包装成嵌套 effect。
- 初始化顺序是：验证物理 bind、取得依赖、打开 storage-domain、注册关闭 effect、注册静态资源和 RPC、注册工具。失败时不得留下半注册入口。
- 插件只允许 `webServer.host === "127.0.0.1"`。不要把 `authority: loopback` 或 Host header 检查误当作 socket 级本机认证，也不要在没有完整鉴权设计时开放 `0.0.0.0`。
- Session 查询不得创建、恢复或改变 Session。当前 DSH persistence 缺少 typed absent lookup，因此 cold lookup 先读 snapshot catalog 再 inspect；不要通过匹配异常文本推断 not-found。
- catalog/inspect 是异步的，前后都要复核 live Session，防止查询期间 lifecycle 被替换。`diagram_create`/`diagram_read` 的 Session 只来自 `exec.agent.session.header`，不能接受模型提供的 session id。
- repository 对同一 diagram 串行化保存，对创建和全局字节预算分别串行化；dispose 先关闭新写入，再等待已接纳写入完成。

## RPC 与静态资源安全

- `/diagram` 必须继续使用 `src/host/http-rpc.ts` 的专用有界 HTTP carrier。不要换回 `ctx.connection.rpc.handle()`：通用 bridge 会在业务 schema 之前缓冲远大于 1 MiB 的请求。
- HTTP body 上限是 `maxSceneBytes + 16 KiB` envelope allowance。`Content-Length` 和实际流入字节都要在 `JSON.parse` 前检查，超限返回 `413` 并关闭请求。
- 保持 Host、Origin、`Sec-Fetch-Site`、method、media type、URL endpoint 和 message method 的一致性检查。重复 Host、userinfo、path、跨站 Origin 和超长 `rpcId` 必须拒绝。
- Wire 外层使用 DSH 的标准 `client-request` / `server-response` envelope；list/get/save 的业务结果使用 `src/core/rpc.ts` 的严格联合。预期业务失败是返回值，不要 throw 成不透明 prose。
- Host 既校验请求，也校验业务实现返回值；Client 校验 envelope、响应 `rpcId` 和严格业务结果。Client 必须先通过 `list` 取得 Host 的 validation policy，再用同一 policy 解析 get/save。transport failure 与业务失败不得折叠成同一状态。
- 意外异常只写 Host logger；响应不能反射内部异常、文件路径或 storage 细节。
- `/diagram-assets` 只允许 `GET`/`HEAD`、MIME 白名单和 canonical realpath 内的文件。入口 `no-store`，带内容哈希的资源 immutable；CSP、same-origin、no-sniff 和 frame-ancestors 不能被弱化。
- iframe 只是加载边界，不是安全隔离边界。其安全性依赖同源、CSP、静态路径限制、RPC admission、scene 校验和 Session ownership 的组合。

## Scene 校验

- wire、sessionStorage 和 durable storage 都是不可信输入，必须使用同一 policy 创建的 runtime schema。
- 在递归 schema 前保留迭代 JSON 检查；它限制深度、值数量、UTF-8 字节、有限数值、plain object/array、accessor、alias 和 cycle。不要用纯递归 Zod 替代，否则深层输入会产生栈溢出。
- 只持久化 rectangle、diamond、ellipse、line、arrow、freedraw 和 text。image、iframe、embeddable、外部 link、非空 files 和 frame ownership 仍在首版范围外。
- `appState` 只保留明确白名单字段。不要持久化光标、选区、viewport 或其他瞬时 editor 状态。
- 颜色只接受受控 hex/transparent，坐标、尺寸、角度、stroke、font、points、引用数和文字都有独立上限。不能用一个宽泛 JSON 数值上限代替 renderer 实际字段限制。
- binding、container 和 boundElements 引用必须指向 scene 内有效元素。放宽 scene 字段时同时验证 Excalidraw 渲染、SVG/PNG 导出和引用完整性。
- Excalidraw 活数据在保存和导出前都经 `normalizeEditorScene`：移除 tombstone、白名单化 appState、清空 files，再执行完整 schema；Host 仍需二次验证。首版只支持受控导出，不开放直接导入和内建 load/save/image 能力。
- 安全限制是协议常量；部署容量和内容长度是 `DiagramConfig`。不要为了让测试数据通过而混淆二者。

## Client 与 editor 构建

- `lib/client.js` 必须保持为轻量、单文件、lazy-CJS 的 DSH 注册入口。`src/client/**` 不得 import Excalidraw 或其全局 CSS。
- Excalidraw 通过 `/diagram-assets/index.html` 的同源 iframe 按需加载。Vite editor 可以拥有自己的 dynamic chunks、全局 CSS 和字体；DSH Client 模块服务器不能可靠承载这些资源。
- 不要尝试把 Excalidraw 直接交给普通 DSH `clientBundle()`：它会产生大量 dynamic imports，且全局 `index.css` 不属于 CSS Module 处理范围。`React.lazy` 只延迟挂载，不能减少已经进入单个 client asset 的下载体积。
- `build/client-bundle.ts` 只允许列出的 DSH platform externals，并内联 Client CSS Module。新增运行时 DSH import 时同时更新 peerDependency、devDependency、`dsh.client.inject` 或 purity allowlist；不要靠偶然的本机解析。
- editor 使用 `base: "./"`，字体由 `build/copy-excalidraw-fonts.mjs` 自托管。不要引入 CDN，严格 CSP 下也不要用 `unsafe-eval` 消除字体 fallback 日志。
- sourcemap 保持关闭，npm `files` 继续排除 `lib/**/*.map`。构建后检查 bundle 不包含本机绝对路径；曾经的 virtual module region 注释会泄漏 `/Users/...` checkout 路径，minify 是当前消除路径的组成部分。
- editor 较大是已知成本；聊天首屏只下载小型 Client entry。优化体积时必须以网络资源和真实启动为证据，不能删除字体许可或把 Excalidraw重新塞回 Client entry。
- core layout 的边点是绝对坐标，Excalidraw `points` 是相对元素起点。转换时令 arrow `x/y` 等于首个绝对点，再让每个 point 减去起点，并保持稳定 `edge-N` id 和 `node:*` binding；禁止直接混用两种坐标。
- 布局必须确定且保持输入顺序：flow 与无分组 architecture 为 Dagre LR，带分组的 architecture 使用等宽分区带状布局（组按输入顺序纵向堆叠、未分组节点为首个无容器带、行在共享内容宽度内居中换行、容器框由布局显式给出），hierarchy 为 TB，Dagre 使用 named multigraph 保留并行边；所有节点、边和分组统一经过 normalize、边界偏移和舍入。不能依赖 Dagre 返回顺序重排持久 id。
- Host 在 init 时通过 `ctx.skills.register()` 注册 `canvas-diagram` 运行时 skill（模型与用户双向可调用），这是中文泛化提示路由到 `diagram_create` 的机制，也是输入框 `/` 命令的入口；disposer 由 `ctx.effect` 持有，`skills` 在 `static inject` 中为必需服务。删除该注册会让泛化图表请求重新流向工作区 skill。

## 对话流内嵌预览（chat preview）

- 预览身份链路是：`diagram_create` 的 `output.presentationMeta` 把 `{diagramId, revision, title, kind}` 写入持久化 `tool/result.meta`（`src/core/diagram-kinds.ts` 是唯一契约），Client 端 `ConversationNodeDefinition` match 该事件生成 `dsh-diagram-preview` chat node，卡片内挂载 `/diagram-assets/preview.html?sessionId&diagramId` 同源 iframe。不要为预览发明自定义 Session 事件：DSH persistence 的 `KNOWN_SESSION_EVENT_TYPES` 白名单会拒绝未知事件类型的日志。
- `src/core/diagram-kinds.ts` 必须保持零运行时依赖（`DIAGRAM_KINDS` 单一事实源从 contracts 移到这里并 re-export）。client bundle 会内联它触达的一切；经它引入 zod 会破坏轻量 Client entry。
- Client 端 match 只接受 `event.type === "tool/result"` 且 `event.surfaceOp === "append"` 且 meta 解析成功的事件：replace 投影可能重复同一 diagramId，而每个 `(kind, id)` 只允许一个 start。不能 import `isAppendSurfaceEvent` 等 DSH 运行时函数——client bundle purity 只允许 externals 列表内的运行时依赖，DSH 能力一律 type-only import 或走 Cordis service。
- 预览节点组件不注册 locale namespace，因此 props 类型必须 `Omit<ChatNodeViewProps, "t">`；`sessionId` 来自 session-scope 标准 props，不接受 node data 里的会话身份。
- 卡片“在画布中编辑”先把 `{sessionId, diagramId}` 写入 `src/core/canvas-link.ts` 的 one-shot sessionStorage deep link（editor 挂载时消费，选择优先级固定为 待恢复草稿 > deep link > 当前选中 > 列表第一张——草稿优先是数据安全约束，不得调换），再走 `src/client/canvas-tab.ts` 的受控 DOM 降级（查找 `role=tab` 文本“画布”并模拟点击，找不到必须静默返回 false，不得 throw）。这是已记录的上游 API 缺口：rc.6 无公开视图切换 API；DSH 提供正式 API 后替换,勿再新增其他 DOM 查询。标签文本与 `conversation.view` 注册的 label 同源，改名必须同步。
- `preview.html` 是独立 Vite 入口（`assets/preview.js`，rollup input `preview`），**不得 import Excalidraw、React 或任何 CSS**：有 scene 渲染 scene 的简化 SVG（`renderSceneSvg`），无 scene 用 `layoutDiagram` 渲染近似 SVG（`renderSpecSvg`），两条路径都走 DOM API 构建文本节点防注入。预览与编辑器共享 `src/editor/visual-style.ts`（无 Excalidraw 依赖的调色板与字号常量，从 scene.ts 移出）；改调色板只改这一处。
- 预览页必须先 `list` 后 `get`（拿 Host validation policy 再解析），fork 会话或已删除的 diagram 显示“不存在”占位——fork 不复制 sidecar，这是预期行为不是 bug。传输失败保留重试按钮。
- vite `entryFileNames` 必须保持 `index → assets/editor.js` 的稳定命名；smoke 和 Host 静态入口依赖它。

## 自动保存和 React 交互

- 内容判等保留完整 `JSON.stringify(scene)` 字符串，不得改回 32-bit hash。真实 FNV 碰撞曾让第二次合法编辑被静默跳过。
- autosave 保持单飞；每次 flush 固定捕获 scene、serialized 和 expectedRevision。保存期间出现的新编辑只能保留为较新的 pending，旧响应只能清理自己确认的精确 scene。
- CAS conflict、transport error、validation error 和 storage capacity 是不同状态。冲突和失败必须保留 local draft，并提供导出或显式 reload；不能自动以服务器内容覆盖。
- `pagehide` 和 diagram 切换时同步把最后一份合法 scene、diagram id 和 expected revision 写入当前 tab 的 `sessionStorage`。重新挂载后先显示草稿，再使用原 revision CAS。
- 只有对应 identity、revision 和精确 scene 已确认保存后才能清 pending draft。过期响应不能清除或回滚较新的选中 diagram。
- 当前 scene 变为非法时停止保存但保留最后一份合法 pending draft；恢复成合法内容后重新排队。
- 保存状态发布必须做语义去重。Excalidraw 可能在父组件每次 render 后再次触发相同 `onChange`；重复发布 `saved` 对象会形成 React maximum update depth 循环。
- 不能依赖异步 React cleanup 完成最后一次网络写入。iframe 在“对话/画布”切换时会被直接销毁，普通 fetch 可能取消；`sessionStorage` pending draft 是该生命周期的恢复保障。
- Excalidraw `onChange` 只进入 autosave，不能把活 scene 回写到 React `initialData`。显式替换画布时递增 `sceneEpoch` 重挂载；异步 get/save/status 还要同时检查 AbortSignal 和 selection epoch，避免旧 diagram 响应污染新选择。

## UI 与浏览器验收

- 画布空间优先于插件 chrome。标题、导出按钮和 diagram 列表的字号不得超过 DSH 同级控件；桌面 diagram 侧栏必须可折叠，窄屏使用 selector。
- editor shell 是三行 grid；`.body` 必须显式位于第三行。依赖自动 placement 会让空状态行占据剩余高度，导致画布只得到约一百像素。
- 从 iframe root 到 Excalidraw 容器的 `min-height: 0` 链必须完整；折叠 diagram 侧栏只改变外层布局，不能重挂载或重载画布。
- DSH 外层使用已有 CSS variables；iframe 内先读取同名变量并提供中性 fallback。不要增加第二套设计系统。
- 视觉改动不能只跑 jsdom。至少用真实 DSH Web 检查标签、iframe 高度、侧栏折叠、导出按钮、空状态、窄屏和浏览器 console。
- 截图或演示 GIF 必须使用无隐私的通用 Session，不得暴露用户工作区、历史会话、API key 或本机路径。

## 已踩过且不得回归的问题

1. source DSH 与 built plugin 的 class identity 不同；跨包 `instanceof SessionStore` 会让真实安装启动失败。
2. 通用 Connection RPC bridge 在 plugin scene 校验之前允许约 160 MiB body；业务层 1 MiB 限制不能保护预解析内存。
3. 直接打包 Excalidraw 到 DSH Client entry 会产生大量 chunks、全局 CSS 处理缺口和约 10 MiB 的每次启动下载。
4. sourcemap 或 bundle region 注释会把绝对开发路径带进 npm tarball。
5. 只运行 `pnpm audit --prod` 看不到已经内嵌到 editor、但声明在 devDependencies 的 Excalidraw 依赖树。
6. 32-bit scene hash 会碰撞并静默丢编辑；精确序列化判等的内存成本在 1 MiB scene 上可控。
7. 只在 unmount 中 `void dispose()` 无法保证 iframe 销毁前完成 fetch；必须有同步 pending draft。
8. 未去重的 `saved` 状态会和 Excalidraw 的 `onChange` echo 构成无限 render。
9. CSS Grid 自动 placement 在空 notice 行下会把 canvas body 放错行；布局测试必须断言显式 row。
10. 同一 `file:` spec 和相同版本会被 pnpm profile lock/cache 复用；真实安装修复必须提升版本或明确刷新隔离 profile，不能看到源码已改就假定已安装产物已变。
11. README 提前声称尚未发布的 npm/tag/Release 会制造 404；发布完成前必须分别核 registry、tag、asset 和渲染页面。

## 测试与验证

开发中先跑最窄测试：

```sh
# core schema、布局与共享 RPC
pnpm exec vitest run tests/core-contracts.spec.ts tests/core-layout.spec.ts tests/core-rpc.spec.ts

# Host、存储、工具、HTTP 和静态资源
pnpm exec vitest run tests/host-store.spec.ts tests/host-rpc.spec.ts tests/host-http-rpc.spec.ts tests/host-static.spec.ts tests/host-service.spec.ts tests/tool-diagram.spec.ts

# DSH Client、editor、保存、恢复与导出
pnpm exec vitest run tests/client-view.spec.tsx tests/editor-app.spec.tsx tests/editor-autosave.spec.tsx tests/editor-pending-draft.spec.tsx tests/editor-rpc.spec.tsx tests/editor-scene.spec.tsx tests/editor-export.spec.tsx tests/editor-assets.spec.ts
```

提交前至少运行：

```sh
pnpm run typecheck
pnpm run test
git diff --check
```

涉及 bundle、依赖、安装、Host 入口、editor 资源或发布时再运行：

```sh
pnpm audit --prod
pnpm audit
pnpm run bundle
DSH_DIAGRAM_VERSION="$(node -p "require('./package.json').version")"
DSH_RELEASE_DIR="$(mktemp -d)"
npm pack --ignore-scripts --json --pack-destination "$DSH_RELEASE_DIR"
DSH_DIAGRAM_TARBALL="$DSH_RELEASE_DIR/dsh-diagram-$DSH_DIAGRAM_VERSION.tgz"
pnpm run smoke:dsh-install -- --tarball "$DSH_DIAGRAM_TARBALL"
shasum -a 256 "$DSH_DIAGRAM_TARBALL"
```

`smoke:dsh-install` 是发布门禁，不是普通单元测试的替代品。传入最终 tarball 时，它在隔离的 HOME/DSH_HOME 中安装公开 DSH 和该 artifact，启动 Web，检查 boot、Client、editor CSP、RPC body cap，再卸载并确认入口消失；它不读取或修改相邻的 DSH 源码 checkout。无 `--tarball` 时 smoke 会重新 bundle 和 pack，因此发布验证必须显式传入唯一 artifact。涉及可见 UI 时还要做真实浏览器验收。

构建后额外检查：

```sh
test ! -e lib/client.js.map
test ! -e lib/index.js.map
! rg -n '/Users/|/home/[^/]+/' lib README.md README.zh-CN.md THIRD_PARTY_NOTICES.md
! tar -tzf "$DSH_DIAGRAM_TARBALL" | rg '(^|/)(src|tests|build|node_modules)/|\.map$|\.env'
```

后两条命令以“无匹配”为成功；按需排除 README 中有意出现的通用占位路径，不能忽略 `lib/` 或 tarball 内的真实 checkout 路径。

## 依赖与许可证

- Excalidraw 和 React 在构建期使用，但 editor JS、字体和 transitive code 会进入发布包。因此完整 `pnpm audit` 与生产依赖审计都必须为零。
- `pnpm.overrides` 中的安全升级有实际发布原因。删除 override 前确认 lockfile 中旧版本已消失，并重新运行完整审计和 editor 测试。
- 依赖变化后运行完整 `pnpm run bundle`，让 `build/generate-third-party-notices.mjs` 重建 `THIRD_PARTY_NOTICES.md` 和 `third_party_licenses/npm/`。不要手工修生成文件。
- 生成器必须 fail loud：缺 license、空 license、未知例外或 checkout path 泄漏都应阻断构建。
- 发布包约 16 MiB 主要来自自托管 editor、字体和许可证；Git 仓库本身很小。减包时先证明资源未被使用，不得通过删许可文件或改用外部 CDN 达成。

## 发布流程

1. 确认工作树只包含本次文件，设置并核验 GitHub 身份：

   ```sh
   git config user.name huajuan404
   git config user.email 258429709+huajuan404@users.noreply.github.com
   gh api user --jq '{login,id}'
   npm whoami
   ```

2. 提升 `package.json` version，并同步 README 双语兼容表、固定版本 URL、构建示例和 DESIGN release surface。DSH 版本变化时同步所有 peer/dev dependency 与 smoke 常量。
3. 运行完整测试、双重 audit 和 bundle，然后只 pack 一次。把该 tarball 显式传给 smoke。公开包必须是预构建、无安装期执行的 artifact；当前 smoke 会拒绝 `build`、`preinstall`、`install`、`postinstall`、`prepare` 和 `prepack`。不要增加其他 npm lifecycle 自动化；如果确有必要，先更新发布设计和 tarball 门禁。
4. 检查 `package.json.files` allowlist。tarball 可以包含 `lib/`、bundle patch、双语 README、DESIGN、LICENSE、第三方 notices；不得包含源码、测试、build scripts、lockfile、sourcemap、环境文件或 node_modules。
5. smoke 通过后对同一 tarball 计算 `shasum -a 256`。从 pack 到 npm publish 和 GitHub Release 之间不要重新构建。
6. 提交并推送 release commit；commit author/committer 必须是 huajuan404。创建指向该 commit 的 `vX.Y.Z` tag。当前 release tags 是 lightweight、commit 未签名；只能核验 tag ref、commit SHA 和 author/committer，不能声称 tag 已签名。
7. 用最终 tarball 发布 npm，再把同一字节文件和 `.sha256` 上传到 GitHub Release。不要分别重新 pack。
8. 下载两个公开来源并比较 SHA-256；确认 `npm view dsh-diagram@latest`、GitHub latest Release、tag SHA 和 `origin/master` 一致。
9. 从公开 npm `@latest` 建全新隔离 profile，真实执行 add、dump-config、update、Web 启动、浏览器加载和 remove。不能用本地 `lib/` 或旧 profile 代替。
10. npm 默认页面可能短暂缓存旧 README；registry metadata 和 `/package/dsh-diagram/v/X.Y.Z` 是版本发布后的确定性检查入口。GitHub CDN 偶发 TLS reset 时用 `gh release download` 复核 asset，网络错误不能被误诊为包错误。

仓库当前没有 GitHub Actions workflow；push tag 不会自动 publish npm、生成 Release 或上传 checksum。上述动作都是显式人工步骤，不能因为 tag 存在就报告发布完成。

## 商店发现与文档

- 商店扫描的主键是 GitHub topic `dsh-plugin`；`dsh-bundle` 和 `package.json.dsh.bundle.patch` 是 bundle 识别补充。不得删除。
- 当前相关 topics：`deepseek-harness`、`dsh`、`dsh-plugin`、`dsh-bundle`、`canvas`、`diagram`、`diagram-editor`、`excalidraw`、`flowchart`、`visualization`、`web-ui`。不要为了搜索曝光添加与实际能力无关的 topics。
- curated 目录入口是 `awesome-dsh-plugin/awesome-dsh-plugin`；新增大版本后检查现有条目仍准确，不要重复提交。
- GitHub topic 查询和 curated 目录条目是已验证的发现入口。npm registry 可安装不等于 npm 搜索已收录；`npm search` 可能延迟或不返回新包，报告商店覆盖时分别核验，不要合并成一个“已收录”结论。
- README 默认英文并提供完整中文镜像。功能、版本、限制、安装、更新、卸载、安全与 FAQ 的语义必须同步。
- README 第一屏保留一句具体价值、npm/Release/License/DSH 徽章、真实 GIF 和最短安装入口。不要用“AI-powered”等不可验证描述替代行为。
- 插件不会抓取文章，也不会向任意网站注入 UI；文章必须先进入 DSH Session。不要在文案中扩大能力范围。
- demo GIF 存放在 GitHub `assets` 分支，不把生成媒体塞进 master 历史。更新 GIF 时继续使用去隐私的真实运行画面。

## 完成标准

只有同时满足以下条件才可以报告完成：

- focused tests 和风险对应的完整门禁通过；可见 UI 已在真实 DSH Web 验收。
- public tarball 可在隔离 profile 安装、启动和卸载；不是只从源码运行成功。
- DSH 源码 checkout 的基线状态未变化。
- npm 包无安装生命周期脚本，无源码、环境文件、sourcemap、绝对路径或未授权许可证缺口。
- README、npm、GitHub tag、Release asset、checksum 和 topics 指向同一个实际版本。
- 当前任务文件精确提交，工作树干净，远端 commit 身份正确。

需要证明 DSH checkout 零改动时，在插件操作前后把 `git -C "$dsh_checkout" status --porcelain=v2 --untracked-files=all` 输出保存到 repo 外的两个临时文件并用 `cmp` 比较。不要通过清理、checkout 或 reset 制造“干净”结果；已有用户改动必须保持原样。
