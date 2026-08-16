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
    "把当前会话中的文章或讨论生成为可编辑的画布图表（架构图、流程图、时间线、层级图、对比图、关系图），生成后在会话顶部的“画布”标签里直接拖拽编辑和导出。"
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
    "2. 选择最合适的 kind：`architecture`（分区架构）、`flow`（流程）、`timeline`（时间线）、"
    + "`hierarchy`（层级）、`comparison`（对比）、`relationship`（关系）。",
    "3. 调用 `diagram_create` 工具生成图表：",
    "   - 节点和分组的 id 用简短 ASCII（如 `cause`、`treat`），中文放在 label。",
    "   - label 简洁（≤12 字），关键数据和结论放 detail 字段，宁多勿少。",
    "   - architecture 类型尽量使用 groups 分区表达文章结构；信息量大的文章建议"
    + " 12–20 个节点、3–6 个分组（每组 2–5 个节点），避免大量单节点分组。",
    "   - 关键节点设置 `emphasis: true`。",
    "4. 完成后告诉用户：打开会话顶部的“画布”标签即可编辑，支持导出"
    + " .excalidraw/SVG/PNG；如需让你读取用户的手工修改，调用 `diagram_read`。",
    "",
    "## 禁止",
    "",
    "- 不要为本请求写 SVG、Mermaid 或 HTML 文件到工作区。",
    "- 不要自己发明 Excalidraw JSON；只通过 `diagram_create` 提交语义化 spec。",
  ].join("\n"),
};
