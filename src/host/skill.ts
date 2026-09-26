import type { SkillRegistration } from "@deepseek-ai/dsh-skill";

/** Shared by the optional skill and the always-visible creation tool. */
export const DIAGRAM_COMPOSITION_GUIDANCE =
  "先确定读者需要理解的关系，再选图型；不要把目录或段落搬进方框。"
  + "长文先做一张主图，只为主图无法表达的独立问题增加互补视图，不按章节批量出图。"
  + "节点是一项实体、动作、条件或结果：label 用短语，detail 只补一条必要限定或证据；不要塞完整段落。"
  + "来源、时间、统计口径与未验证边界必须保留在对应结论附近；简洁不能改变原意。"
  + "箭头只表达明确的关系与方向；供给、包含、并列、约束、反馈不可互相替代。"
  + "图型由主导关系决定：流程保留分支与回路，架构突出连接和边界，对比按共同维度组织；不要全部使用 report。"
  + "完整分类树可用 hierarchy + composition: atlas，仅支持一个根、分类、末级条目三级；不得删除交叉关系来套用。"
  + "默认 clean，图标仅用于有助识别的概念；不要用装饰、缩小字号或增加图数掩盖结构问题。";

/**
 * Model- and user-invocable routing entry for the diagram tools.
 *
 * Registered at Host init so generic diagram requests ("画一张架构图") route
 * to diagram_create instead of workspace skills that write SVG or Mermaid
 * files, and so users can trigger the canvas explicitly by typing `/` in the
 * composer without remembering the English tool name.
 */
export const CANVAS_DIAGRAM_SKILL: SkillRegistration = {
  name: "canvas-diagram",
  description:
    "把当前会话中的文章或讨论生成为可编辑的画布图表（报告图、架构图、流程图、时间线、层级图、对比图、关系图），生成后在会话顶部的“画布”标签里直接拖拽编辑和导出。"
    + "Use when the user asks to 生成图表/架构图/流程图/画成图/可视化 an article, or wants an"
    + " editable canvas diagram instead of a static image or SVG file.",
  whenToUse:
    "用户要求把文章、讨论或结构化内容变成图表，且希望结果可继续编辑时使用。"
    + "Prefer this over workspace skills that write standalone SVG/Mermaid files.",
  source: "bundled",
  content: [
    "# 画布图表（canvas-diagram）",
    "",
    "把读者需要判断的关系变成可编辑的 Excalidraw 画布。不要用方框包住文章代替可视化。",
    DIAGRAM_COMPOSITION_GUIDANCE,
    "",
    "## 1. 读懂并核对关系，暂不画图",
    "从当前会话取得完整来源；文件尚未读取时先读取。PDF中的关系图必须直接看原图，OCR不足以确定箭头和分组。",
    "先用简短文字确定：这份材料的主要判断、支持判断的证据、必须保留的限定、读者下一步需要理解什么。",
    "对准备画的每条关系核对：两端实体、方向、关系含义、来源位置；区分原文明说与自己的综合。",
    "列出会使结论失真的反例：把建议当现状、个案数字当普遍规律、章节顺序当执行顺序、包含当因果、治理当最后一步。",
    "例如：原文说执行前先检查，必须画 检查→[通过]→执行，不能画 执行→检查 再用边标签‘执行前检查’补救。",
    "又如：Agent解释证据，门控系统验收并聚合，发布系统终检后执行。这是不同职责，不能合成一个‘智能安全’节点。",
    "信息不足或关系不明确时如实标明，保留冲突；不得为了凑数量补造事实。",
    "",
    "## 2. 规划读法，而不是逐章摘要",
    "先设计一张能独立讲清主张的主图。只有读者确实需要展开一个独立机制或场景时，再增加互补图。",
    "完整材料的覆盖不等于每段都画；说明哪些主线已覆盖、哪些实现细节留在来源中。不要反复绘制相同观点。",
    "为每张图选择主导关系：",
    "- `flow`：动作、条件分支、反馈回路；节点按主路径排列，其他分支接在真实发生处。不能把案例或对照放进主路径。",
    "- `architecture`：组件的供给、调用、约束及边界；只有原文存在层次才分层。少量组件网络可不分组，避免把全部组件串成竖向分区。",
    "- `comparison`：先确定共同的比较维度，再组织每个对象的同一维度；不要一边放阶段、一边放实现路线。无法共享维度时用关系图或分别表达。",
    "- `hierarchy`：真正的上下级或分类；`relationship`：非线性关联；`timeline`：时间事件。",
    "- `report`：需要并列核对事实、证据、缺口和结论的评估板；不是文章通用容器。主体主题分别放 main 分组，避免一个 main 列里堆满所有主题。",
    "主图与细节图使用相同概念名称；只共享真实的分类维度，不为整齐强制所有视图使用同一横轴。",
    "",
    "## 3. 提交紧凑的语义 spec",
    "只调用 `diagram_create`，不设计坐标，不自己发明 Excalidraw JSON。",
    "- id 使用简短 ASCII，中文放在 label。",
    "- title 用一句有来源支持的判断，避免重复主标题或把无范围统计写成普遍结论。summary 简短交代范围、来源和边界。",
    "- 一个节点只承担一个实体、动作、条件或结果。label 优先用6–18个汉字的短语；detail 通常一行、最多两条短句，只放理解当前节点不可缺少的内容。",
    "- 不把背景、机制、案例数字、局限全塞进同一个 detail。能用关系表达的内容改成关系；对主问题无影响的细节留在原文，不建立重复说明节点。",
    "- 这不是截断文字：不得为了字少删掉否定词、必要条件、样本范围、来源或不确定性。某节点仍需长段落才能说明时，重新选择主问题或拆出有意义的局部图。",
    "- edges 严格表示 `from -> to`。label 只写区分关系的短语；必要的分支条件贴在相应边上，无方向关系不强造因果。",
    "- 同一条主路径按阅读顺序提交节点。不要把补充说明插进主路径，导致折行后看起来像必经步骤。",
    "- report 的 group.placement：`top` 仅用于必要跨域背景，`main` 放并列主题，`bottom` 放结论或限制；direction 指定 `row` 或 `column`。",
    "- tone：`definition` 资产/定义、`execution` 执行、`external` 外部运行、`evidence` 证据、`risk` 风险、`target` 目标。不要为了颜色把所有节点标为风险。",
    "- variant：短指标/标签用 `compact`，唯一焦点结果用 `solid`，其他用 `card`。",
    "- 默认 visualStyle 为 clean；用户明确要求手绘白板时用 `sketchnote`。icon 仅使用受控枚举，不要给每个节点都加图标，也不能用图标替代文字。",
    "- 完整分类树可用 `hierarchy` + `composition: atlas`，自动形成分类总览与完整明细。仅用于无分组、无循环、无多父节点的根→分类→条目；不为套用删除关系，不手写计数。",
    "",
    "## 4. 对抗检查后再交付",
    "逐条核对每一根箭头是否与节点文字一致，检查动作前置条件、门控、反馈是否被画反或漏掉。",
    "检查哪些实体是并列的、哪些约束横跨多个组件；不能由图的空间位置新增父子或先后关系。",
    "把自己当成没读原文的读者：能否先看出主张，再沿关系解释它？如果必须逐段阅读所有 detail 才能理解，这张图仍需重组。",
    "只做语义检查不能宣称视觉通过。有真实画布/导出预览工具时查看成品，检查边标签遮挡、过长单列、正常字号下是否可读；不要仅凭创建成功宣称好看。",
    "最后用一句话说明主结论，指向会话顶部‘画布’及 .excalidraw/SVG/PNG 导出。不要重复输出 ASCII 或 Mermaid。",
    "用户手改后使用 `diagram_read` 读取当前画布；不要用旧 sourceSpec 覆盖用户编辑。",
    "",
    "## 禁止",
    "- 不要为本请求写 SVG、Mermaid 或 HTML 文件到工作区。",
    "- 不要用删去条件、缩小字号、段落搬运、重复图表或装饰图标换取表面完整。",
    "- 不要把规则、审批、业务证据判断、真实执行混成一个自动化黑箱。",
  ].join("\n"),
};
