# How Much Should I Pay? v0.3.0

## English

### Live app

Open [How Much Should I Pay?](https://how-much-should-i-pay.mulixuan0303.workers.dev/)
in your browser.

### Purpose

An English-language web app for splitting a group's shared expenses equally.
Enter what each person has already paid, inspect the payment polygon, and follow
one deterministic settlement plan. All calculations run locally in the browser;
the app does not require a backend or make payments.

The interface follows the reference project's readable grayscale appearance,
white panels, native system fonts, and English controls. The internal version is
`0.3.0`.

### Running locally

Install **Node.js 22.x (22.12 or later) or Node.js 24+** and pnpm, then run these
commands in the project directory:

```sh
pnpm install
pnpm dev
```

Open the local HTTP address printed by Vite. Use a current browser. Do not open
`index.html` directly from the filesystem: development source requires Vite, and
the production bundle should also be served over HTTP.

### Using the app

1. Each fresh page starts with Japanese yen (JPY), User 1, User 2, and User 3,
   and zero payments. Edit each name label and the amount that person has
   already paid.
2. Use **Add user** to include another person. Users can be removed while at
   least three remain.
3. Read the total, each assigned share, and the settlement instructions. A
   transfer uses plain text such as `Alex --> Blake: ¥1,000`.
4. Use the playback controls to step through or automatically play the proposed
   transfers. Restart returns the visualization to the original payments.
   Playback only simulates settlement.
5. Use **Copy plan** to copy the settlement summary or **Download** to export a
   plain-text file. **Try an example** replaces the current draft with three
   sample users and JPY payments. **Clear payments** resets paid amounts while
   keeping the current people.

The app supports JPY, USD, EUR, GBP, and CNY. JPY uses whole yen; the other
currencies use two decimal places. Switching currency preserves the entered
amount text and interprets it in the newly selected currency. It performs no
exchange-rate conversion. Check the values after a currency change, especially
when moving from a two-decimal currency to JPY.

Users, amounts, currency, and the settlement preview exist only in the current
page's memory. The app does not automatically save or restore them. Reloading,
opening another page, navigating away and back, closing and reopening a tab,
or restoring the browser starts again with JPY, three default users, and zero
payments. Page lifecycle handling also resets a page restored through the
browser's back-forward cache.

On startup, the app removes its own legacy v0.1 draft key,
`how-much-should-i-pay:draft:v1`, without reading it or saving new data. Unrelated
browser storage is left untouched. No account, payment service, or application
data upload is required.

**Copy plan** and **Download** create copies only when you request them.
The app does not retain those copies. A manually exported file or clipboard
entry exists outside the app; clearing or closing the page cannot erase it.

### Responsive workflow

The workspace adapts its layout while keeping one set of people, inputs,
currency, and preview state in the current page:

- **Phones, 320–767px wide:** a guided **People**, **Balance**, and **Plan**
  workspace shows one section at a time. Click or tap a workspace tab, or use
  **View balance** and **View plan** to move forward.
- **Short landscape windows, up to 1199px wide and 520px high:** the same guided
  workspace limits the amount of vertical scrolling needed within a section.
- **Tablets, 768–1199px wide:** portrait layouts and widths below 960px show
  People, Balance, and Plan sequentially, with a two-column member list.
  Landscape layouts from 960–1199px place People and Balance side by side and
  keep Plan across the full width.
- **Desktop windows, 1200px and wider:** a dashboard presents the people,
  visualization, and plan together.

The short-landscape rule takes priority over the regular tablet layout.
Portrait phones give the total its own summary row. Short landscape windows
from 600–1199px wide show all three summary values in one row to save height.
Resizing or rotating the viewport preserves entered names, amounts, currency,
and preview progress. Changing sections uses the same page elements and does
not create another draft. Leaving **Balance** pauses a running preview;
return to Balance and press **Play settlement** to resume it manually.
Switching sections never executes a payment.

Use Tab to reach the workspace tabs. Left and Right arrow keys move focus and
activate the adjacent tab; Home and End activate the first and last tab.
Clicking or tapping a tab selects it directly.

When the chart is narrower than 520px, the layout is compact, or the device
uses a coarse pointer, the polygon uses numeric labels. Touch-friendly HTML
member buttons provide full names and an exact contribution, assigned share,
and ratio detail view. Select a member by touch or keyboard; SVG member
selectors also respond to Enter and Space. Members whose points overlap at
the center remain individually selectable through the member buttons.
The chart retains its aspect ratio and geometric meaning in every layout.
Wide charts shorten long SVG name labels to keep them inside the chart;
the HTML member buttons retain each full name.

Controls provide at least 44px touch targets, inputs use at least 16px text,
and page padding accounts for device safe areas. Names and large monetary
values wrap within their panels. Layout adaptation introduces no automatic
storage or restoration; reloading or leaving the page still clears its data.

### Exact settlement rules

Amounts are parsed into integer minor units before calculation. For JPY, one
minor unit is one yen; for the other supported currencies, it is one hundredth
of the currency. Unsupported precision is rejected instead of silently rounded.

For a total of `C` minor units and `n` users:

- Every user is assigned `floor(C / n)` units.
- The first `C % n` users in input order are assigned one additional unit.
- Each balance is `paid - assignedShare`.
- Negative-balance users pay positive-balance users. Two forward-only pointers
  match these groups in input order and transfer the smaller remaining amount
  at each step.

This produces one repeatable plan in **O(n)** time and **O(n)** additional space,
with no more than **n - 1** transfers. It does not guarantee the globally smallest
possible number of transfers. Every transfer moves money from a person below
their assigned share to a person above their assigned share. The total assigned
shares exactly equals the entered total.

For example, JPY 100 shared by three users gives assigned shares of JPY 34,
JPY 33, and JPY 33. Input order decides who receives the extra unit.

### Reading the polygon

Each user has a fixed direction from the center to a vertex of a regular
polygon. The reference polygon represents the assigned shares. A user's radius
is based on `r = effectivePaid / assignedShare`:

- `r = 0`: the point is at the center.
- `r = 1`: the point reaches its target vertex.
- `r > 1`: the point extends beyond that vertex.

During playback, `effectivePaid` includes simulated outgoing transfers and
subtracts simulated incoming transfers. The final settled points reach the
target polygon even when the smallest-unit remainder makes assigned shares
differ by one unit.

To keep a large advance visible, radii above `3` use
`3 + (1 - exp(-(r - 3)))`, approaching a maximum display radius of `4`.
This compression affects coordinates only; it never changes money, balances,
or transfer amounts. A person who paid everything can produce a collapsed or
degenerate initial shape because the other points overlap at the center.

When the total is positive and a user's assigned share is zero, a zero effective
payment is displayed at the target vertex. A positive effective payment with a
zero assigned share uses the display cap of `4`. When every payment is zero,
the app shows a no-expense state with the points at the center.

### Development and verification

The implementation uses TypeScript, Vite, native browser APIs, and SVG. Vitest
checks the calculation and visualization helpers.

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

`pnpm build` checks types and writes the production app to `dist/`.
`pnpm preview` serves that build locally for inspection.

Validation for v0.3.0 on 2026-10-20: all **104 automated tests**, TypeScript
checking, and the production build passed on Windows. DOM integration tests
cover workspace switching, keyboard focus, responsive chart sizing, exact
member details, preview preservation, and page-only data clearing. Physical
phone and tablet visual verification has not been performed.

### Source layout

```text
how-much-should-i-pay/
├── README.md                Project overview and usage
├── CHANGELOG.md             Release changes
├── AGENTS.md                Maintenance instructions
├── LICENSE                  MIT license
├── .gitignore               Generated and local file exclusions
├── index.html               Browser entry point
├── package.json             Version and development commands
├── vite.config.ts           Development and production build settings
├── tsconfig.json            Strict TypeScript configuration
├── public/                  Static public assets
├── src/
│   ├── main.ts              Interface and playback behavior
│   ├── styles.css           Responsive grayscale appearance
│   └── lib/
│       ├── settlement.ts    Exact amounts and deterministic settlement
│       ├── polygon.ts       Visualization geometry
│       └── state.ts         Types for current-page memory
├── tests/                   Automated checks
└── dist/                    Generated production build
```

### Static deployment

Run `pnpm build`, then serve the complete contents of `dist/` with a static HTTP
or HTTPS host. No server-side application or database is needed. The relative
asset base allows the build to be served from a subdirectory. Keep generated
files out of the source tree's maintained files using `.gitignore`.

An HTTP host can receive ordinary page and asset requests; the app does not
upload the expense data entered into it or retain it between pages. Currency
labels do not imply payment processing or exchange-rate lookup.

### License and reference

Project-owned code uses the [MIT License](LICENSE), copyright
`2026 Lixuan Mu`. Development dependencies retain their own licenses.

The organization, bilingual documentation, and neutral visual conventions refer
to [QIIME 2 Provenance Studio](https://github.com/MGuard0303/qiime2-provenance-parser).
This application has an independent TypeScript implementation.

---

## 中文

### 在线使用

在浏览器中打开 [How Much Should I Pay?](https://how-much-should-i-pay.mulixuan0303.workers.dev/)。

### 项目用途

这是一个使用英文界面的 AA 费用结算网页应用。输入每个人已经支付的金额，
即可查看付款多边形和一套确定的结算方案。计算全部在浏览器本地完成，
无需后端，也不会执行真实转账。

界面沿用参考项目的灰阶配色、白色面板、系统字体和英文控件。
内部版本号为 `0.3.0`。

### 本地运行

安装 **Node.js 22.x（至少 22.12）或 Node.js 24 及更新版本**和 pnpm，在项目目录执行：

```sh
pnpm install
pnpm dev
```

使用较新的浏览器打开 Vite 输出的本地 HTTP 地址。请通过 HTTP 服务访问，
不要直接打开文件系统中的 `index.html`；开发源码需要 Vite 处理，
生产构建也应通过 HTTP 服务访问。

### 使用方法

1. 每次新页面都从日元（JPY）、User 1、User 2、User 3 和零支付金额开始。
   可以修改每个人的名字标签和已支付金额。
2. 点击 **Add user** 添加成员。人数多于三人时可以删除成员。
3. 查看总金额、每个人分配到的应承担金额以及转账指示。
   转账使用 `Alex --> Blake: ¥1,000` 这样的简易文本表示。
4. 使用播放控件逐笔查看或自动播放结算过程。重新开始会让图形回到最初的
   支付状态。播放过程只模拟结算。
5. 点击 **Copy plan** 复制结算摘要，或点击 **Download** 导出纯文本文件。
   **Try an example** 将当前草稿替换为三名示例成员和日元示例金额。
   **Clear payments** 清空已支付金额，并保留当前成员。

支持 JPY、USD、EUR、GBP 和 CNY。日元使用整数，其他货币使用两位小数。
切换货币时保留当前输入的金额文本，并将其按新货币解释，不执行汇率换算。
切换后请核对金额，尤其留意从两位小数货币切换到日元的情况。

成员、金额、货币和结算预览仅存在于当前页面的内存中，应用不会自动保存或恢复。
刷新、打开另一个页面、离开后通过前进或后退返回、关闭并重新打开标签页、
恢复浏览器时，都会重新从日元、三名默认用户和零支付金额开始。
页面生命周期处理也会重置通过浏览器前进后退缓存恢复的页面。

启动时，应用仅删除自己在 v0.1 中使用的旧草稿键
`how-much-should-i-pay:draft:v1`，不读取旧内容，也不写入新数据。
其他浏览器存储保持不变。无需账号、支付服务或上传应用数据。

**Copy plan** 和 **Download** 仅在用户主动操作时生成副本，应用不会留存这些副本。
手动导出的文件或剪贴板内容位于应用外部，清空或关闭页面无法删除它们。

### 响应式工作流程

工作区会随可用空间调整布局，成员、输入值、货币和预览状态始终共用当前页面中的同一份数据：

- **手机，宽度 320–767px：** 使用 **People**、**Balance** 和 **Plan** 分步工作区，
  每次显示一个部分。点击工作区标签，或通过 **View balance**、**View plan** 继续下一步。
- **较矮的横屏窗口，宽度不超过 1199px、同时高度不超过 520px：**
  使用相同的分步工作区，减少单个部分需要的纵向滚动。
- **平板，宽度 768–1199px：** 竖屏布局或宽度低于 960px 时，
  People、Balance、Plan 依次排列，成员列表使用两列。
  宽度 960–1199px 的横屏布局将 People 和 Balance 并排显示，Plan 占据整行。
- **桌面窗口，宽度至少 1200px：** 使用仪表板布局，同时呈现成员、图形和结算方案。

较矮横屏窗口的规则优先于常规平板布局。
手机竖屏时，总金额独占一行摘要；宽度 600–1199px 的较矮横屏窗口
将三个摘要值放在同一行，以节省纵向空间。
改变窗口尺寸或旋转屏幕会保留已经输入的名字、金额、货币和预览进度。
切换部分时使用相同的页面元素，不会创建另一份草稿。
离开 **Balance** 会暂停正在播放的预览；返回 Balance 后，
需要主动点击 **Play settlement** 才会继续。切换部分不会执行真实付款。

使用 Tab 键可进入工作区标签。左、右方向键会移动焦点并激活相邻标签；
Home 和 End 会激活第一个与最后一个标签。也可以直接点击或触摸标签进行选择。

图形容器宽度低于 520px、使用紧凑布局，或设备使用粗指针时，多边形使用数字标签。
适合触摸的 HTML 成员按钮提供完整名字，以及有效已支付金额、分配份额和比例详情。
可以通过触摸或键盘选择成员；SVG 成员选择控件也支持 Enter 和空格键。
点重叠在中心的成员仍可通过成员按钮分别选择。
所有布局均保留图形纵横比与几何含义。
宽屏图形会缩短过长的 SVG 名字标签，确保文字位于图形区域内；
HTML 成员按钮仍保留完整名字。

控件的触摸目标至少为 44px，输入文字至少为 16px，页面留白适配设备安全区域。
长名字和较大金额会在面板内换行。布局调整不会引入自动保存或恢复；
刷新或离开页面仍会清空数据。

### 精确结算规则

金额在计算前会被解析为整数最小货币单位。日元的最小单位是 1 日元，
其他支持货币的最小单位为 0.01。超出货币精度的输入会被拒绝，不会被静默舍入。

当总额为 `C` 个最小单位、人数为 `n` 时：

- 每人先分配 `floor(C / n)` 个单位。
- 按输入顺序，前 `C % n` 人各多分配 1 个单位。
- 每个人的余额为 `已支付金额 - 分配的应承担金额`。
- 负余额成员向正余额成员付款。两个只向前移动的指针，按输入顺序匹配
  这两组成员，每次转移双方剩余金额中的较小值。

算法时间复杂度为 **O(n)**，额外空间为 **O(n)**，最多生成 **n - 1** 笔转账。
方案可以重复得到，但不保证转账笔数是全局最少。每笔钱都从低于自己分配份额
的成员流向高于自己分配份额的成员，所有分配份额的总和精确等于输入总额。

例如 100 日元由三人分摊时，按顺序分配为 34、33、33 日元。
多出的最小单位由输入顺序决定。

### 理解多边形

每名成员对应从中心指向正多边形某个顶点的固定方向。
参考多边形表示每个人分配到的应承担份额。
成员点的半径由 `r = 有效已支付金额 / 分配份额` 决定：

- `r = 0`：点位于中心。
- `r = 1`：点到达自己的目标顶点。
- `r > 1`：点超过自己的目标顶点。

播放结算时，有效已支付金额会加上模拟转出金额，并减去模拟转入金额。
结算结束后所有点均到达目标多边形；即使最小单位余数使成员份额相差 1 个单位，
也遵循同样的目标规则。

为使大额垫付能够清楚显示，当 `r > 3` 时，显示半径使用
`3 + (1 - exp(-(r - 3)))`，逐渐接近显示上限 `4`。
压缩仅改变图形坐标，不改变任何金额、余额或转账结果。
如果一人支付全部费用，其余人的点会重叠在中心，初始图形可能退化或塌缩。

总金额大于零时，如果某人的分配份额为零且有效已支付金额也为零，
该成员点显示在目标顶点；分配份额为零但有效已支付金额为正时，
显示半径取上限 `4`。所有人支付金额均为零时，应用显示无费用状态，点位于中心。

### 开发与验证

实现使用 TypeScript、Vite、浏览器原生 API 和 SVG。
Vitest 用于检查金额计算和图形辅助逻辑。

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

`pnpm build` 执行类型检查，并将生产构建写入 `dist/`。
`pnpm preview` 提供本地构建预览服务。

2026-10-20 的 v0.3.0 验证：在 Windows 下，**104 项自动化测试**、TypeScript
类型检查和生产构建均已通过。DOM 集成测试覆盖工作区切换、键盘焦点、响应式图形尺寸、
成员精确金额详情、预览状态保留和页面内存数据清空。
本次尚未进行手机或平板实体设备的视觉验收。

### 源码结构

```text
how-much-should-i-pay/
├── README.md                项目说明与使用方法
├── CHANGELOG.md             版本变更
├── AGENTS.md                维护约定
├── LICENSE                  MIT 许可证
├── .gitignore               生成文件和本地文件的忽略规则
├── index.html               浏览器入口
├── package.json             版本号与开发命令
├── vite.config.ts           开发与生产构建配置
├── tsconfig.json            严格 TypeScript 配置
├── public/                  静态公共资源
├── src/
│   ├── main.ts              界面与播放行为
│   ├── styles.css           响应式灰阶外观
│   └── lib/
│       ├── settlement.ts    精确金额与确定的结算算法
│       ├── polygon.ts       图形几何计算
│       └── state.ts         当前页面内存数据的类型
├── tests/                   自动化检查
└── dist/                    生成的生产构建
```

### 静态部署

执行 `pnpm build`，将 `dist/` 内的全部内容交给静态 HTTP 或 HTTPS 服务。
无需服务端应用或数据库。资源使用相对路径，支持在子目录下提供服务。
通过 `.gitignore` 将生成文件与需要维护的源码区分。

HTTP 主机会收到普通页面和资源请求；应用不会上传输入的费用数据，也不会跨页面保留。
货币标签不涉及支付处理或汇率查询。

### 许可证与参考项目

项目自有源码采用 [MIT 许可证](LICENSE)，版权署名为 `2026 Lixuan Mu`。
开发依赖继续适用其各自许可证。

项目组织、双语文档和灰阶视觉规范参考
[QIIME 2 Provenance Studio](https://github.com/MGuard0303/qiime2-provenance-parser)。
本应用使用独立的 TypeScript 实现。
