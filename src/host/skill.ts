import type { SkillRegistration } from "@deepseek-ai/dsh-skill";

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
    "",
    "## 步骤",
    "",
    "1. 从当前会话上下文取得文章内容；如果尚未读取，先用文件或 Web 工具读入。",
    "2. 先做事实门禁：只使用当前上下文可直接支持的实体、关系、数字、日期和结论；"
    + "不得为了凑数量补造事实。保留原文中的限定词和不确定性，不把建议写成现状。",
    "3. 选择能表达主导关系的 kind：",
    "   - `report`：事实盘点、评估报告、方案全景或同时包含背景、多个主题面和结论的长文；",
    "   - `architecture`：组件、分层、边界和依赖；`flow`：有顺序的动作与决策；",
    "   - `timeline`：时间事件；`hierarchy`：上下级；`comparison`：并列维度；"
    + "`relationship`：非线性关联。",
    "4. 提取语义而不是设计坐标，再调用 `diagram_create`：",
    "   - 节点和分组的 id 用简短 ASCII（如 `cause`、`treat`），中文放在 label。",
    "   - title 概括主题，summary 写原文支持的核心判断；label 尽量一行，数字、证据和限定放 detail。",
    "   - edges 严格表示 `from -> to`；原文没有方向时不要强造因果。节点和分组数量随事实量变化。",
    "   - report 用 group.placement 表达阅读区域：`top` 放跨域背景/治理，`main` 放主体阶段或主题面，"
    + "`bottom` 放原文明确给出的结论/目标；用 direction 选择 `row` 或 `column`。",
    "   - tone 只表达稳定语义：`definition` 定义/资产，`execution` 当前执行，`external` 外部运行，"
    + "`evidence` 证据，`risk` 缺口/风险，`target` 目标，`neutral` 中性。不要用颜色替代文字。",
    "   - variant 用 `compact` 表达短指标/标签，用 `solid` 表达唯一焦点结果，其余使用 `card` 或省略。",
    "   - 信息不足或关系不明确时，生成更小但忠实的图，并在 summary 说明边界；"
    + "输入互相矛盾时保留冲突，不自行裁决。",
    "5. 完成后告诉用户：打开会话顶部的“画布”标签即可编辑，支持导出"
    + " .excalidraw/SVG/PNG；如需让你读取用户的手工修改，调用 `diagram_read`。",
    "",
    "## 禁止",
    "",
    "- 不要为本请求写 SVG、Mermaid 或 HTML 文件到工作区。",
    "- 不要自己发明 Excalidraw JSON；只通过 `diagram_create` 提交语义化 spec。",
  ].join("\n"),
};
