# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-08-14
- Primary product surfaces: DeepSeek Harness Web 的会话“画布”标签页，以及 `diagram_create` 的标准工具结果卡片。
- Evidence reviewed: 本地 `http://127.0.0.1:3080`；deepseek-harness 的 `packages/client/ui-conversation/src/client/contract/slots.ts`、`packages/client/ui-trajectory/src/client/index.ts`、`packages/client/ui-tool/src/client/contract/slots.ts`、`packages/client/AGENTS.md`；`cathrynlavery/diagram-design`；Excalidraw；社区 `dsh-web-ui`、`dsh-TUI` 与 `modlens` 插件。

## Brand

- Personality: 清晰、克制、可编辑，优先表达文章中的关系和论点，不追求装饰性复杂度。
- Trust signals: 保存状态和 revision 可见；冲突不静默覆盖；导出格式明确；生成内容始终可手工修订。
- Avoid: 渐变、装饰性插画、过度拥挤、随机配色、DOM 布局 hack、不可编辑的静态图作为权威数据。

## Product goals

- Goals: 用户能让当前 Agent 为已进入上下文的文章生成一张结构清晰的 diagram，在 DSH 页面直接编辑，并在刷新后继续编辑或导出。
- Non-goals: 任意网站页面注入、文章采集器、多人实时协作、CRDT、动画、Mermaid 导入、插件内部第二次 LLM 调用、自动写入文章仓库、随 Session export 自动携带插件数据、fork 自动复制 diagram。
- Success signals: Agent 成功创建 diagram；用户能修改文字、节点和连线；自动保存后刷新内容不丢失；并发 revision 冲突会阻止覆盖；可导出 `.excalidraw`、SVG 和 PNG。

## Personas and jobs

- Primary personas: 使用 DSH 写作技术文章、方案文档和内部分享材料的个人开发者。
- User jobs: 从当前对话、本地文章或 Agent 已读取的 URL 内容中提炼一张主图；在生成后快速修正文案和布局；获得可继续编辑和可发布的文件。
- Key contexts of use: 绑定 `127.0.0.1` 的本地单用户 DSH Web，会话与 workspace 已由 DSH 确定，桌面浏览器为主要编辑环境；首版不支持 `0.0.0.0` 局域网服务。

## Information architecture

- Primary navigation: 在 DSH 会话中央现有标签组中新增“画布”；不新增前端路由，也不替换 conversation 根视图。
- Core routes/screens: 无独立路由；画布标签包含当前会话 diagram 列表、选中 diagram 的编辑器和导出操作。
- Content hierarchy: 当前 diagram 标题与保存状态优先，其次是画布；diagram 列表和导出操作保持次级。

## Design principles

- Semantic first: Agent 生成紧凑的 `DiagramSpec`，确定性编译器负责布局和 Excalidraw 元素，避免让模型直接生成脆弱的编辑器 JSON。
- Editing is authoritative: Excalidraw scene 是保存和导出的权威文档；原始 `DiagramSpec` 只记录生成来源，不在手工编辑后覆盖 scene，也不作为 `diagram_read` 的当前内容。
- Explicit model handoff: 手工修改不会自动进入模型上下文；只有用户要求 Agent 读取当前 diagram 时，`diagram_read` 才从当前 scene 派生受限的文字、图形和连线摘要，并通过普通 Tool Result 记录该版本。
- Tradeoffs: 首版不改 DSH 核心，因此用户从工具结果进入编辑器时点击“画布”标签；不使用私有 store 或 DOM 查询模拟一键跳转。
- Loading boundary: DSH 目前只为一个 Client 插件提供单个 `client.js`，而 Excalidraw 需要动态资源。轻量 Client 仅注册标签页，选中标签后才由同包、同源 iframe 加载独立 editor 资源，避免把完整编辑器加入每次 Web 启动路径。
- Iframe trust: editor 与 DSH 同源并运行同一 bundle 的受信代码；iframe 不作为安全隔离边界。插件在加载时要求 WebServer 物理绑定 `127.0.0.1`，并由静态资源路径白名单、严格 CSP、插件自有的有界 RPC 路由、loopback Host/Origin 检查、Host 端 schema 校验、Session 生命周期指纹和 diagram 归属校验共同约束访问。

## Visual language

- Color: 插件外层控件只使用 DSH 现有 CSS 变量；生成的 diagram 使用白色背景、近黑文字、低饱和中性色和单一强调色。
- Typography: UI 继承 DSH 字体；diagram 默认使用 Excalidraw 可用的清晰无衬线字体，并限制节点文字长度。
- Spacing/layout rhythm: 外层控件沿用 DSH 的间距变量；diagram 保持中等信息密度、稳定留白和清晰分组。
- Shape/radius/elevation: 外层沿用 DSH 控件；diagram 采用低粗糙度矩形、圆角矩形、箭头和必要的分组边界。
- Motion: 只保留编辑器原生交互和短暂保存状态反馈；不添加装饰动画。
- Imagery/iconography: 复用 DSH 图标；不引入独立图标体系。

## Components

- Existing components to reuse: `conversation.view`、`tool.call.toolview`、DSH Client runtime hooks、CSS 变量和 Excalidraw React 组件。
- New/changed components: `DiagramView` iframe 容器、editor 内的 `DiagramList`、`DiagramCanvas`、`DiagramToolbar` 和保存冲突提示；工具结果使用 DSH 标准 generic card。
- Variants and states: 无 diagram、加载中、编辑中、保存中、已保存、保存失败、revision 冲突、只读恢复。
- Token/component ownership: DSH 拥有应用外层 token；Excalidraw 拥有画布交互；插件拥有 diagram 初始视觉规则和外层组件。

## Accessibility

- Target standard: 插件自有 UI 达到 WCAG 2.1 AA；Excalidraw 内部能力按其公开组件行为处理。
- Keyboard/focus behavior: 标签页、diagram 列表、保存与导出按钮可键盘访问；加载和冲突后焦点回到明确目标；不拦截 Excalidraw 编辑快捷键。
- Contrast/readability: 外层全部使用 DSH token；生成主题保证正文和连接标签在白色背景上可读。
- Screen-reader semantics: 保存状态使用状态语义；错误与冲突可被朗读；按钮使用中文可访问名称。
- Reduced motion and sensory considerations: 插件不添加必须依赖动画理解的反馈，并遵从系统 reduced-motion 设置。

## Responsive behavior

- Supported breakpoints/devices: 当前 DSH 支持的桌面浏览器是完整编辑目标；窄屏提供可用但不承诺高效的基础编辑。
- Layout adaptations: 宽屏显示 diagram 列表与画布；窄屏将列表收起为选择器，导出操作折叠但不隐藏保存状态。
- Touch/hover differences: 操作不能只依赖 hover；触摸行为交给 Excalidraw，插件按钮保持足够点击区域。

## Interaction states

- Loading: 保留画布区域尺寸并显示简洁加载状态；Excalidraw 代码按需加载。
- Empty: 说明需要在对话中让 Agent 创建 diagram，不提供与 Agent 流程重复的文章输入框。
- Error: 显示失败操作和可执行的重试；不把未保存内容替换成服务器版本。
- Success: 保存状态从“保存中”切换为“已保存”，不使用打断编辑的 toast。
- Disabled: 加载、导出构建或冲突处理中禁用相关操作，并说明原因。
- Offline/slow network, if applicable: 当前有效草稿保留在页面内，并在 `pagehide` 前同步写入当前浏览器标签的 `sessionStorage`；重挂载后使用原 expected revision 保存，冲突时保留本地稿并要求选择重新载入或导出。

## Content voice

- Tone: 简体中文、直接、具体，先说明当前状态和可执行动作。
- Terminology: 使用“画布”“diagram”“已保存”“保存失败”“版本冲突”；不把静态导出称为权威文档。
- Microcopy rules: 错误消息包含失败对象、原因和修正动作；避免“出错了”一类无操作信息。

## Implementation constraints

- Framework/styling system: DSH Client 插件、React、CSS Modules、DSH CSS 变量；Host、轻量 Client 与 Vite 构建的同源 editor 从同一 npm bundle 发布。iframe 是编辑器资源的按需加载边界，不是独立产品路由。
- Design-token constraints: DSH 标签容器使用现有 CSS 变量；iframe 文档无法继承父文档 token，因此编辑器 UI 先读取同名变量并提供中性字面 fallback。不引入 Tailwind 或第二套组件库。
- Performance constraints: Excalidraw 只在“画布”标签实际挂载后加载；聊天首屏和 DSH `client.js` 不包含画布依赖；自动保存需去抖并避免高频 durable session event。
- Compatibility constraints: DeepSeek Harness `0.1.0-rc.6`，Node `^22.19.0 || >=24.0.0`，ESM，外置 `dsh.bundle.patch` 安装；WebServer 必须绑定 `127.0.0.1`；Host/Client RPC 的输入和返回在不可信边界验证，请求在 JSON 解析前受字节上限约束；scene 拒绝可嵌入网页、外链和可执行内容，并限制序列化体积、元素数、单段文字长度及全域持久化字节数。
- Static delivery constraints: editor route 仅响应 `GET`/`HEAD`，只提供构建目录内的 MIME 白名单文件；路径逃逸和缺失文件返回 404，入口不缓存、带内容哈希的资源可长期缓存，插件卸载后整条路由消失。
- Test/screenshot expectations: 单元测试覆盖 `DiagramSpec` 验证、布局和 CAS；built-artifact smoke 覆盖 bundle exports；真实 DSH Web 验收覆盖生成、编辑、刷新、导出和冲突错误；产品可见输出增加 keyless snapshot 或记录缺失的外置插件 harness 支持。

## Release surface

- npm package: `dsh-diagram`
- GitHub repository: `hanzhangzzz/dsh-diagram`
- Discovery metadata: `dsh-plugin` topic and `dsh.bundle.patch`
