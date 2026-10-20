// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const LEGACY_STORAGE_KEY = 'how-much-should-i-pay:draft:v1';
const COMPACT_QUERY = '(max-width: 767px), (max-width: 1199px) and (max-height: 520px)';
const POINTER_QUERY = '(pointer: coarse)';
type WorkspaceView = 'people' | 'balance' | 'plan';
let nextId = 0;
let writeClipboard = vi.fn<(text: string) => Promise<void>>();
let compactViewport = false;
let coarsePointer = false;
const mediaQueries = new Map<string, ControlledMediaQueryList>();
const lifecycleListeners: {
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
}[] = [];

/** Model media query changes without making claims about jsdom's CSS layout. */
class ControlledMediaQueryList extends EventTarget {
  readonly media: string;
  matches: boolean;
  onchange: ((event: MediaQueryListEvent) => void) | null = null;

  constructor(media: string, matches: boolean) {
    super();
    this.media = media;
    this.matches = matches;
  }

  addListener(listener: EventListener): void {
    this.addEventListener('change', listener);
  }

  removeListener(listener: EventListener): void {
    this.removeEventListener('change', listener);
  }

  setMatches(matches: boolean): void {
    if (this.matches === matches) return;
    this.matches = matches;
    const event = new Event('change') as MediaQueryListEvent;
    Object.defineProperties(event, {
      matches: { value: matches },
      media: { value: this.media },
    });
    this.dispatchEvent(event);
    this.onchange?.(event);
  }
}

function mediaQuery(query: string): ControlledMediaQueryList {
  let result = mediaQueries.get(query);
  if (!result) {
    const matches = query === COMPACT_QUERY ? compactViewport
      : query === POINTER_QUERY ? coarsePointer
        : query.includes('prefers-reduced-motion');
    result = new ControlledMediaQueryList(query, matches);
    mediaQueries.set(query, result);
  }
  return result;
}

function setCompactViewport(matches: boolean): void {
  compactViewport = matches;
  mediaQuery(COMPACT_QUERY).setMatches(matches);
}

function setCoarsePointer(matches: boolean): void {
  coarsePointer = matches;
  mediaQuery(POINTER_QUERY).setMatches(matches);
}

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing app element: ${id}`);
  return element as T;
}

function inputs(field: 'name' | 'amount'): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-field="${field}"]`));
}

function enter(field: 'name' | 'amount', index: number, value: string): void {
  const input = inputs(field)[index];
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function changeCurrency(currency: string): void {
  const select = getElement<HTMLSelectElement>('currency-select');
  select.value = currency;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function click(id: string): void {
  getElement<HTMLButtonElement>(id).click();
}

function workspaceTab(view: WorkspaceView): HTMLButtonElement {
  const tab = document.querySelector<HTMLButtonElement>(`.workspace-tab[data-view="${view}"]`);
  if (!tab) throw new Error(`Missing workspace tab: ${view}`);
  return tab;
}

function selectView(view: WorkspaceView): void {
  workspaceTab(view).click();
}

function expectCompactView(view: WorkspaceView): void {
  expect(getElement('workspace-navigation').hidden).toBe(false);
  for (const candidate of ['people', 'balance', 'plan'] as const) {
    const tab = workspaceTab(candidate);
    const panel = getElement(`${candidate}-panel`);
    expect(tab.getAttribute('aria-selected')).toBe(String(candidate === view));
    expect(tab.tabIndex).toBe(candidate === view ? 0 : -1);
    expect(panel.hidden).toBe(candidate !== view);
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
    expect(tab.getAttribute('aria-controls')).toBe(panel.id);
  }
}

function chartMember(index: number): HTMLButtonElement {
  const button = document.querySelectorAll<HTMLButtonElement>('.chart-member-button[data-member-id]')[index];
  if (!button) throw new Error(`Missing chart member button: ${index}`);
  return button;
}

function svgMember(index: number): SVGGElement {
  const node = document.querySelector<SVGGElement>(`g[data-node="${index}"]`);
  if (!node) throw new Error(`Missing chart node: ${index}`);
  return node;
}

function transferPlan(): { route: string; amount: string }[] {
  return Array.from(document.querySelectorAll('.transfer-row')).map((row) => ({
    route: row.querySelector('.transfer-route')!.textContent!,
    amount: row.querySelector('.transfer-amount')!.textContent!,
  }));
}

function previewedCount(): number {
  return Array.from(document.querySelectorAll('.transfer-status'))
    .filter((status) => status.textContent === 'Previewed').length;
}

function removeLifecycleListeners(): void {
  for (const { type, listener, options } of lifecycleListeners) {
    window.removeEventListener(type, listener, options);
  }
  lifecycleListeners.length = 0;
}

function expectFreshApp(): void {
  expect(inputs('name').map((input) => input.value)).toEqual(['User 1', 'User 2', 'User 3']);
  expect(inputs('amount').map((input) => input.value)).toEqual(['0', '0', '0']);
  expect(getElement<HTMLSelectElement>('currency-select').value).toBe('JPY');
  expect(getElement('total-value').textContent).toBe('¥0');
  expect(getElement('total-caption').textContent).toBe('Across 3 people');
  expect(getElement('remaining-value').textContent).toBe('¥0');
  expect(transferPlan()).toEqual([]);
  expect(previewedCount()).toBe(0);
  expect(getElement<HTMLButtonElement>('play-button').disabled).toBe(true);
  expect(getElement<HTMLButtonElement>('copy-button').disabled).toBe(true);
  expect(getElement<HTMLButtonElement>('download-button').disabled).toBe(true);
  expect(getElement('validation-message').hidden).toBe(true);
  expect(getElement('actual-polygon').getAttribute('points')).toBe('300,270 300,270 300,270');
}

/** Reload the app module against a fresh document and discard old test listeners. */
async function boot(): Promise<void> {
  vi.clearAllTimers();
  removeLifecycleListeners();
  mediaQueries.clear();
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  await import('../src/main');
}

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  nextId = 0;
  compactViewport = false;
  coarsePointer = false;
  writeClipboard = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  vi.stubGlobal('crypto', { randomUUID: () => `test-member-${++nextId}` });
  vi.stubGlobal('matchMedia', vi.fn((query: string) => mediaQuery(query)));
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const addWindowListener = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'pagehide' || type === 'pageshow' || type === 'resize') {
      lifecycleListeners.push({ type, listener, options });
    }
    addWindowListener(type, listener, options);
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: writeClipboard },
  });
  await boot();
});

afterEach(() => {
  removeLifecycleListeners();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('expense splitting interface', () => {
  it('starts with three editable people, JPY, and an empty plan', () => {
    expect(inputs('name').map((input) => input.value)).toEqual(['User 1', 'User 2', 'User 3']);
    expect(inputs('amount').map((input) => input.value)).toEqual(['0', '0', '0']);
    expect(getElement<HTMLSelectElement>('currency-select').value).toBe('JPY');
    expect(getElement('total-value').textContent).toBe('¥0');
    expect(getElement('total-caption').textContent).toBe('Across 3 people');
    expect(document.querySelector('.version')?.textContent).toBe('v0.3.0');
    expect(getElement('privacy-status').textContent).toBe('Page only · cleared on reload or close');
    expect(getElement('transfer-list').textContent).toContain('Your next outing starts here.');
    expect(getElement<HTMLButtonElement>('step-button').disabled).toBe(true);
    expect(getElement<HTMLButtonElement>('play-button').disabled).toBe(true);
    expect(getElement<HTMLButtonElement>('copy-button').disabled).toBe(true);
    expect(Array.from(document.querySelectorAll<HTMLButtonElement>('[data-remove]')).every((button) => button.disabled)).toBe(true);
  });

  it('adds, renames, and removes people while enforcing the three-person minimum', () => {
    click('add-button');
    expect(inputs('name')).toHaveLength(4);
    expect(inputs('name')[3].value).toBe('User 4');
    expect(document.activeElement).toBe(inputs('name')[3]);

    enter('name', 3, 'Taylor');
    enter('amount', 3, '100');
    expect(getElement('total-value').textContent).toBe('¥100');
    expect(document.querySelector<HTMLButtonElement>('[aria-label="Remove Taylor"]')?.disabled).toBe(false);
    document.querySelector<HTMLButtonElement>('[aria-label="Remove Taylor"]')!.click();

    expect(inputs('name')).toHaveLength(3);
    expect(getElement('total-value').textContent).toBe('¥0');
    const remove = document.querySelector<HTMLButtonElement>('[data-remove]')!;
    expect(remove.disabled).toBe(true);
    remove.click();
    expect(inputs('name')).toHaveLength(3);
  });

  it('creates valid members when plain HTTP does not provide randomUUID', async () => {
    let randomSequence = 0;
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(++randomSequence);
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });
    localStorage.clear();
    await boot();

    expect(inputs('name')).toHaveLength(3);
    enter('amount', 0, '100');
    expect(getElement('total-value').textContent).toBe('¥100');
    click('add-button');
    enter('amount', 3, '100');
    expect(inputs('name')).toHaveLength(4);
    expect(getElement('total-value').textContent).toBe('¥200');
    expect(getElement('share-value').textContent).toBe('¥50');
    expect(getElement('validation-message').hidden).toBe(true);

    click('example-button');
    expect(inputs('name').map((input) => input.value)).toEqual(['Alex', 'Sam', 'Jordan']);
    expect(getElement('total-value').textContent).toBe('¥12,000');
    expect(transferPlan()).toEqual([
      { route: 'Sam-->Alex', amount: '¥1,000' },
      { route: 'Jordan-->Alex', amount: '¥4,000' },
    ]);
    expect(getRandomValues).toHaveBeenCalled();
    expect(getElement<HTMLButtonElement>('play-button').disabled).toBe(false);
  });

  it('renders edited labels as text and provides a fallback for blank names', () => {
    click('example-button');
    enter('name', 1, '<b>Sam & friends</b>');
    expect(transferPlan()[0].route).toBe('<b>Sam & friends</b>-->Alex');
    expect(document.querySelector('.transfer-route b')).toBeNull();
    expect(document.querySelector('#polygon-chart b')).toBeNull();

    enter('name', 1, '   ');
    expect(transferPlan()[0].route).toBe('User 2-->Alex');
    expect(inputs('amount')[1].getAttribute('aria-label')).toBe('User 2 paid amount');
  });

  it('calculates the example as an exact two-transfer plan', () => {
    click('example-button');

    expect(inputs('name').map((input) => input.value)).toEqual(['Alex', 'Sam', 'Jordan']);
    expect(inputs('amount').map((input) => input.value)).toEqual(['9000', '3000', '0']);
    expect(getElement('total-value').textContent).toBe('¥12,000');
    expect(getElement('share-value').textContent).toBe('¥4,000');
    expect(getElement('remaining-value').textContent).toBe('¥5,000');
    expect(transferPlan()).toEqual([
      { route: 'Sam-->Alex', amount: '¥1,000' },
      { route: 'Jordan-->Alex', amount: '¥4,000' },
    ]);
    expect(getElement('balance-badge').textContent).toBe('Ready to settle');
  });

  it('steps through transfers and restarts without changing entered payments', () => {
    click('example-button');
    const initialPolygon = getElement('actual-polygon').getAttribute('points');
    click('step-button');

    expect(previewedCount()).toBe(1);
    expect(getElement('remaining-value').textContent).toBe('¥4,000');
    expect(getElement('playback-label').textContent).toBe('Sam --> Alex · ¥1,000');
    expect(getElement('actual-polygon').getAttribute('points')).not.toBe(initialPolygon);
    expect(inputs('amount').map((input) => input.value)).toEqual(['9000', '3000', '0']);

    click('restart-button');
    expect(previewedCount()).toBe(0);
    expect(getElement('remaining-value').textContent).toBe('¥5,000');
    expect(getElement('actual-polygon').getAttribute('points')).toBe(initialPolygon);

    click('step-button');
    click('step-button');
    expect(previewedCount()).toBe(2);
    expect(getElement('remaining-value').textContent).toBe('¥0');
    expect(getElement('balance-badge').textContent).toBe('Everyone is even');
    expect(getElement('actual-polygon').getAttribute('points')).toBe(getElement('target-polygon').getAttribute('points'));
    expect(getElement<HTMLButtonElement>('step-button').disabled).toBe(true);
    expect(getElement('play-button').textContent).toBe('Replay settlement');
  });

  it('plays, pauses, completes, and replays the settlement', () => {
    click('example-button');
    click('play-button');
    expect(getElement('play-button').textContent).toBe('Pause');
    expect(getElement<HTMLButtonElement>('step-button').disabled).toBe(true);

    vi.advanceTimersByTime(1200);
    expect(previewedCount()).toBe(1);
    click('play-button');
    vi.advanceTimersByTime(5000);
    expect(previewedCount()).toBe(1);
    expect(getElement('play-button').textContent).toBe('Play settlement');

    click('play-button');
    vi.advanceTimersByTime(1200);
    expect(previewedCount()).toBe(2);
    expect(getElement('balance-badge').textContent).toBe('Everyone is even');
    expect(getElement('play-button').textContent).toBe('Replay settlement');

    click('play-button');
    expect(previewedCount()).toBe(0);
    expect(getElement('remaining-value').textContent).toBe('¥5,000');
    vi.advanceTimersByTime(2400);
    expect(previewedCount()).toBe(2);
    expect(getElement('remaining-value').textContent).toBe('¥0');
  });

  it('stops playback and recalculates when a payment changes', () => {
    click('example-button');
    click('play-button');
    vi.advanceTimersByTime(1200);
    enter('amount', 0, '6000');

    expect(previewedCount()).toBe(0);
    expect(getElement('play-button').textContent).toBe('Play settlement');
    expect(getElement('total-value').textContent).toBe('¥9,000');
    expect(transferPlan()).toEqual([{ route: 'Jordan-->Alex', amount: '¥3,000' }]);
    vi.advanceTimersByTime(5000);
    expect(previewedCount()).toBe(0);
    expect(getElement('remaining-value').textContent).toBe('¥3,000');
  });

  it.each(['-1', '1.5', '1e3'])('blocks invalid JPY input %s and restores the plan after correction', (value) => {
    click('example-button');
    enter('amount', 1, value);

    expect(inputs('amount')[1].getAttribute('aria-invalid')).toBe('true');
    expect(getElement('member-error-1').hidden).toBe(false);
    expect(getElement('member-error-1').textContent).toContain('whole yen');
    expect(getElement('validation-message').hidden).toBe(false);
    expect(getElement('total-value').textContent).toBe('—');
    expect(transferPlan()).toEqual([]);
    expect(getElement<HTMLButtonElement>('play-button').disabled).toBe(true);
    expect(getElement<HTMLButtonElement>('copy-button').disabled).toBe(true);

    enter('amount', 1, '3000');
    expect(inputs('amount')[1].getAttribute('aria-invalid')).toBe('false');
    expect(getElement('validation-message').hidden).toBe(true);
    expect(getElement('total-value').textContent).toBe('¥12,000');
    expect(transferPlan()).toHaveLength(2);
  });

  it('assigns the indivisible yen remainder deterministically', () => {
    enter('amount', 0, '100');

    expect(getElement('share-value').textContent).toBe('¥33–¥34');
    expect(getElement('share-caption').textContent).toBe('First 1 person takes ¥1 extra');
    const statuses = Array.from(document.querySelectorAll('[data-member-status]')).map((status) => status.textContent);
    expect(statuses).toEqual([
      'Share ¥34 · gets back ¥66',
      'Share ¥33 · owes ¥33',
      'Share ¥33 · owes ¥33',
    ]);
    expect(transferPlan()).toEqual([
      { route: 'User 2-->User 1', amount: '¥33' },
      { route: 'User 3-->User 1', amount: '¥33' },
    ]);
    click('step-button');
    click('step-button');
    expect(getElement('actual-polygon').getAttribute('points')).toBe(getElement('target-polygon').getAttribute('points'));
  });

  it('keeps single-payer and zero-share diagrams finite and within their SVG viewbox', () => {
    for (const amount of ['300', '1']) {
      enter('amount', 0, amount);
      const points = getElement('actual-polygon').getAttribute('points')!.split(' ');
      expect(points).toHaveLength(3);
      for (const pair of points) {
        const [x, y] = pair.split(',').map(Number);
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(600);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(540);
      }
    }
    expect(getElement('balance-badge').textContent).toBe('Everyone is even');
    expect(getElement('actual-polygon').getAttribute('points')).toBe(getElement('target-polygon').getAttribute('points'));
  });

  it('keeps entered numbers on currency changes and applies currency precision', () => {
    click('example-button');
    changeCurrency('USD');

    expect(inputs('amount').map((input) => input.value)).toEqual(['9000', '3000', '0']);
    expect(getElement('total-value').textContent).toBe('$12,000.00');
    expect(inputs('amount')[0].inputMode).toBe('decimal');
    expect(getElement('toast').textContent).toContain('no conversion applied');

    enter('amount', 0, '1.25');
    expect(getElement('total-value').textContent).toBe('$3,001.25');
    expect(getElement('validation-message').hidden).toBe(true);
    enter('amount', 0, '1.255');
    expect(getElement('member-error-0').textContent).toContain('up to 2 decimal places');
    enter('amount', 0, '1.25');
    changeCurrency('JPY');
    expect(inputs('amount')[0].value).toBe('1.25');
    expect(getElement('validation-message').hidden).toBe(false);
    enter('amount', 0, '1');
    expect(getElement('total-value').textContent).toBe('¥3,001');
  });

  it('copies the original plan and payments after the preview is complete', async () => {
    click('example-button');
    click('step-button');
    click('step-button');
    click('copy-button');
    await Promise.resolve();

    expect(writeClipboard).toHaveBeenCalledTimes(1);
    const copied = writeClipboard.mock.calls[0][0];
    expect(copied).toContain('How much should I pay? v0.3.0');
    expect(copied).toContain('Currency: JPY');
    expect(copied).toContain('Total spent: ¥12,000');
    expect(copied).toContain('Alex: paid ¥9,000; share ¥4,000');
    expect(copied).toContain('Sam --> Alex: ¥1,000');
    expect(copied).toContain('Jordan --> Alex: ¥4,000');
    expect(getElement('toast').textContent).toBe('Settlement plan copied.');
  });

  it('offers the download fallback when clipboard access fails', async () => {
    click('example-button');
    writeClipboard.mockRejectedValueOnce(new Error('Clipboard unavailable'));
    click('copy-button');
    await Promise.resolve();
    await Promise.resolve();

    expect(getElement('toast').textContent).toBe('Clipboard access is unavailable. Use Download to save the plan.');
  });

  it('offers the download fallback when the Clipboard API is absent', async () => {
    click('example-button');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    click('copy-button');
    await Promise.resolve();
    await Promise.resolve();

    expect(writeClipboard).not.toHaveBeenCalled();
    expect(getElement('toast').textContent).toBe('Clipboard access is unavailable. Use Download to save the plan.');
    expect(getElement<HTMLButtonElement>('download-button').disabled).toBe(false);
  });

  it('downloads the original plan as a UTF-8 text file and releases its object URL', async () => {
    const objectUrl = 'blob:http://localhost/settlement-test';
    const createObjectUrl = vi.fn((_blob: Blob | MediaSource) => objectUrl);
    const revokeObjectUrl = vi.fn((_url: string) => undefined);
    const NativeUrl = URL;
    vi.stubGlobal('URL', class extends NativeUrl {
      static createObjectURL = createObjectUrl;
      static revokeObjectURL = revokeObjectUrl;
    });
    const downloadedLinks: { href: string; filename: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadedLinks.push({ href: this.href, filename: this.download });
    });
    click('example-button');
    click('step-button');
    click('step-button');
    click('download-button');

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const file = createObjectUrl.mock.calls[0][0] as Blob;
    expect(file).toBeInstanceOf(Blob);
    expect(file.type).toBe('text/plain;charset=utf-8');
    expect(downloadedLinks).toEqual([{ href: objectUrl, filename: 'settlement-plan-jpy.txt' }]);
    expect(getElement('toast').textContent).toBe('Settlement plan downloaded.');
    vi.advanceTimersByTime(999);
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectUrl).toHaveBeenCalledExactlyOnceWith(objectUrl);

    // FileReader reads the jsdom Blob without relying on browser navigation.
    vi.useRealTimers();
    const contents = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, 'utf-8');
    });
    vi.useFakeTimers();
    expect(contents).toContain('Currency: JPY');
    expect(contents).toContain('Total spent: ¥12,000');
    expect(contents).toContain('Alex: paid ¥9,000; share ¥4,000');
    expect(contents).toContain('Sam --> Alex: ¥1,000');
    expect(contents).toContain('Jordan --> Alex: ¥4,000');
  });

  it('releases a pending manual export immediately when the page is hidden', () => {
    const objectUrl = 'blob:http://localhost/pending-settlement-test';
    const createObjectUrl = vi.fn((_blob: Blob | MediaSource) => objectUrl);
    const revokeObjectUrl = vi.fn((_url: string) => undefined);
    const NativeUrl = URL;
    vi.stubGlobal('URL', class extends NativeUrl {
      static createObjectURL = createObjectUrl;
      static revokeObjectURL = revokeObjectUrl;
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    click('example-button');
    click('download-button');
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    expect(revokeObjectUrl).toHaveBeenCalledExactlyOnceWith(objectUrl);
    expectFreshApp();
    vi.advanceTimersByTime(5000);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expectFreshApp();
  });

  it('clears payments while preserving names and the selected currency', () => {
    click('example-button');
    changeCurrency('EUR');
    click('clear-button');

    expect(inputs('name').map((input) => input.value)).toEqual(['Alex', 'Sam', 'Jordan']);
    expect(inputs('amount').map((input) => input.value)).toEqual(['0', '0', '0']);
    expect(getElement<HTMLSelectElement>('currency-select').value).toBe('EUR');
    expect(getElement('total-value').textContent).toBe('€0.00');
    expect(getElement<HTMLButtonElement>('play-button').disabled).toBe(true);
  });

  it('starts fresh after reloading edited people, payments, currency, and playback', async () => {
    click('example-button');
    changeCurrency('USD');
    enter('name', 1, 'Morgan');
    enter('amount', 1, '3000.25');
    click('add-button');
    enter('name', 3, 'Taylor');
    enter('amount', 3, '18.75');
    click('play-button');
    vi.advanceTimersByTime(1200);
    expect(previewedCount()).toBe(1);
    await boot();

    expectFreshApp();
    expect(document.body.textContent).not.toContain('Morgan');
    expect(document.body.textContent).not.toContain('Taylor');
    vi.advanceTimersByTime(5000);
    expectFreshApp();
  });

  it.each([
    { label: 'valid', raw: JSON.stringify({ version: 1, currency: 'USD', members: [{ id: 'a', name: 'Private Alex', amount: '9000' }, { id: 'b', name: 'Private Sam', amount: '3000' }, { id: 'c', name: 'Private Jordan', amount: '0' }] }) },
    { label: 'corrupt', raw: 'not valid JSON' },
  ])('discards $label legacy data without reading it or touching unrelated storage', async ({ raw }) => {
    localStorage.setItem(LEGACY_STORAGE_KEY, raw);
    localStorage.setItem('unrelated-local-data', 'keep local data');
    sessionStorage.setItem('unrelated-session-data', 'keep session data');
    const readStoredValue = Storage.prototype.getItem;
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const clear = vi.spyOn(Storage.prototype, 'clear');
    await boot();

    expectFreshApp();
    expect(readStoredValue.call(localStorage, LEGACY_STORAGE_KEY)).toBeNull();
    expect(readStoredValue.call(localStorage, 'unrelated-local-data')).toBe('keep local data');
    expect(readStoredValue.call(sessionStorage, 'unrelated-session-data')).toBe('keep session data');
    click('example-button');
    enter('name', 0, 'Page-only Alex');
    enter('amount', 1, '4000');
    click('add-button');
    changeCurrency('USD');
    click('play-button');
    vi.advanceTimersByTime(1200);
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));

    expectFreshApp();
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(removeItem).toHaveBeenCalledExactlyOnceWith(LEGACY_STORAGE_KEY);
    expect(removeItem.mock.contexts).toEqual([localStorage]);
    expect(readStoredValue.call(localStorage, 'unrelated-local-data')).toBe('keep local data');
    expect(readStoredValue.call(sessionStorage, 'unrelated-session-data')).toBe('keep session data');
  });

  it('remains usable when browser storage is unavailable', async () => {
    const blockedStorage = {
      getItem: vi.fn(() => { throw new Error('Storage blocked'); }),
      setItem: vi.fn(() => { throw new Error('Storage blocked'); }),
      removeItem: vi.fn(() => { throw new Error('Storage blocked'); }),
      clear: vi.fn(() => { throw new Error('Storage blocked'); }),
    };
    vi.stubGlobal('localStorage', blockedStorage);
    vi.stubGlobal('sessionStorage', blockedStorage);
    await boot();

    expectFreshApp();
    click('example-button');
    expect(getElement('total-value').textContent).toBe('¥12,000');
    expect(transferPlan()).toHaveLength(2);
    expect(getElement<HTMLButtonElement>('copy-button').disabled).toBe(false);
    expect(blockedStorage.removeItem).toHaveBeenCalledExactlyOnceWith(LEGACY_STORAGE_KEY);
    expect(blockedStorage.getItem).not.toHaveBeenCalled();
    expect(blockedStorage.setItem).not.toHaveBeenCalled();
    expect(blockedStorage.clear).not.toHaveBeenCalled();
  });

  it.each([false, true])('clears names, amounts, currency, and playback on pagehide (persisted: %s)', (persisted) => {
    click('example-button');
    changeCurrency('USD');
    click('add-button');
    enter('name', 3, 'Private Taylor');
    enter('amount', 3, '24.25');
    click('play-button');
    vi.advanceTimersByTime(1200);
    expect(previewedCount()).toBe(1);

    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted }));
    expectFreshApp();
    expect(document.body.textContent).not.toContain('Private Taylor');
    vi.advanceTimersByTime(5000);
    expectFreshApp();
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted }));
    expectFreshApp();
    enter('amount', 0, '100');
    expect(getElement('total-value').textContent).toBe('¥100');
    expect(transferPlan()).toHaveLength(2);
  });

  it.each([false, true])('starts fresh on pageshow even if stale DOM is restored (persisted: %s)', (persisted) => {
    click('example-button');
    enter('name', 1, 'Private Morgan');
    changeCurrency('EUR');
    enter('amount', 1, '245.50');
    click('play-button');

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted }));
    expectFreshApp();
    expect(document.body.textContent).not.toContain('Private Morgan');
    vi.advanceTimersByTime(5000);
    expectFreshApp();
  });
});

describe('responsive workspace and accessible chart controls', () => {
  it('shows all three sections as regions in an expanded workspace', () => {
    expect(getElement('workspace-navigation').hidden).toBe(true);
    for (const view of ['people', 'balance', 'plan'] as const) {
      const panel = getElement(`${view}-panel`);
      expect(panel.hidden).toBe(false);
      expect(panel.getAttribute('role')).not.toBe('tabpanel');
      expect(panel.getAttribute('aria-labelledby')).not.toBe(workspaceTab(view).id);
    }
  });

  it('uses a single visible panel with selected and labelled tabs in a compact workspace', () => {
    setCompactViewport(true);
    expectCompactView('people');

    selectView('balance');
    expectCompactView('balance');
    selectView('plan');
    expectCompactView('plan');
    selectView('people');
    expectCompactView('people');
  });

  it('supports arrow keys, wrapping, Home, and End with focus following the selected tab', () => {
    setCompactViewport(true);
    workspaceTab('people').focus();

    const move = (from: WorkspaceView, key: string, to: WorkspaceView) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      workspaceTab(from).dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expectCompactView(to);
      expect(document.activeElement).toBe(workspaceTab(to));
    };

    move('people', 'ArrowRight', 'balance');
    move('balance', 'End', 'plan');
    move('plan', 'ArrowRight', 'people');
    move('people', 'ArrowLeft', 'plan');
    move('plan', 'Home', 'people');
  });

  it('focuses and scrolls the destination panel from compact Next buttons while tabs retain tab focus', () => {
    const previousScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    try {
      setCompactViewport(true);
      const viewBalance = document.querySelector<HTMLButtonElement>('#people-panel [data-view="balance"]')!;
      viewBalance.focus();
      viewBalance.click();
      expectCompactView('balance');
      expect(document.activeElement).toBe(getElement('balance-panel'));
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(getElement('balance-panel'));

      const viewPlan = document.querySelector<HTMLButtonElement>('#balance-panel [data-view="plan"]')!;
      viewPlan.focus();
      viewPlan.click();
      expectCompactView('plan');
      expect(document.activeElement).toBe(getElement('plan-panel'));
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(getElement('plan-panel'));

      selectView('people');
      expectCompactView('people');
      expect(document.activeElement).toBe(workspaceTab('people'));
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(getElement('people-panel'));
      workspaceTab('people').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expectCompactView('balance');
      expect(document.activeElement).toBe(workspaceTab('balance'));
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(getElement('balance-panel'));
      expect(scrollIntoView).toHaveBeenCalledTimes(4);
    } finally {
      if (previousScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previousScroll);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });

  it('moves focus out of hidden tabs on expansion and resets People after a restored viewport change', () => {
    setCompactViewport(true);
    click('example-button');
    enter('name', 1, 'Private Morgan');
    changeCurrency('EUR');
    selectView('balance');
    chartMember(1).click();
    click('step-button');
    expect(document.activeElement).toBe(workspaceTab('balance'));

    setCompactViewport(false);
    expect(getElement('workspace-navigation').hidden).toBe(true);
    expect(document.activeElement).toBe(getElement('balance-panel'));
    expect(getElement('balance-panel').tabIndex).toBe(-1);
    expect(previewedCount()).toBe(1);

    // A restored document can see a new viewport before any media change event.
    compactViewport = true;
    mediaQuery(COMPACT_QUERY).matches = true;
    expect(getElement('app').dataset.layout).toBe('expanded');
    expect(document.activeElement).toBe(getElement('balance-panel'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));

    expectFreshApp();
    expectCompactView('people');
    expect(getElement('point-detail-name').textContent).toBe('User 1');
    expect(chartMember(0).getAttribute('aria-pressed')).toBe('true');
    expect(document.body.textContent).not.toContain('Private Morgan');
  });

  it('preserves edited inputs, currency, selected member, and preview progress across views and viewport changes', () => {
    setCompactViewport(true);
    click('example-button');
    enter('name', 1, 'Morgan & friends');
    changeCurrency('USD');
    const originalNames = inputs('name').map((input) => input.value);
    const originalAmounts = inputs('amount').map((input) => input.value);
    const originalPlan = transferPlan();

    selectView('balance');
    chartMember(1).click();
    click('step-button');
    expect(previewedCount()).toBe(1);
    expect(getElement('point-detail-name').textContent).toBe('Morgan & friends');
    expect(getElement('point-detail-paid').textContent).toBe('$4,000.00');
    const previewPolygon = getElement('actual-polygon').getAttribute('points');

    selectView('plan');
    expectCompactView('plan');
    expect(transferPlan()).toEqual(originalPlan);
    selectView('people');
    expect(inputs('name').map((input) => input.value)).toEqual(originalNames);
    expect(inputs('amount').map((input) => input.value)).toEqual(originalAmounts);
    expect(getElement<HTMLSelectElement>('currency-select').value).toBe('USD');

    setCompactViewport(false);
    expect(getElement('workspace-navigation').hidden).toBe(true);
    for (const view of ['people', 'balance', 'plan'] as const) {
      expect(getElement(`${view}-panel`).hidden).toBe(false);
    }
    expect(previewedCount()).toBe(1);
    expect(getElement('actual-polygon').getAttribute('points')).toBe(previewPolygon);
    expect(getElement('point-detail-name').textContent).toBe('Morgan & friends');

    setCompactViewport(true);
    expectCompactView('people');
    expect(previewedCount()).toBe(1);
    selectView('balance');
    expect(getElement('point-detail-paid').textContent).toBe('$4,000.00');
    expect(inputs('amount').map((input) => input.value)).toEqual(originalAmounts);
    expect(getElement('remaining-value').textContent).toBe('$4,000.00');
  });

  it('pauses a running preview when leaving Balance and resumes from its completed prefix', () => {
    setCompactViewport(true);
    click('example-button');
    selectView('balance');
    click('play-button');
    vi.advanceTimersByTime(1200);
    expect(previewedCount()).toBe(1);

    selectView('plan');
    expectCompactView('plan');
    expect(getElement('play-button').textContent).toBe('Play settlement');
    vi.advanceTimersByTime(5000);
    expect(previewedCount()).toBe(1);
    expect(getElement('remaining-value').textContent).toBe('¥4,000');

    selectView('balance');
    expect(previewedCount()).toBe(1);
    click('play-button');
    vi.advanceTimersByTime(1200);
    expect(previewedCount()).toBe(2);
    expect(getElement('balance-badge').textContent).toBe('Everyone is even');
    expect(inputs('amount').map((input) => input.value)).toEqual(['9000', '3000', '0']);
  });

  it('preserves a partial preview across expanded and compact layouts without requiring ResizeObserver', () => {
    setCompactViewport(true);
    click('example-button');
    selectView('balance');
    click('step-button');
    const beforeResize = getElement('actual-polygon').getAttribute('points');

    setCompactViewport(false);
    expect(previewedCount()).toBe(1);
    expect(getElement('actual-polygon').getAttribute('points')).toBe(beforeResize);
    setCompactViewport(true);
    expectCompactView('balance');
    expect(previewedCount()).toBe(1);
    expect(getElement('actual-polygon').getAttribute('points')).toBe(beforeResize);
    expect(getElement('remaining-value').textContent).toBe('¥4,000');
    click('step-button');
    expect(previewedCount()).toBe(2);
  });

  it('leaves compact chart mode when its panel grows despite the previous chart width cap', async () => {
    const observedTargets: Element[] = [];
    let resizeCallback: ResizeObserverCallback | undefined;
    let resizeObserver: ResizeObserver | undefined;
    class MockResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
        resizeObserver = this;
      }

      observe(target: Element): void { observedTargets.push(target); }
      unobserve(): void { /* This test does not remove observed chart elements. */ }
      disconnect(): void { /* The observer belongs to this isolated test document. */ }
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    await boot();
    expect(observedTargets.map((target) => target.id)).toEqual(expect.arrayContaining(['balance-panel', 'polygon-chart']));

    click('example-button');
    enter('name', 1, 'Morgan');
    changeCurrency('USD');
    chartMember(1).click();
    click('step-button');
    const originalNames = inputs('name').map((input) => input.value);
    const originalAmounts = inputs('amount').map((input) => input.value);
    const originalPlan = transferPlan();
    const previewPolygon = getElement('actual-polygon').getAttribute('points');
    const expectPreservedState = () => {
      expect(inputs('name').map((input) => input.value)).toEqual(originalNames);
      expect(inputs('amount').map((input) => input.value)).toEqual(originalAmounts);
      expect(getElement<HTMLSelectElement>('currency-select').value).toBe('USD');
      expect(transferPlan()).toEqual(originalPlan);
      expect(previewedCount()).toBe(1);
      expect(getElement('actual-polygon').getAttribute('points')).toBe(previewPolygon);
      expect(getElement('point-detail-name').textContent).toBe('Morgan');
      expect(getElement('point-detail-paid').textContent).toBe('$4,000.00');
      expect(chartMember(1).getAttribute('aria-pressed')).toBe('true');
    };
    const deliverWidths = (widths: [string, number][]) => {
      if (!resizeCallback || !resizeObserver) throw new Error('The chart observer was not initialized.');
      const entries: ResizeObserverEntry[] = widths.map(([id, width]) => ({
        target: getElement(id),
        contentRect: new DOMRectReadOnly(0, 0, width, 1),
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      }));
      resizeCallback(entries, resizeObserver);
    };

    deliverWidths([['balance-panel', 480], ['polygon-chart', 448]]);
    expect(getElement('polygon-chart').classList.contains('is-compact-chart')).toBe(true);
    const viewBoxWidth = Number(getElement('balance-svg').getAttribute('viewBox')!.split(/\s+/)[2]);
    const hitRadius = Number(svgMember(1).querySelector('.node-hit-area')!.getAttribute('r'));
    const pointFontSize = Number.parseFloat(svgMember(1).querySelector<SVGTextElement>('text')!.style.fontSize);
    // Check the intended SVG-to-pixel scale, independently of jsdom CSS layout.
    expect(hitRadius * 2 * 448 / viewBoxWidth).toBeGreaterThanOrEqual(44);
    expect(pointFontSize * 448 / viewBoxWidth).toBeCloseTo(12, 8);
    expectPreservedState();

    deliverWidths([['balance-panel', 800], ['polygon-chart', 488]]);
    expect(getElement('polygon-chart').classList.contains('is-compact-chart')).toBe(false);
    expectPreservedState();

    deliverWidths([['polygon-chart', 610]]);
    expect(getElement('polygon-chart').classList.contains('is-compact-chart')).toBe(false);
    expectPreservedState();
  });

  it('shows safe full names and exact selected-member details for compact touch controls', () => {
    setCompactViewport(true);
    setCoarsePointer(true);
    click('example-button');
    const fullName = '<b>Sam & friends</b>';
    enter('name', 1, fullName);
    selectView('balance');

    expect(getElement('polygon-chart').classList.contains('is-compact-chart')).toBe(true);
    expect(Array.from(document.querySelectorAll('#polygon-chart .node-name')).map((node) => node.textContent)).toEqual(['1', '2', '3']);
    expect(chartMember(1).textContent).toContain(fullName);
    expect(document.querySelector('.chart-member-button b')).toBeNull();
    chartMember(1).click();
    expect(chartMember(1).getAttribute('aria-pressed')).toBe('true');
    expect(svgMember(1).getAttribute('aria-pressed')).toBe('true');
    expect(getElement('point-detail-name').textContent).toBe(fullName);
    expect(getElement('point-detail-name').querySelector('b')).toBeNull();
    expect(getElement('point-detail-paid').textContent).toBe('¥3,000');
    expect(getElement('point-detail-share').textContent).toBe('¥4,000');
    expect(getElement('point-detail-ratio').textContent).toContain('0.75');

    click('step-button');
    expect(getElement('point-detail-name').textContent).toBe(fullName);
    expect(getElement('point-detail-paid').textContent).toBe('¥4,000');
    expect(getElement('point-detail-share').textContent).toBe('¥4,000');
    expect(getElement('point-detail-ratio').textContent).toContain('1.00');
    expect(inputs('amount')[1].value).toBe('3000');

    chartMember(2).click();
    expect(chartMember(1).getAttribute('aria-pressed')).toBe('false');
    expect(getElement('point-detail-name').textContent).toBe('Jordan');
    expect(getElement('point-detail-paid').textContent).toBe('¥0');
  });

  it('allows clicking and using Enter or Space on SVG points with synchronized pressed states', () => {
    click('example-button');
    svgMember(2).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(getElement('point-detail-name').textContent).toBe('Jordan');
    expect(chartMember(2).getAttribute('aria-pressed')).toBe('true');

    for (const [index, key, expectedName] of [[0, 'Enter', 'Alex'], [1, ' ', 'Sam']] as const) {
      const node = svgMember(index);
      expect(node.getAttribute('role')).toBe('button');
      expect(node.getAttribute('tabindex')).toBe('0');
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      node.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(getElement('point-detail-name').textContent).toBe(expectedName);
      expect(svgMember(index).getAttribute('aria-pressed')).toBe('true');
      expect(chartMember(index).getAttribute('aria-pressed')).toBe('true');
    }
    expect(chartMember(2).getAttribute('aria-pressed')).toBe('false');
  });

  it('provides independently selectable exact details when all payment points overlap at zero', () => {
    setCompactViewport(true);
    setCoarsePointer(true);
    selectView('balance');
    expect(document.querySelectorAll('.chart-member-button')).toHaveLength(3);

    chartMember(2).click();
    expect(getElement('point-detail-name').textContent).toBe('User 3');
    expect(getElement('point-detail-paid').textContent).toBe('¥0');
    expect(getElement('point-detail-share').textContent).toBe('¥0');
    expect(chartMember(2).getAttribute('aria-pressed')).toBe('true');
    expect(svgMember(2).getAttribute('aria-pressed')).toBe('true');
    expectFreshApp();
  });

  it.each(['pagehide', 'pageshow'])('resets compact navigation, selected member, and preview state on %s', (type) => {
    setCompactViewport(true);
    click('example-button');
    changeCurrency('EUR');
    selectView('balance');
    chartMember(1).click();
    click('step-button');
    selectView('plan');
    expectCompactView('plan');
    expect(previewedCount()).toBe(1);

    window.dispatchEvent(new PageTransitionEvent(type, { persisted: true }));
    expectFreshApp();
    expectCompactView('people');
    expect(getElement('point-detail-name').textContent).toBe('User 1');
    expect(chartMember(0).getAttribute('aria-pressed')).toBe('true');
    vi.advanceTimersByTime(5000);
    expectFreshApp();
    expectCompactView('people');
  });
});
