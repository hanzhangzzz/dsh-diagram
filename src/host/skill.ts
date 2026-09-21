import type { SkillRegistration } from "@deepseek-ai/dsh-skill";

/** Shared by the optional skill and the always-visible creation tool. */
export const DIAGRAM_COMPOSITION_GUIDANCE =
  "一张图只回答一个主要问题，标题优先表达原文支持的结论。"
  + "标题和摘要已经表达的信息，不重复建成占据整行的前提节点；只有独立背景才使用 top 区域。"
  + "默认 clean 优先用文字和结构，未要求图标时省略 icon；sketchnote 才侧重图标和手绘表达。"
  + "保留必要数字、分支和限定，删去重复解释，不通过缩小文字堆积信息。"
  + "图型由主导关系决定，不因文章长就自动选 report；完成后展示真实画布，不重复输出 ASCII 或 Mermaid。";

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
    "把文章内容变成可编辑的 Excalidraw 画布，而不是写死的 SVG/Mermaid 文件。",
    DIAGRAM_COMPOSITION_GUIDANCE,
    "",
    "## 步骤",
    "",
    "1. 从当前会话上下文取得文章内容；如果尚未读取，先用文件或 Web 工具读入。",
    "2. 先做事实门禁：只使用当前上下文可直接支持的实体、关系、数字、日期和结论；"
    + "不得为了凑数量补造事实。保留原文中的限定词和不确定性，不把建议写成现状。",
    "3. 先确定这张图要回答的一个主要问题，再选择能表达主导关系的 kind；不要因为文章长就默认做报告图：",
    "   - `report`：需要在同一张图中对照背景、证据、风险与结论的事实盘点或评估；",
    "   - `architecture`：组件、分层、边界和依赖；`flow`：有顺序的动作与决策；",
    "   - `timeline`：时间事件；`hierarchy`：上下级；`comparison`：并列维度；"
    + "`relationship`：非线性关联。",
    "4. 提取语义而不是设计坐标，再调用 `diagram_create`：",
    "   - 节点和分组的 id 用简短 ASCII（如 `cause`、`treat`），中文放在 label。",
    "   - title 优先表达原文支持的核心判断；没有明确判断时如实概括主题。summary 保留背景、范围和限定；label 尽量一行，数字、证据和限定放 detail。",
    "   - edges 严格表示 `from -> to`；原文没有方向时不要强造因果。节点和分组数量随事实量变化。",
    "   - report 用 group.placement 表达阅读区域：`top` 放跨域背景/治理，`main` 放主体阶段或主题面，"
    + "`bottom` 放原文明确给出的结论/目标；用 direction 选择 `row` 或 `column`。",
    "   - tone 只表达稳定语义：`definition` 定义/资产，`execution` 当前执行，`external` 外部运行，"
    + "`evidence` 证据，`risk` 缺口/风险，`target` 目标，`neutral` 中性。不要用颜色替代文字。",
    "   - variant 用 `compact` 表达短指标/标签，用 `solid` 表达唯一焦点结果，其余使用 `card` 或省略。",
    "   - 清晰风格使用统一的中性结构、深色结果和风险强调；不要为凑颜色给普通节点强加 tone。分组用标题和空间表达，不按数组顺序轮换颜色。",
    "   - 长流程按原文已有阶段分组，保持明确的阅读顺序；并列比较不要强行连成流程。省略重复解释，但不得丢掉数字、分支、反例和必要限定。",
    "   - 每条边都应有明确的关系依据；标签只写区分关系所需的短语，避免把整句说明塞到连线上。",
    "   - 用户明确要求手绘、白板、手帐或知识信息图风格时把 `visualStyle` 设置为 `sketchnote`；"
    + "否则省略 visualStyle，沿用清晰的 `clean` 风格。风格不改变事实和关系。",
    "   - `icon` 只从工具给出的受控枚举中选择，用于需要快速识别的关键概念；"
    + "不要给每个节点都加图标，也不要用图标代替 label。",
    "   - 信息不足或关系不明确时，生成更小但忠实的图，并在 summary 说明边界；"
    + "输入互相矛盾时保留冲突，不自行裁决。",
    "5. 提交前核对：是否只有一个主问题，最重要的结论是否明确，分支与限定是否保留，是否用不存在的事实填满版面。必要时减少重复节点，不通过缩小文字硬塞。",
    "6. 完成后用一句话说明图的主结论，再告诉用户：打开会话顶部的“画布”标签即可编辑，支持导出"
    + " .excalidraw/SVG/PNG；如需让你读取用户的手工修改，调用 `diagram_read`。",
    "",
    "## 禁止",
    "",
    "- 不要为本请求写 SVG、Mermaid 或 HTML 文件到工作区。",
    "- 不要自己发明 Excalidraw JSON；只通过 `diagram_create` 提交语义化 spec。",
    "- 成功创建画布后不要重复输出一份 ASCII 或 Mermaid 图；直接引导用户查看真实画布。",
  ].join("\n"),
};
