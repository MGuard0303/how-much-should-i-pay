import './styles.css';
import {
  CURRENCIES,
  applyTransfers,
  calculateSettlement,
  formatAmount,
  parseAmount,
  type CurrencyCode,
  type Settlement,
} from './lib/settlement';
import { createPolygonGeometry, type Point, type PolygonGeometry } from './lib/polygon';
import { discardLegacyDraft, type Draft } from './lib/state';

const VERSION = '0.3.0';
type WorkspaceView = 'people' | 'balance' | 'plan';
const WORKSPACE_VIEWS: WorkspaceView[] = ['people', 'balance', 'plan'];
const compactMedia = matchMedia('(max-width: 767px), (max-width: 1199px) and (max-height: 520px)');
const coarsePointerMedia = matchMedia('(pointer: coarse)');
let compactLayout = compactMedia.matches;
let activeView: WorkspaceView = 'people';
let selectedMemberId: string | null = null;
let chartWidth = 0;
let chartAvailableWidth = 0;
const icon = (name: string): string => {
  const paths: Record<string, string> = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
    play: '<path d="m8 5 11 7-11 7Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    step: '<path d="m5 5 10 7-10 7ZM19 5v14"/>',
    restart: '<path d="M3 4v6h6M3 10a9 9 0 1 1 1 8"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3 2.45c-.5.25-.5.55-.5 1.55M12 17h.01"/>',
  };
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`;
};

/** Escape user labels before inserting them into HTML or SVG markup. */
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

/** Local IDs also work on plain HTTP origins where randomUUID is unavailable. */
function createMemberId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const newMember = (index: number) => ({ id: createMemberId(), name: `User ${index}`, amount: '0' });

/** Start every page with new people, zero payments, and the default currency. */
function createInitialDraft(): Draft {
  return {
    currency: 'JPY',
    members: [newMember(1), newMember(2), newMember(3)],
  };
}

discardLegacyDraft();
let draft: Draft = createInitialDraft();
let settlement: Settlement | null = null;
let completed = 0;
let playbackTimer: ReturnType<typeof setTimeout> | undefined;
let isPlaying = false;
let animationFrame = 0;
let previousGeometry: PolygonGeometry | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const downloadTimers = new Map<string, ReturnType<typeof setTimeout>>();
const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="./" aria-label="How much should I pay? Home">
        <span class="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m16 5 12 21H4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="16" cy="17" r="2" fill="currentColor"/></svg></span>
        <span>How much should I pay?<span class="brand-subtitle">A fair share, for everyone.</span></span>
      </a>
      <div class="header-actions"><span class="version">v${VERSION}</span><button id="help-button" class="text-button" aria-label="How it works" title="How it works">${icon('help')}<span>How it works</span></button></div>
    </div>
  </header>
  <main class="page-shell">
    <section class="intro" aria-labelledby="page-title">
      <div><p class="eyebrow">SHARED EXPENSES, SIMPLIFIED</p><h1 id="page-title">Good times. Even splits.</h1><p class="intro-description">Add what everyone paid. Find out who owes whom.</p></div>
      <button id="example-button" class="secondary-button example-button">Try an example <span aria-hidden="true">↗</span></button>
    </section>

    <section class="summary-grid" aria-label="Expense summary">
      <div class="summary-item"><span class="summary-label">Total spent</span><strong id="total-value">¥0</strong><span id="total-caption" class="summary-caption">Across 3 people</span></div>
      <div class="summary-item"><span class="summary-label">Fair share per person</span><strong id="share-value">¥0</strong><span id="share-caption" class="summary-caption">Split equally, down to the yen</span></div>
      <div class="summary-item"><span class="summary-label">To settle</span><strong id="remaining-value">¥0</strong><span id="remaining-caption" class="summary-caption">Enter payments to get started</span></div>
    </section>

    <nav id="workspace-navigation" class="workspace-navigation" aria-label="Workspace navigation" hidden>
      <div class="workspace-tabs" role="tablist" aria-label="Expense workspace">
        <button id="people-tab" class="workspace-tab" data-view="people" type="button" role="tab" aria-controls="people-panel" aria-selected="true"><span class="tab-number" aria-hidden="true">01</span>People</button>
        <button id="balance-tab" class="workspace-tab" data-view="balance" type="button" role="tab" aria-controls="balance-panel" aria-selected="false" tabindex="-1"><span class="tab-number" aria-hidden="true">02</span>Balance</button>
        <button id="plan-tab" class="workspace-tab" data-view="plan" type="button" role="tab" aria-controls="plan-panel" aria-selected="false" tabindex="-1"><span class="tab-number" aria-hidden="true">03</span>Plan</button>
      </div>
    </nav>
    <div class="workspace">
      <section id="people-panel" class="panel people-panel" data-workspace-view="people" aria-labelledby="people-title">
        <div class="panel-heading"><div><p class="section-step">01 / THE PEOPLE</p><h2 id="people-title">Who came along?<span id="people-count" class="count-badge">3</span></h2></div>
          <label class="currency-label"><span class="sr-only">Currency</span><select id="currency-select" aria-label="Currency">${Object.entries(CURRENCIES).map(([code, currency]) => `<option value="${code}"${draft.currency === code ? ' selected' : ''}>${code} ${currency.symbol}</option>`).join('')}</select></label>
        </div>
        <div class="column-labels"><span>NAME</span><span>AMOUNT PAID</span></div>
        <div id="member-list" class="member-list"></div>
        <button id="add-button" class="add-button">${icon('plus')} Add user</button>
        <div class="people-footer"><button id="clear-button" class="text-button">Clear payments</button><span>Minimum 3 people</span></div>
        <p class="currency-note">Changing currency keeps the entered numbers. No conversion is applied.</p>
        <div id="validation-message" class="validation-message" role="status" hidden></div>
        <div class="panel-navigation compact-only"><button class="primary-button" data-view="balance" type="button">View balance <span aria-hidden="true">--&gt;</span></button></div>
      </section>

      <section id="balance-panel" class="panel visual-panel" data-workspace-view="balance" aria-labelledby="visual-title">
        <div class="panel-heading"><div><p class="section-step">02 / THE BALANCE</p><h2 id="visual-title">See your fair share.</h2></div><span id="balance-badge" class="status-badge">Waiting for payments</span></div>
        <div id="polygon-chart" class="polygon-chart"></div>
        <div class="graph-legend"><span><i class="legend-line dashed"></i>Fair share · 100%</span><span><i class="legend-line"></i>Current contribution</span></div>
        <p id="graph-note" class="graph-note">Each person has a corner. A balanced group forms a regular polygon.</p>
        <div id="chart-member-list" class="chart-member-list" role="group" aria-label="Choose a person to inspect"></div>
        <div id="point-detail" class="chart-point-detail" role="status" aria-live="polite" aria-atomic="true">
          <strong id="point-detail-name">User 1</strong>
          <div class="point-detail-values"><span><small>Current contribution</small><strong id="point-detail-paid">¥0</strong></span><span><small>Assigned share</small><strong id="point-detail-share">¥0</strong></span><span><small>Ratio</small><strong id="point-detail-ratio">No expenses yet</strong></span></div>
        </div>
        <div class="playback"><div class="playback-status"><span id="playback-label" class="playback-label">A little geometry. A fairer split.</span><span id="playback-detail">Preview how each transfer brings everyone into balance.</span></div>
          <div class="playback-buttons"><button id="restart-button" class="icon-button" aria-label="Restart preview" title="Restart preview">${icon('restart')}</button><button id="step-button" class="secondary-button" title="Preview the next transfer">${icon('step')}<span>Step</span></button><button id="play-button" class="primary-button">${icon('play')}<span>Play settlement</span></button></div>
        </div>
        <div class="panel-navigation compact-only"><button class="secondary-button" data-view="people" type="button">Back to people</button><button class="primary-button" data-view="plan" type="button">View plan <span aria-hidden="true">--&gt;</span></button></div>
      </section>
    </div>

    <section id="plan-panel" class="panel settlement-panel" data-workspace-view="plan" aria-labelledby="settlement-title">
      <div class="panel-heading"><div><p class="section-step">03 / THE PLAN</p><h2 id="settlement-title">Here's how to settle up.<span id="transfer-count" class="count-badge">0</span></h2></div><div class="export-buttons"><button id="copy-button" class="text-button">${icon('copy')} Copy plan</button><button id="download-button" class="text-button">${icon('download')}<span>Download</span></button></div></div>
      <div id="transfer-list" class="transfer-list"></div>
      <p class="plan-footnote">Previewing transfers updates the diagram. Your inputs stay in this page until you reload or close it.</p>
      <div class="panel-navigation compact-only"><button class="secondary-button" data-view="balance" type="button">Back to balance</button></div>
    </section>
    <footer class="site-footer"><span id="privacy-status"><span class="local-dot"></span>Page only · cleared on reload or close</span><span>Made for shared moments. <span class="footer-version">v${VERSION}</span></span></footer>
  </main>
  <dialog id="help-dialog" aria-labelledby="help-title"><div class="dialog-heading"><p class="eyebrow">A FAIR SHARE, EXPLAINED</p><button id="close-help" class="icon-button" aria-label="Close help">${icon('close')}</button></div><h2 id="help-title">From shared expenses<br>to an even split.</h2>
    <ol class="help-steps"><li><strong>Add your people and payments.</strong><p>Start with three people. Edit any name, enter what they paid, and add more people as needed. On a small screen, use People, Balance, and Plan to move between steps.</p></li><li><strong>See the payment polygon.</strong><p>The dashed polygon marks everyone's fair share. A point at the center means nothing paid; a point past its corner means more than their share. Ratios above 3× are compressed for readability. Tap, click, or focus a point or a person's name below the chart to inspect exact amounts.</p></li><li><strong>Follow the transfer plan.</strong><p>Money flows from people who paid less than their assigned share to people who paid more. Play or step through the preview to watch the shape become balanced. The preview does not send money or record real transfers.</p></li></ol>
    <div class="help-note"><strong>Every yen is accounted for.</strong><p>Amounts use whole yen for JPY, or cents for the other supported currencies. When the total cannot divide evenly, the first people in the list take one extra smallest unit. For ¥100 split three ways, the shares are ¥34, ¥33, and ¥33.</p></div>
    <p class="privacy-note">Your names, amounts, and currency exist only in this open page. Reloading, leaving, or closing it clears them. Copy plan and Download create a copy only when you choose them.</p><button id="help-done" class="primary-button">Got it</button>
  </dialog>
  <div id="toast" class="toast" role="status" hidden></div>
`;

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const money = (amount: number) => formatAmount(amount, draft.currency);
const nameFor = (index: number) => draft.members[index].name.trim() || `User ${index + 1}`;

/** Reflow the same panels so rotation never rebuilds or discards entered data. */
function syncWorkspaceLayout(preserveFocusedView = true): void {
  const wasCompact = compactLayout;
  compactLayout = compactMedia.matches;
  const moveFocusFromTabs = wasCompact && !compactLayout && element('workspace-navigation').contains(document.activeElement);
  if (preserveFocusedView && compactLayout && !wasCompact) {
    const focusedView = document.activeElement?.closest<HTMLElement>('[data-workspace-view]')?.dataset.workspaceView;
    if (isPlaying) activeView = 'balance';
    else if (WORKSPACE_VIEWS.includes(focusedView as WorkspaceView)) activeView = focusedView as WorkspaceView;
  }
  app.dataset.layout = compactLayout ? 'compact' : 'expanded';
  element('workspace-navigation').hidden = !compactLayout;
  const headings = { people: 'people-title', balance: 'visual-title', plan: 'settlement-title' };
  for (const view of WORKSPACE_VIEWS) {
    const panel = element(`${view}-panel`);
    const tab = element<HTMLButtonElement>(`${view}-tab`);
    panel.hidden = compactLayout && activeView !== view;
    panel.setAttribute('aria-labelledby', compactLayout ? `${view}-tab` : headings[view]);
    if (compactLayout) { panel.setAttribute('role', 'tabpanel'); panel.tabIndex = 0; }
    else { panel.setAttribute('role', 'region'); panel.tabIndex = -1; }
    tab.setAttribute('aria-selected', String(activeView === view));
    tab.tabIndex = activeView === view ? 0 : -1;
  }
  if (moveFocusFromTabs) element(`${activeView}-panel`).focus({ preventScroll: true });
}

/** Pause a hidden preview while keeping its inputs and completed transfer prefix. */
function activateView(view: WorkspaceView, focusTab = false, scrollToPanel = false): void {
  if (compactLayout && activeView === 'balance' && view !== 'balance') stopPlayback();
  activeView = view;
  syncWorkspaceLayout();
  renderAnalysis();
  if (focusTab) element(`${view}-tab`).focus();
  if (scrollToPanel && compactLayout) {
    const panel = element(`${view}-panel`);
    if (!focusTab) panel.focus({ preventScroll: true });
    panel.scrollIntoView?.({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
}

function notify(message: string): void {
  clearTimeout(toastTimer);
  element('toast').textContent = message;
  element('toast').hidden = false;
  toastTimer = setTimeout(() => { element('toast').hidden = true; }, 3500);
}

/** Rebuild input rows only for structural changes so typing never loses focus. */
function renderMembers(): void {
  element('people-count').textContent = String(draft.members.length);
  element('member-list').innerHTML = draft.members.map((member, index) => `
    <div class="member-row" data-member-id="${escapeHtml(member.id)}">
      <div class="member-fields"><span class="member-avatar" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
        <input class="name-input" data-field="name" type="text" maxlength="40" value="${escapeHtml(member.name)}" placeholder="User ${index + 1}" aria-label="User ${index + 1} name" autocomplete="off" spellcheck="false" />
        <div class="amount-field"><span class="amount-label" aria-hidden="true">Paid</span><span class="amount-currency" aria-hidden="true">${CURRENCIES[draft.currency].symbol}</span><input class="amount-input" data-field="amount" type="text" inputmode="${draft.currency === 'JPY' ? 'numeric' : 'decimal'}" maxlength="32" value="${escapeHtml(member.amount)}" placeholder="0" aria-label="${escapeHtml(nameFor(index))} paid amount" aria-describedby="member-error-${index}" autocomplete="off" spellcheck="false" /></div>
        <button class="remove-button icon-button" data-remove="${escapeHtml(member.id)}" aria-label="Remove ${escapeHtml(nameFor(index))}" title="${draft.members.length <= 3 ? 'At least 3 people are required' : 'Remove this person'}"${draft.members.length <= 3 ? ' disabled' : ''}>${icon('close')}</button>
      </div><div class="member-detail"><span data-member-status="${index}">Fair share ${money(0)}</span><span id="member-error-${index}" class="field-error" hidden></span></div>
    </div>`).join('');
}

function stopPlayback(): void {
  clearTimeout(playbackTimer);
  playbackTimer = undefined;
  isPlaying = false;
}

/** Clear inputs, derived data, and pending work when a page leaves or reopens. */
function resetPageState(): void {
  stopPlayback();
  clearTimeout(toastTimer);
  toastTimer = undefined;
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  for (const [url, timer] of downloadTimers) {
    clearTimeout(timer);
    URL.revokeObjectURL(url);
  }
  downloadTimers.clear();
  draft = createInitialDraft();
  settlement = null;
  completed = 0;
  previousGeometry = null;
  activeView = 'people';
  selectedMemberId = null;
  element<HTMLSelectElement>('currency-select').value = draft.currency;
  element('toast').textContent = '';
  element('toast').hidden = true;
  if (help.open) help.close();
  syncWorkspaceLayout(false);
  renderMembers();
  updateFromInputs();
}

/** Recalculate from the draft, discarding previews whenever original inputs change. */
function updateFromInputs(): void {
  stopPlayback();
  completed = 0;
  const errors = new Map<number, string>();
  const parsed = draft.members.map((member, index) => {
    try {
      return { id: member.id, name: nameFor(index), paid: parseAmount(member.amount, draft.currency) };
    } catch {
      errors.set(index, draft.currency === 'JPY'
        ? 'Enter a nonnegative whole yen amount.'
        : 'Enter a nonnegative amount with up to 2 decimal places.');
      return { id: member.id, name: nameFor(index), paid: 0 };
    }
  });
  let errorMessage = errors.size ? 'Check the highlighted payment amounts to calculate your plan.' : '';
  try {
    settlement = errors.size ? null : calculateSettlement(parsed);
  } catch {
    settlement = null;
    errorMessage = 'The total is too large. Use smaller amounts to keep every unit exact.';
  }
  draft.members.forEach((_, index) => {
    const row = element('member-list').children[index];
    const errorElement = element(`member-error-${index}`);
    errorElement.hidden = !errors.has(index);
    errorElement.textContent = errors.get(index) ?? '';
    row.querySelector('input[data-field="amount"]')?.setAttribute('aria-invalid', String(errors.has(index)));
    row.classList.toggle('has-error', errors.has(index));
    const input = row.querySelector<HTMLInputElement>('input[data-field="amount"]');
    if (input) input.setAttribute('aria-label', `${nameFor(index)} paid amount`);
    const removeButton = row.querySelector<HTMLButtonElement>('[data-remove]');
    if (removeButton) removeButton.setAttribute('aria-label', `Remove ${nameFor(index)}`);
  });
  element('validation-message').hidden = !errorMessage;
  element('validation-message').textContent = errorMessage;
  renderAnalysis();
}

/** The plan always refers to original payments; the completed prefix only drives its preview. */
function renderAnalysis(animate = false): void {
  const plan = settlement;
  const valid = plan !== null;
  const total = plan?.total ?? 0;
  const effective = plan ? applyTransfers(plan, completed) : draft.members.map(() => 0);
  const remaining = plan ? plan.transfers.slice(completed).reduce((sum, transfer) => sum + transfer.amount, 0) : 0;
  const fullyPreviewed = Boolean(plan && plan.transfers.length > 0 && completed === plan.transfers.length);
  const alreadyBalanced = Boolean(plan && total > 0 && plan.transfers.length === 0);
  element('total-value').textContent = valid ? money(total) : '—';
  element('total-caption').textContent = `Across ${draft.members.length} people`;
  element('share-value').textContent = !plan ? '—' : plan.remainder
    ? `${money(plan.baseShare)}–${money(plan.baseShare + 1)}` : money(plan.baseShare);
  element('share-caption').textContent = plan?.remainder
    ? `First ${plan.remainder} ${plan.remainder === 1 ? 'person takes' : 'people take'} ${money(1)} extra`
    : `Split equally, down to the ${draft.currency === 'JPY' ? 'yen' : 'cent'}`;
  element('remaining-value').textContent = valid ? money(remaining) : '—';
  element('remaining-caption').textContent = !valid ? 'Check your payment amounts' : !total ? 'Enter payments to get started'
    : fullyPreviewed ? 'Preview complete · everyone is even' : alreadyBalanced ? 'Everyone is already even'
      : `${plan!.transfers.length - completed} ${plan!.transfers.length - completed === 1 ? 'transfer' : 'transfers'} ${completed ? 'left in this preview' : 'to make things even'}`;
  element('balance-badge').textContent = !valid ? 'Check amounts' : !total ? 'Waiting for payments' : fullyPreviewed || alreadyBalanced ? 'Everyone is even' : completed ? 'Settling up' : 'Ready to settle';
  element('balance-badge').classList.toggle('is-balanced', fullyPreviewed || alreadyBalanced);
  draft.members.forEach((_, index) => {
    const status = document.querySelector<HTMLElement>(`[data-member-status="${index}"]`)!;
    if (!plan) { status.textContent = 'Waiting for valid amounts'; return; }
    const member = plan.members[index];
    const balance = member.paid - member.share;
    status.textContent = `Share ${money(member.share)} · ${balance > 0 ? `gets back ${money(balance)}` : balance < 0 ? `owes ${money(-balance)}` : 'even'}`;
  });
  renderGraph(effective, animate);
  renderTransfers();
  element<HTMLButtonElement>('restart-button').disabled = !completed && !isPlaying;
  element<HTMLButtonElement>('step-button').disabled = !plan?.transfers.length || fullyPreviewed || isPlaying;
  element<HTMLButtonElement>('play-button').disabled = !plan?.transfers.length;
  element('play-button').innerHTML = `${icon(isPlaying ? 'pause' : 'play')}<span>${isPlaying ? 'Pause' : fullyPreviewed ? 'Replay settlement' : 'Play settlement'}</span>`;
  const current = completed && plan ? plan.transfers[completed - 1] : null;
  const membersById = new Map(plan?.members.map((member) => [member.id, member]));
  element('playback-label').textContent = current
    ? `${membersById.get(current.fromId)!.name} --> ${membersById.get(current.toId)!.name} · ${money(current.amount)}`
    : alreadyBalanced ? 'Everyone has paid their fair share.' : 'A little geometry. A fairer split.';
  element('playback-detail').textContent = fullyPreviewed ? 'Preview complete. Follow the plan below to make the real transfers.'
    : completed ? `Transfer ${completed} of ${plan!.transfers.length} previewed${isPlaying ? ' · playing' : ''}.`
      : 'Preview how each transfer brings everyone into balance.';
  element<HTMLButtonElement>('copy-button').disabled = !plan || !total;
  element<HTMLButtonElement>('download-button').disabled = !plan || !total;
}

const pointString = (point: Point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`;
const interpolate = (from: Point, to: Point, progress: number): Point => ({
  x: from.x + (to.x - from.x) * progress,
  y: from.y + (to.y - from.y) * progress,
});

/** Expose exact amounts in readable HTML for touch, keyboard, and overlapping points. */
function renderPointDetails(effective = settlement ? applyTransfers(settlement, completed) : []): void {
  let index = draft.members.findIndex((member) => member.id === selectedMemberId);
  if (index < 0) index = 0;
  selectedMemberId = draft.members[index].id;
  const member = settlement?.members[index];
  const paid = effective[index] ?? 0;
  element('point-detail-name').textContent = nameFor(index);
  element('point-detail-paid').textContent = member ? money(paid) : '—';
  element('point-detail-share').textContent = member ? money(member.share) : '—';
  element('point-detail-ratio').textContent = !member ? 'Check amounts' : !settlement!.total ? 'No expenses yet'
    : member.share === 0 ? paid === 0 ? 'Even (zero share)' : 'No assigned share'
      : `${(paid / member.share).toFixed(2)}×`;
  element('chart-member-list').querySelectorAll<HTMLButtonElement>('[data-member-id]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.memberId === selectedMemberId));
  });
  element('polygon-chart').querySelectorAll<SVGGElement>('[data-node]').forEach((node) => {
    node.setAttribute('aria-pressed', String(Number(node.dataset.node) === index));
  });
}

/** Animate SVG coordinates, preserving the regular reference polygon as its scale changes. */
function renderGraph(effective: number[], animate: boolean): void {
  cancelAnimationFrame(animationFrame);
  const focusedElement = document.activeElement as Element | null;
  const focusedNode = focusedElement?.closest<SVGGElement>('[data-node]')?.dataset.node;
  const focusedMember = focusedElement?.closest<HTMLButtonElement>('.chart-member-button')?.dataset.memberId;
  const members = settlement?.members ?? draft.members.map((member, index) => ({ ...member, name: nameFor(index), share: 0 }));
  const geometry = createPolygonGeometry(members, effective, settlement?.total ?? 0);
  const previous = previousGeometry;
  previousGeometry = geometry;
  const hasExpenses = Boolean(settlement?.total);
  const centered = geometry.nodes.filter((node) => Math.hypot(node.actual.x - 300, node.actual.y - 270) < 0.01).length;
  const dense = members.length > 12;
  const compactChart = compactLayout || coarsePointerMedia.matches || (chartAvailableWidth > 0 && chartAvailableWidth < 520);
  const renderedWidth = chartWidth || Math.max(240, Math.min(600, window.innerWidth - 32));
  const unitsPerPixel = (compactChart ? 470 : 600) / renderedWidth;
  const dotRadius = 10 * unitsPerPixel;
  const pointFontSize = 12 * unitsPerPixel;
  const hitRadius = 24 * unitsPerPixel;
  const labelRadius = compactChart ? 214 : 229;
  element('polygon-chart').classList.toggle('is-compact-chart', compactChart);
  element('polygon-chart').innerHTML = `<svg id="balance-svg" viewBox="${compactChart ? '65 35 470 470' : '0 0 600 540'}" preserveAspectRatio="xMidYMid meet" role="group" aria-labelledby="chart-title chart-description">
    <title id="chart-title">Payment balance polygon</title><desc id="chart-description">${escapeHtml(!hasExpenses ? 'No payments entered. Everyone starts at the center.' : `A ${members.length}-person polygon. Dashed corners show each fair share. ${completed} of ${settlement?.transfers.length} transfers previewed.`)}</desc>
    <defs><pattern id="dot-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="0.6" cy="0.6" r="0.65" fill="#dfdfdf"/></pattern></defs>
    <rect x="56" y="28" width="488" height="484" fill="url(#dot-grid)" opacity="0.55"/>
    <g class="chart-rays">${geometry.nodes.map((node) => { const dx = node.target.x - 300; const dy = node.target.y - 270; const length = Math.hypot(dx, dy); return `<line x1="300" y1="270" x2="${300 + dx / length * 203}" y2="${270 + dy / length * 203}"/>`; }).join('')}</g>
    <polygon id="half-polygon" points="${geometry.nodes.map((node) => pointString(interpolate(geometry.center, node.target, 0.5))).join(' ')}" fill="none" stroke="#e6e6e6" stroke-width="1"/>
    <polygon id="target-polygon" points="${geometry.targetPoints}" class="target-polygon"/>
    <polygon id="actual-polygon" points="${geometry.actualPoints}" class="actual-polygon"/>
    <circle cx="300" cy="270" r="2.5" fill="#a3a3a3"/>
    ${geometry.nodes.map((node, index) => {
      const angle = -Math.PI / 2 + 2 * Math.PI * index / geometry.nodes.length;
      const labelX = 300 + Math.cos(angle) * labelRadius;
      const labelY = 270 + Math.sin(angle) * labelRadius;
      const label = dense || compactChart ? `${index + 1}` : node.name.length > 10 ? `${node.name.slice(0, 8)}…` : node.name;
      const ratioText = !hasExpenses ? 'No payment' : node.zeroShare ? 'Share: 0' : `${node.ratio.toFixed(2)}× of share`;
      const atCenter = Math.hypot(node.actual.x - 300, node.actual.y - 270) < 0.01;
      const tooltip = `${node.name}: contribution ${money(Math.round(effective[index]))}; fair share ${money(members[index].share)}; ${ratioText}${node.compressed ? '; display compressed' : ''}`;
      return `<circle data-target="${index}" cx="${node.target.x}" cy="${node.target.y}" r="4" class="target-dot"/>
        <text x="${labelX}" y="${labelY}" text-anchor="middle" class="node-name"${compactChart ? ` style="font-size:${13 * unitsPerPixel}px"` : ''}>${escapeHtml(label)}</text>
        ${dense || compactChart ? '' : `<text x="${labelX}" y="${labelY + 17}" text-anchor="middle" class="node-ratio">${escapeHtml(ratioText)}</text>`}
        <g data-node="${index}" transform="translate(${node.actual.x} ${node.actual.y})" class="chart-node" tabindex="0" role="button" aria-controls="point-detail" aria-pressed="false" aria-label="${escapeHtml(tooltip)}"><title>${escapeHtml(tooltip)}</title><circle class="node-hit-area" r="${hitRadius}"/><circle class="node-dot" r="${dotRadius}"/><text style="font-size:${pointFontSize}px" text-anchor="middle" dominant-baseline="central"${atCenter && centered > 1 ? ' opacity="0"' : ''}>${index + 1}</text></g>`;
    }).join('')}
    ${centered > 1 ? `<g class="center-count" transform="translate(300 270)"><circle r="${dotRadius + 2 * unitsPerPixel}"/><text style="font-size:${pointFontSize}px" text-anchor="middle" dominant-baseline="central">${centered}</text><title>${centered} people have zero contribution at the center. Use the member buttons to inspect each person.</title></g>` : ''}
  </svg>`;
  element('chart-member-list').innerHTML = members.map((member, index) => `<button type="button" class="chart-member-button" data-member-id="${escapeHtml(member.id)}" aria-controls="point-detail" aria-pressed="false"><span class="chart-member-number" aria-hidden="true">${index + 1}</span><span class="chart-member-name">${escapeHtml(member.name)}</span></button>`).join('');
  renderPointDetails(effective);
  if (focusedNode !== undefined) element('polygon-chart').querySelector<SVGGElement>(`[data-node="${focusedNode}"]`)?.focus();
  if (focusedMember) Array.from(element('chart-member-list').querySelectorAll<HTMLButtonElement>('[data-member-id]')).find((button) => button.dataset.memberId === focusedMember)?.focus();
  const compressed = geometry.nodes.some((node) => node.compressed);
  element('graph-note').textContent = !hasExpenses ? 'Enter payments to bring the polygon to life. Each person has their own corner.'
    : compressed ? 'Large ratios are compressed above 3× for display. Exact amounts stay unchanged.'
      : dense || compactChart ? 'Numbers match the names below. Select a point or a person to inspect exact amounts.'
        : 'Inside a corner: paid less. Outside a corner: paid more. Select a person to inspect exact amounts.';
  if (!animate || !previous || previous.nodes.length !== geometry.nodes.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const started = performance.now();
  const nodes = geometry.nodes.map((_, index) => document.querySelector<SVGGElement>(`[data-node="${index}"]`)!);
  const targets = geometry.nodes.map((_, index) => document.querySelector<SVGCircleElement>(`[data-target="${index}"]`)!);
  const actualPolygon = document.getElementById('actual-polygon')!;
  const targetPolygon = document.getElementById('target-polygon')!;
  const halfPolygon = document.getElementById('half-polygon')!;
  const frame = (now: number) => {
    const progress = Math.min(1, (now - started) / 650);
    const eased = 1 - (1 - progress) ** 3;
    const actual: Point[] = [];
    const target: Point[] = [];
    geometry.nodes.forEach((node, index) => {
      actual.push(interpolate(previous.nodes[index].actual, node.actual, eased));
      target.push(interpolate(previous.nodes[index].target, node.target, eased));
      nodes[index].setAttribute('transform', `translate(${actual[index].x} ${actual[index].y})`);
      targets[index].setAttribute('cx', String(target[index].x));
      targets[index].setAttribute('cy', String(target[index].y));
    });
    actualPolygon.setAttribute('points', actual.map(pointString).join(' '));
    targetPolygon.setAttribute('points', target.map(pointString).join(' '));
    halfPolygon.setAttribute('points', target.map((point) => pointString(interpolate(geometry.center, point, 0.5))).join(' '));
    if (progress < 1) animationFrame = requestAnimationFrame(frame);
  };
  animationFrame = requestAnimationFrame(frame);
}

/** Display the original transfer plan together with its current preview progress. */
function renderTransfers(): void {
  const plan = settlement;
  element('transfer-count').textContent = String(plan?.transfers.length ?? 0);
  const byId = new Map(plan?.members.map((member) => [member.id, member]));
  element('transfer-list').innerHTML = !plan
    ? '<div class="empty-state"><span class="empty-symbol" aria-hidden="true">—</span><div><strong>A valid amount makes a good start.</strong><p>Check your payments above to see the settlement plan.</p></div></div>'
    : !plan.total ? '<div class="empty-state"><span class="empty-symbol" aria-hidden="true">↔</span><div><strong>Your next outing starts here.</strong><p>Add everyone\'s payments above. We\'ll work out the rest.</p></div></div>'
      : !plan.transfers.length ? '<div class="empty-state"><span class="empty-symbol" aria-hidden="true">✓</span><div><strong>Everyone is already even.</strong><p>Each person has paid their assigned share. No transfers needed.</p></div></div>'
        : plan.transfers.map((transfer, index) => `<div class="transfer-row${index < completed ? ' is-previewed' : ''}${index === completed - 1 ? ' is-current' : ''}"><span class="transfer-index">${String(index + 1).padStart(2, '0')}</span><div class="transfer-route"><span>${escapeHtml(byId.get(transfer.fromId)!.name)}</span><span class="transfer-arrow" aria-label="pays">--&gt;</span><span>${escapeHtml(byId.get(transfer.toId)!.name)}</span></div><strong class="transfer-amount">${money(transfer.amount)}</strong><span class="transfer-status">${index < completed ? 'Previewed' : 'To pay'}</span></div>`).join('');
}

/** Schedule one preview step at a time so edits, pause, and restart can cancel it. */
function scheduleNext(): void {
  playbackTimer = setTimeout(() => {
    if (!isPlaying || !settlement) return;
    completed += 1;
    if (completed >= settlement.transfers.length) stopPlayback();
    renderAnalysis(true);
    if (isPlaying) scheduleNext();
  }, 1200);
}

/** Export the exact original plan, independent of the current simulation position. */
function exportPlan(): string {
  if (!settlement) return '';
  const byId = new Map(settlement.members.map((member) => [member.id, member]));
  const lines = [
    `How much should I pay? v${VERSION}`,
    `Currency: ${draft.currency}`,
    `Total spent: ${money(settlement.total)}`,
    `People: ${settlement.members.length}`,
    '', 'Payments and assigned shares',
    ...settlement.members.map((member, index) => `${index + 1}. ${member.name}: paid ${money(member.paid)}; share ${money(member.share)}`),
    '', 'Settlement plan',
    ...settlement.transfers.map((transfer, index) => `${index + 1}. ${byId.get(transfer.fromId)!.name} --> ${byId.get(transfer.toId)!.name}: ${money(transfer.amount)}`),
    ...(settlement.transfers.length ? [] : ['Everyone is already even. No transfers needed.']),
    '', 'Shares use integer smallest currency units. Any remainder goes to the first people in the list.',
    'This is a suggested plan. Previewing it does not send money or record real transfers.',
  ];
  return lines.join('\n');
}

element('member-list').addEventListener('input', (event) => {
  const input = event.target as HTMLInputElement;
  const row = input.closest<HTMLElement>('[data-member-id]');
  const member = draft.members.find((entry) => entry.id === row?.dataset.memberId);
  if (!member) return;
  if (input.dataset.field === 'name') member.name = input.value;
  if (input.dataset.field === 'amount') member.amount = input.value;
  updateFromInputs();
});
element('member-list').addEventListener('focusin', (event) => {
  const input = event.target as HTMLInputElement;
  if (input.dataset.field === 'amount' && input.value === '0') input.select();
});
element('member-list').addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-remove]');
  if (!button || draft.members.length <= 3) return;
  const index = draft.members.findIndex((member) => member.id === button.dataset.remove);
  if (index < 0) return;
  draft.members.splice(index, 1);
  renderMembers(); updateFromInputs();
  element('member-list').children[Math.min(index, draft.members.length - 1)].querySelector<HTMLInputElement>('input')?.focus();
});
element('add-button').addEventListener('click', () => {
  draft.members.push(newMember(draft.members.length + 1));
  renderMembers(); updateFromInputs();
  element('member-list').lastElementChild?.querySelector<HTMLInputElement>('input')?.focus();
});
element('clear-button').addEventListener('click', () => {
  draft.members.forEach((member) => { member.amount = '0'; });
  renderMembers(); updateFromInputs(); notify('Payments cleared. Your people are still here.');
});
element('example-button').addEventListener('click', () => {
  draft.currency = 'JPY';
  draft.members = ['Alex', 'Sam', 'Jordan'].map((name, index) => ({
    id: createMemberId(), name, amount: ['9000', '3000', '0'][index],
  }));
  element<HTMLSelectElement>('currency-select').value = draft.currency;
  renderMembers(); updateFromInputs(); notify('Example loaded: a ¥12,000 outing, split three ways.');
});
element('currency-select').addEventListener('change', (event) => {
  draft.currency = (event.target as HTMLSelectElement).value as CurrencyCode;
  renderMembers(); updateFromInputs();
  notify(`Currency changed to ${draft.currency}. Entered numbers were kept; no conversion applied.`);
});

app.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-view]');
  if (!button || !WORKSPACE_VIEWS.includes(button.dataset.view as WorkspaceView)) return;
  activateView(button.dataset.view as WorkspaceView, button.classList.contains('workspace-tab'), true);
});
element('workspace-navigation').addEventListener('keydown', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[role="tab"]');
  if (!button) return;
  const index = WORKSPACE_VIEWS.indexOf(button.dataset.view as WorkspaceView);
  const destinations: Record<string, number> = {
    ArrowLeft: (index + WORKSPACE_VIEWS.length - 1) % WORKSPACE_VIEWS.length,
    ArrowRight: (index + 1) % WORKSPACE_VIEWS.length,
    Home: 0,
    End: WORKSPACE_VIEWS.length - 1,
  };
  if (!Object.hasOwn(destinations, event.key)) return;
  event.preventDefault();
  activateView(WORKSPACE_VIEWS[destinations[event.key]], true, true);
});

/** Selecting a chart point never changes payment inputs or preview progress. */
function inspectMember(id: string): void {
  if (!draft.members.some((member) => member.id === id)) return;
  selectedMemberId = id;
  renderPointDetails();
}
const inspectChartEvent = (event: Event) => {
  const node = (event.target as Element).closest<SVGGElement>('[data-node]');
  const member = node ? draft.members[Number(node.dataset.node)] : null;
  if (member) inspectMember(member.id);
};
element('polygon-chart').addEventListener('click', inspectChartEvent);
element('polygon-chart').addEventListener('focusin', inspectChartEvent);
element('polygon-chart').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  inspectChartEvent(event);
});
for (const eventName of ['click', 'focusin']) {
  element('chart-member-list').addEventListener(eventName, (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-member-id]');
    if (button?.dataset.memberId) inspectMember(button.dataset.memberId);
  });
}

element('step-button').addEventListener('click', () => {
  if (!settlement || completed >= settlement.transfers.length) return;
  stopPlayback(); completed += 1; renderAnalysis(true);
});
element('restart-button').addEventListener('click', () => {
  stopPlayback(); completed = 0; renderAnalysis(true);
});
element('play-button').addEventListener('click', () => {
  if (!settlement?.transfers.length) return;
  if (isPlaying) { stopPlayback(); renderAnalysis(); return; }
  if (completed === settlement.transfers.length) completed = 0;
  isPlaying = true; renderAnalysis(true); scheduleNext();
});
element('copy-button').addEventListener('click', () => {
  const copy = async () => {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.');
    await navigator.clipboard.writeText(exportPlan());
    notify('Settlement plan copied.');
  };
  void copy().catch(() => {
    notify('Clipboard access is unavailable. Use Download to save the plan.');
  });
});
element('download-button').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([exportPlan()], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `settlement-plan-${draft.currency.toLowerCase()}.txt`;
  link.click();
  downloadTimers.set(url, setTimeout(() => {
    URL.revokeObjectURL(url);
    downloadTimers.delete(url);
  }, 1000));
  notify('Settlement plan downloaded.');
});
const help = element<HTMLDialogElement>('help-dialog');
element('help-button').addEventListener('click', () => help.showModal());
element('close-help').addEventListener('click', () => help.close());
element('help-done').addEventListener('click', () => help.close());
help.addEventListener('click', (event) => { if (event.target === help) { const bounds = help.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) help.close(); } });

compactMedia.addEventListener('change', () => {
  syncWorkspaceLayout();
  renderAnalysis();
});
coarsePointerMedia.addEventListener('change', () => renderAnalysis());

// Use the available chart width, including tablet split views, to keep labels readable.
if (typeof ResizeObserver !== 'undefined') {
  const chartObserver = new ResizeObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const width = entry.contentRect.width;
      if (width <= 0) continue;
      if (entry.target.id === 'balance-panel' && Math.abs(width - chartAvailableWidth) >= 1) {
        chartAvailableWidth = width;
        changed = true;
      }
      if (entry.target.id === 'polygon-chart' && Math.abs(width - chartWidth) >= 1) {
        chartWidth = width;
        changed = true;
      }
    }
    if (!changed) return;
    renderGraph(settlement ? applyTransfers(settlement, completed) : draft.members.map(() => 0), false);
  });
  chartObserver.observe(element('balance-panel'));
  chartObserver.observe(element('polygon-chart'));
}

// Page lifecycle events also cover documents restored from the back-forward cache.
window.addEventListener('pagehide', resetPageState);
window.addEventListener('pageshow', resetPageState);
resetPageState();
