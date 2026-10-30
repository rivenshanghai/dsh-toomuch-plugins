# ADR-0001: 按 `data-dsh-*-entry` 属性名通用发现侧栏条目

**Date:** 2026-10-30
**Status:** Accepted
**Author(s):** dsh-toomuch-plugins maintainers
**Deciders:** 插件维护者

---

## Context

用户反馈：设置页「插件显示顺序」的下拉框里看不到「今日值得读 rss、全局搜索、
容器、上下文洞察」这几个条目（用户提问原文：「插件显示顺序中，这几个插件在
下拉列表中看不到（也许不是插件？）」）。下拉框此前只枚举
`ctx.slots.entriesOfSlot('sidebar.panellist')`，即只认标准槽位注册的面板。

排查发现缺席有两类成因：

1. **绕槽插入**：今日值得读 / 全局搜索 / 容器等第三方 bundle 不走
   `sidebar.panellist` 槽，而是把自建元素直接插到侧栏根节点（logoRow 之后、
   `<nav>` 之前），并用 `data-dsh-*` 结尾的**空值属性**（属性名本身即
   `data-dsh-rss-entry` 这样的约定，非 `名=值` 形态）做族内排序。全仓库 grep
   该约定的使用者有 11 个，远超本插件最初硬编码的 6 个。
2. **惰性注册**：上下文洞察（dsh-context）是正规槽位面板，但注册挂在设置开关
   后面——用户没开那个设置时它根本不在槽里；开了之后，React 设置页不因槽位
   变化重渲染，下拉也不刷新。

更深一层：即便把条目列进了顺序列表，绕槽条目位于 `<nav>` **之外**的另一个
盒子，CSS `order`（本插件既定的无损重排手段）只作用于 nav 的直接子元素，对
它们无效——只加下拉项、顺序仍然不会真实生效。

**Key constraints:**

- 设计文档（docs/design.md）既定边界：不注入 DSH 内部模块、不读写 DSH 配置、
  偏好只写 `localStorage`；安全失效（找不到目标元素时什么都不做、不报错）。
- 本插件不 import DSH 内部包，因此不能依赖 `resolveSlotLabel` 之外的宿主私有
  工具函数；第三方插件的实现（`@hyzyn/*` 等）不受本插件控制，无法要求它们
  改走标准槽。
- CSS 没有「属性名以 X 结尾」的通配选择器——`[data-dsh$="-entry"]` 匹配的是
  属性**值**，而约定条目是空值属性，选择器选不出来。

---

## Options Considered

### Option 1: 通用属性名发现（JS 遍历 attributes）

**Description:** 写一个 `domEntryId(el)`：遍历元素的 `attributes`，凡属性名以
`data-dsh-` 开头、`-entry` 结尾的即为该条目的 id。下拉 = 槽位面板 ∪ 侧栏根
节点下按此规则发现的条目（按属性名去重）；点击计数与顺序定位走同一解析。

**Pros:**

- 与第三方插件的既有约定一致，是它们实际暴露的唯一稳定身份；11 个现成使用者
  全部自动纳入，新插件沿用约定即自动生效，零维护清单。
- 不依赖宿主私有 API、不引依赖，纯 JS 属性遍历，失败即当没发现（安全失效）。
- 下拉、点击计数、顺序定位三处共用一个身份解析，行为一致。

**Cons:**

- 约定是**事实约定**而非官方契约：若某个插件换属性名或改用 `名=值` 形态，
  会被漏掉（例如 dsh-claude-footer 的 foot-area 条目就因其属性挂在子区而非
  root 直接子而天然排除——这反而正确）。
- 属性名解析靠 JS 而非 CSS，需要代码遍历，略多几行。

**Why this was ruled out (if not chosen):** —— 即所选方案。

### Option 2: 维护静态 ADOPT_ATTRS 清单

**Description:** 在源码里硬编码一份 `data-dsh-*-entry` 属性名数组（本插件
0.2.0 起已这么做，清单 6 条），下拉与收养都查这张表。

**Pros:**

- 实现最直观；显式列出「支持哪些插件」，行为完全可预测。
- 没有误匹配风险：清单外的属性一概不认。

**Why this was ruled out:** 已实测失效——仓库实际有 11 个约定使用者，旧清单
6 条漏了 5 个；且每出一个新插件都要改本插件发版。用户报的「看不到」正是这个
方案的直接后果。维护成本是持续的，清单注定过期。

### Option 3: 只信 `entriesOfSlot('sidebar.panellist')`

**Description:** 保持现状，只枚举标准槽位；绕槽插件的条目不进下拉（它们
「不是插件」——严格说确实不是本槽的面板）。

**Pros:**

- 零改动；身份 100% 可靠（槽 options.id 是官方契约）。
- 没有作用域问题：槽位天然只含侧栏面板。

**Why this was ruled out:** 这就是用户报的缺陷本身。绕槽条目在用户眼里就是
侧栏插件入口，理应能排序；且它们已可被网格模式收养（0.2.0 起），下拉却不认，
行为不一致。

### Option 4: 让第三方插件改走标准槽 / 向 DSH 提需求统一入口

**Description:** 治本方案：推动所有侧栏入口都注册进 `sidebar.panellist` 槽，
或向 DSH 上游提「统一入口契约」。

**Pros:**

- 根除两类成因，本插件不需要任何兼容代码。

**Why this was ruled out:** 第三方 bundle 不受本插件控制，短期不可行；上游
契约何时落地不可预期。可作为长期方向记入 §9 后续扩展，但不能作为本缺陷的
修复手段。

---

## Decision

**We will 按 `data-dsh-*-entry` 属性名做通用发现（Option 1），并为被列出的
条目在列表模式下选择性收养进 `<nav>`。**

具体三件事：(1) `domEntryId()` 遍历元素属性解析条目 id，下拉 =
槽位面板 ∪ 侧栏根节点下按此规则发现的条目（合并去重，label 取
`aria-label`/`title`）；(2) 设置页 `slots.subscribe('sidebar.panellist')`
触发重渲染，解决 dsh-context 这类惰性注册的面板不刷新；(3) 顺序列表里列出的
绕槽条目被 `adoptEntries(only)` 收养进 nav——CSS `order` 才够得着——清空顺序
或关网格时 `releaseEntry()` 放回原位。

---

## Consequences

### Positive Consequences

- 11 个现成约定使用者与未来新插件全部自动进下拉，零维护清单；用户报的四个
  条目（三个绕槽 + 一个惰性注册）全部覆盖。
- 下拉、点击计数、顺序定位共用同一身份解析，不会再出现「A 处认识、B 处
  不认识」的分裂。
- 收养复用 0.2.0 网格模式已验证的机制，未引入新交互原语。

### Negative Consequences / Accepted Tradeoffs

- 识别依赖**事实约定**：第三方换属性名即漏识别，且不会报错（静默少一个条目）。
- 列表模式下，被列出的绕槽条目**视觉上从「nav 上方组」移进列表**——这是
  收养的固有语义，用户可能觉得「条目被挪走了」；未列出的条目留在原位不动。
- 设置页对槽位变化的响应依赖 React 重渲染时机：dsh-context 开启后需**切走
  再切回设置页**才会出现在下拉里（smoke 已注记该 ceiling）。
- 点击计数加了侧栏作用域守卫（只认当前 sidebar 根内的条目），守卫依据是
  `sidebarRoot` 变量在 `applyNav` 里捕获——首帧渲染前的点击会漏计。

### Risks

- DSH 改版若改变侧栏根/nav 结构或给条目换属性约定，发现与收养同时失效——
  表现为下拉少条目、顺序不生效，但**不会报错、不会弄坏界面**（安全失效
  仍成立）。
- 若 DSH 官方推出统一的入口身份（如给 PanelRow 加 data 属性），本方案应
  迁移到官方身份——届时 Option 4 变为可行。

---

## Implementation Notes

- `domEntryId` 必须 JS 遍历 `el.attributes`：CSS 的 `[attr$=x]` 匹配的是
  属性**值**，选不出空值属性；这是当初最容易写错的一点。
- 收养要区分三态：网格开 → 全量收养；列表模式且 order 非空 → **只收养
  order 列出的**，且要把「已收养但已不在 order 里」的先 `releaseEntry` 放回；
  否则 → 全量放回。放回顺序按 `adoptedBefore` WeakMap 记录的相邻元素还原。
- `applyGrid` 必须先于 `applyNav` 跑（FooterToggle effect 已如此排列）：
  收养改变 DOM 后，收起限额才按视觉序计数。
- 相关代码：`src/client.js` 的 `domEntryId` / `domEntries` / `refreshListEntries`
  / `adoptEntries(only)` / `releaseEntry`；测试见 `test/smoke.js`
  「convention entries」段。
- 本决策对应用户报告（2026-10-30）与 CHANGELOG Unreleased 第 4 条。

## Review Date

触发条件：DSH 官方给侧栏入口提供统一身份（data 属性或槽位强制），或
`data-dsh-*-entry` 约定的插件开始分裂出第二种属性命名——任一发生即复审本
ADR，考虑迁移到官方身份。

## Deeper Materials

- docs/design.md §「收养注入式入口」（机制细节）与 §8 验证清单 24–26。
- 用户报告原文见本仓库会话记录（2026-10-30）。
