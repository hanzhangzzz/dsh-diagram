# 需求 spec：带分组的 flow 图必须产出不重叠的分组框

- Status: Proposed（交接给 feat/obstacle-aware-routing 或其后续任务）
- Origin: 真实会话 `session-4bb84b23-61c8-4ab8-98b8-66d6ebb8e10f` 的 diagram
  `b8ad0695-2277-4bac-9e74-6bbe5bdf3c0b`（"j-space Skill 工作原理"，flow，18 节点 / 21 边 / 5 分组）。

## 问题（有实测证据）

`kind: flow` 携带 `groups` 时，`layoutDirected` 走不感知分组的 Dagre LR，
分组框由成员节点外接矩形事后推导（`RawLayout.groups` 省略路径）。Dagre 会把
不同组的节点空间交错，导致：

1. 五个分组容器大面积互相压叠，组标题文字被相邻框线覆盖；
2. 框线穿过节点行间，视觉上"线压到了边"；
3. 组间边穿越框线的观感被框重叠进一步放大（定量：21 条边对分组矩形的
   段级交叠 84 处；对节点矩形为 0，说明 Dagre 节点避让本身正常）。

`feat/obstacle-aware-routing`（ccfa368 时点）重写了边路由（正交 + 障碍规避 +
端口分配），能解决边穿框，但 flow 的布局配方未变，分组框重叠仍会发生。

## 验收标准

- 带分组的 flow：任意两个分组框投影不相交（AABB disjoint），未分组节点不落
  在任何组框内；组标题预留高度内无其他元素。
- 布局仍确定且保持输入顺序（AGENTS.md 既有不变量）；无分组 flow 行为不变。
- 对本 spec 起源的 18/21/5 规模真实 spec 有回归测试（可直接取该 sourceSpec
  脱敏后入 tests）。

## 实现方向（两选一，倾向 A）

A. grouped flow 复用 architecture 的等宽分区带状布局（`layoutBands`），组间边
   交给新路由；语义上带分组的 flow 与带分组的 architecture 差异本就有限。
B. Dagre compound（`setParent`）保持组内聚簇，再显式产出组框。成本高、顺序
   稳定性需重新论证。

## 短期规避（不改代码）

生成侧引导：`canvas-diagram` skill 提示带分组语义优先 `architecture`。这不是
根治（模型仍可能选 flow+groups），布局层修复才是闭环。
