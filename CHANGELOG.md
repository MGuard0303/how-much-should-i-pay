# Changelog

## English

### 0.3.0 — 2026-10-20

- Add a guided People, Balance, and Plan workspace for phones and short
  landscape windows, including direct tabs and forward navigation controls.
- Adapt tablets to sequential panels or a two-column people/chart layout,
  and retain a desktop dashboard from 1200px wide.
- Preserve the same inputs, currency, and preview progress across layout
  changes. Pause playback when leaving Balance and allow manual resumption.
- Add arrow, Home, and End navigation for workspace tabs and Enter/Space
  activation for SVG member selectors.
- Use numeric polygon labels in compact or coarse-pointer layouts and
  provide touch-friendly HTML member buttons with exact contribution, share,
  and ratio details, including coincident center points.
- Enlarge touch targets and input text, account for safe areas, and support
  wrapping long names and monetary values without changing polygon geometry.
- Keep exact settlement, current-page-only data, lifecycle clearing, and
  user-initiated copying and export unchanged.

### 0.2.0 — 2026-10-20

- Remove automatic draft persistence. User names, payments, currency, and
  settlement previews exist only in the current page's memory.
- Start every reload, new page, reopened tab, navigation return, and browser
  restore with JPY, three default users, and zero payments, including pages
  returned from the back-forward cache.
- Remove only the app's legacy v0.1 draft key on startup without reading or
  restoring its contents. Leave unrelated browser storage untouched.
- Keep user-initiated copying and plain-text export. These external copies are
  not retained or erased by the app.
- Replace browser storage helpers with current-page state types and update
  the interface and documentation to describe temporary data.

### 0.1.0 — 2026-10-20

- Introduce an English-language, local browser expense splitter with three
  default users, editable labels, and controls to add or remove users.
- Default to JPY and support USD, EUR, GBP, and CNY without currency conversion.
- Calculate exact integer minor-unit shares with deterministic remainder
  allocation and an O(n) settlement plan.
- Display a radial payment polygon with smooth compression for large advances.
- Provide simulated settlement playback, step controls, and restart.
- Include example payments, payment clearing, local browser persistence,
  summary copying, and plain-text export.
- Establish a TypeScript and Vite project with Vitest checks, bilingual
  documentation, and an MIT license.

---

## 中文

### 0.3.0 — 2026-10-20

- 为手机和较矮横屏窗口增加 People、Balance、Plan 分步工作区，
  提供直接切换标签和继续下一步的控件。
- 平板使用顺序面板或成员与图形并排布局，宽度至少 1200px 时使用桌面仪表板。
- 布局变化时保留相同的输入值、货币和预览进度。
  离开 Balance 时暂停播放，返回后可主动继续。
- 工作区标签支持方向键、Home 和 End，SVG 成员选择控件支持 Enter 和空格键。
- 紧凑布局或粗指针设备使用数字多边形标签；适合触摸的 HTML 成员按钮提供
  精确的有效已支付金额、份额和比例详情，也可选择重叠在中心的成员。
- 增大触摸目标与输入文字，适配安全区域，支持长名字和较大金额换行，
  保持多边形几何含义。
- 保留精确结算、数据仅在当前页面内存中存在、生命周期清空，
  以及用户主动复制和导出的行为。

### 0.2.0 — 2026-10-20

- 移除草稿自动持久化。成员名字、支付金额、货币和结算预览仅存在于当前页面内存。
- 刷新、新页面、重新打开标签页、导航返回和恢复浏览器时，均从日元、三名默认用户
  和零支付金额开始，包括通过前进后退缓存恢复的页面。
- 启动时仅删除应用自己的 v0.1 旧草稿键，不读取或恢复其内容，其他浏览器存储保持不变。
- 保留用户主动复制和纯文本导出。应用不会留存或删除这些外部副本。
- 将浏览器存储辅助逻辑替换为当前页面状态类型，并更新界面和文档中的临时数据说明。

### 0.1.0 — 2026-10-20

- 提供英文界面的浏览器本地 AA 费用结算应用，默认三名用户，
  支持编辑名字标签和添加、删除成员。
- 默认使用日元，支持 USD、EUR、GBP 和 CNY，不进行货币换算。
- 使用整数最小货币单位精确分配份额，确定性分配余数，并通过 O(n) 算法生成结算方案。
- 展示径向付款多边形，对大额垫付使用平滑半径压缩。
- 提供结算模拟播放、逐笔查看和重新开始。
- 提供示例金额、清空支付金额、浏览器本地存储、复制摘要和纯文本导出。
- 建立 TypeScript 与 Vite 项目，包含 Vitest 检查、双语文档和 MIT 许可证。
