# Project Maintenance Instructions

## English

- Maintain the project in `C:\Projects\how-much-should-i-pay`.
- The internal version is `0.3.0`; keep the package version, interface version,
  and release documentation consistent when updating it.
- Use English filenames. Source code, comments, interface text, configuration,
  and plain-text exports use English. Markdown documentation has complete
  English content first and complete Chinese content second.
- Use TypeScript for application logic and any future JavaScript-based backend.
  Keep significant functions documented with concise English comments.
- Keep the browser app local, with no backend, payment execution, or expense
  data upload unless the user explicitly requests an architectural change.
- Keep all entered data and preview state only in the current page's memory.
  Do not automatically persist or restore drafts through browser storage,
  cookies, a service worker, or a server. Every reload, new page, reopened tab,
  navigation return, and browser restore must start with JPY, User 1 through
  User 3, and zero payments. Preserve lifecycle resets for back-forward cache
  restoration.
- Startup may remove only the legacy `how-much-should-i-pay:draft:v1` storage
  key as cleanup, without reading its contents or storing new data. Leave all
  unrelated browser storage untouched. User-initiated clipboard copies and
  downloaded files are external copies; do not describe page clearing as
  deleting them.
- Store monetary values as safe integer minor units. Preserve exact totals,
  deterministic remainder allocation, input-order matching, and money flowing
  from underpaid to overpaid members. Do not claim global transfer minimization.
- Polygon compression affects coordinates only. Preserve zero-total and
  zero-share behavior and ensure playback simulates transfers without changing
  the original entered payments.
- Default to JPY and three users; retain at least three users. Currency changes
  reinterpret entered text without exchange-rate conversion and must explain
  that behavior in the interface.
- Follow the neutral grayscale interface, native system fonts, and readable
  controls. Tables use 11-point text, bold column headings, no background fills,
  and no custom colors.
- Preserve the responsive workflow. Phones from 320–767px wide and short
  landscape windows up to 1199px wide and 520px high use guided People,
  Balance, and Plan tabs. The short-landscape rule takes priority. Tablets
  from 768–1199px use sequential panels in portrait or below 960px wide,
  with a two-column member list; landscape widths from 960–1199px use
  side-by-side People and Balance with a full-width Plan. Keep the desktop
  dashboard from 1200px wide.
- Reuse the same page elements and current-page data across tabs, resize,
  and rotation. Preserve entered values, currency, and preview progress;
  leaving Balance pauses playback and returning requires manual resumption.
  Workspace arrow/Home/End navigation moves focus and activates its tab.
- For compact layouts, chart containers below 520px, or coarse pointers,
  use numeric SVG labels and accessible HTML member buttons showing full
  names and exact contribution/share/ratio details. SVG member selectors
  support Enter and Space. Preserve coincident points and polygon aspect
  ratio rather than displacing monetary coordinates.
- Keep interactive touch targets at least 44px, input text at least 16px,
  device safe-area padding, and readable wrapping for long names and values.
  Do not introduce persistence to support responsive layout changes.
- Keep calculation, polygon geometry, current-page state types, and interface
  behavior separated in `src/lib/` and `src/main.ts`. State types belong in
  `src/lib/state.ts`. Keep automated checks under `tests/`.
- Use Node.js 22.x (at least 22.12) or Node.js 24+ and pnpm. Relevant checks are
  `pnpm typecheck`, `pnpm test`, and `pnpm build`; inspect the app through `pnpm dev` or
  `pnpm preview`. Serve builds over HTTP rather than opening HTML files directly.
- Record actual validation results truthfully. A command listed in documentation
  does not establish that it has passed. DOM tests do not establish physical
  device visual validation; report device or browser checks only when performed.
- Do not run any Git command or perform any Git operation without the user's
  explicit request for that operation. Inspect files directly.
- Preserve the MIT license and third-party license obligations.
- In Chinese replies, avoid the two prohibited constructions stated below.

---

## 中文

- 项目维护目录为 `C:\Projects\how-much-should-i-pay`。
- 内部版本号为 `0.3.0`；更新时同步修改包版本、界面版本和版本说明。
- 所有文件使用英文名称。源码、注释、界面文字、配置和纯文本导出使用英文。
  Markdown 文档使用完整中英双语，英文内容在前，中文内容在后。
- 应用逻辑及未来可能使用 JavaScript 的后端均使用 TypeScript。
  为重要函数编写简洁的英文说明注释。
- 保持浏览器本地运行；增加后端、真实支付或费用数据上传需要用户明确提出架构变更。
- 所有输入数据和预览状态仅存在于当前页面内存。不得通过浏览器存储、Cookie、
  Service Worker 或服务器自动持久化或恢复草稿。每次刷新、新页面、重新打开标签页、
  导航返回和恢复浏览器时，必须从日元、User 1 至 User 3 和零支付金额开始。
  保留前进后退缓存恢复时的页面生命周期重置逻辑。
- 启动时可以只删除旧版 `how-much-should-i-pay:draft:v1` 存储键进行清理，
  不读取其内容，也不保存新数据。其他浏览器存储保持不变。
  用户主动复制到剪贴板或下载的文件属于外部副本，不得宣称清空页面会删除这些副本。
- 金额使用安全整数表示最小货币单位。保持总额精确、余数分配确定、
  按输入顺序匹配，以及金额从少付成员流向多付成员。
  不宣称转账笔数达到全局最少。
- 多边形压缩只影响坐标。保留零总额、零份额处理，播放只模拟转账，
  不改变最初输入的已支付金额。
- 默认日元和三名用户，人数至少三名。切换货币时将输入文本按新货币解释，
  不做汇率换算，并在界面中说明。
- 保持灰阶界面、系统字体和易读控件。表格字号为 11，列标题加粗，
  不设置底纹或自定义颜色。
- 保留响应式工作流程。宽度 320–767px 的手机，以及宽度不超过 1199px、
  同时高度不超过 520px 的较矮横屏窗口使用 People、Balance、Plan 分步标签，
  较矮横屏规则优先。宽度 768–1199px 的平板在竖屏或宽度低于 960px 时
  使用顺序面板和两列成员列表；宽度 960–1199px 的横屏布局将 People 与 Balance
  并排显示，Plan 占据整行。宽度至少 1200px 时保留桌面仪表板。
- 标签切换、窗口缩放和旋转时复用相同的页面元素与当前页面数据。
  保留输入值、货币和预览进度；离开 Balance 时暂停播放，返回后由用户主动继续。
  工作区方向键、Home 和 End 导航会移动焦点并激活相应标签。
- 紧凑布局、图形容器宽度低于 520px 或粗指针设备使用数字 SVG 标签，
  并提供可访问的 HTML 成员按钮，显示完整名字与精确的有效已支付金额、份额和比例。
  SVG 成员选择控件支持 Enter 和空格键。保留重叠点及多边形纵横比，
  不移动代表金额的坐标来分散重叠。
- 交互触摸目标至少为 44px，输入文字至少为 16px，适配设备安全区域，
  并为长名字和较大金额提供易读换行。不得为响应式布局引入持久化。
- 将金额结算、图形几何、当前页面状态类型和界面行为分别放在 `src/lib/` 与 `src/main.ts`。
  状态类型放在 `src/lib/state.ts`，自动化检查放在 `tests/`。
- 使用 Node.js 22.x（至少 22.12）或 Node.js 24 及更新版本和 pnpm。
  相关检查为 `pnpm typecheck`、`pnpm test` 和 `pnpm build`；
  通过 `pnpm dev` 或 `pnpm preview` 检查界面。
  使用 HTTP 服务访问构建，不直接打开 HTML 文件。
- 如实记录实际验证结果。文档列出某项命令不代表该命令已经通过。
  DOM 测试无法证明实体设备上的视觉可用性；仅报告实际执行过的设备或浏览器检查。
- 未经用户对具体操作的明确请求，不运行任何 Git 命令或执行 Git 操作。
  直接检查文件。
- 保留 MIT 许可证和第三方许可证义务。
- 回答时避免使用“不是，而是”和“我反而”。
