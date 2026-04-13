import type { WebContents } from 'electron';

const DEFAULT_CONFIRM_TIMEOUT_MS = 700;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 2_000;
const DEFAULT_SETTLE_MS = 120;
const POLL_INTERVAL_MS = 50;
const MAX_SUMMARY_LENGTH = 200;

export interface ActiveElementState {
  tagName: string | null;
  id: string | null;
  name: string | null;
  type: string | null;
  value: string | null;
}

export interface PageState {
  url: string;
  title: string;
  loading: boolean;
  activeElement: ActiveElementState;
}

export interface InteractionElementState {
  found: boolean;
  tagName: string | null;
  text: string | null;
  value: string | null;
  focused: boolean;
  connected: boolean;
  checked: boolean | null;
  disabled: boolean | null;
}

export interface NavigationState {
  urlBefore: string;
  urlAfter: string;
  changed: boolean;
  loading: boolean;
  waitApplied: boolean;
  completed: boolean;
  timeout: boolean;
}

export interface WaitForNavigationOptions {
  waitForNavigation?: boolean;
  timeoutMs?: number;
  settleMs?: number;
}

export interface ElementConfirmation<T> {
  confirmed: boolean;
  state: T | null;
  observedAfterMs: number;
}

export interface InteractionObservation {
  beforePage: PageState;
  afterPage: PageState;
  navigation?: NavigationState;
  beforeElement?: InteractionElementState | null;
  afterElement?: InteractionElementState | null;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clampPositive(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return fallback;
  }
  return Math.round(value);
}

function summarize(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > MAX_SUMMARY_LENGTH ? `${value.slice(0, MAX_SUMMARY_LENGTH)}...` : value;
}

function safeUrl(wc: WebContents): string {
  try {
    return wc.getURL();
  } catch {
    return '';
  }
}

export function didActiveElementChange(before: ActiveElementState, after: ActiveElementState): boolean {
  return before.tagName !== after.tagName
    || before.id !== after.id
    || before.name !== after.name
    || before.type !== after.type
    || before.value !== after.value;
}

export function didInteractionElementChange(
  before: InteractionElementState | null | undefined,
  after: InteractionElementState | null | undefined,
): boolean {
  if (!before && !after) {
    return false;
  }

  if (!before || !after) {
    return true;
  }

  return before.focused !== after.focused
    || before.value !== after.value
    || before.checked !== after.checked
    || before.connected !== after.connected
    || before.disabled !== after.disabled;
}

export function hasObservablePageChange(
  beforePage: PageState,
  afterPage: PageState,
  navigation?: NavigationState,
): boolean {
  return Boolean(
    navigation?.changed
    || navigation?.loading
    || didActiveElementChange(beforePage.activeElement, afterPage.activeElement),
  );
}

export function hasObservableInteractionEffect({
  beforePage,
  afterPage,
  navigation,
  beforeElement,
  afterElement,
}: InteractionObservation): boolean {
  return hasObservablePageChange(beforePage, afterPage, navigation)
    || didInteractionElementChange(beforeElement, afterElement);
}

export async function readPageState(wc: WebContents): Promise<PageState> {
  if (wc.isDestroyed()) {
    return {
      url: '',
      title: '',
      loading: false,
      activeElement: { tagName: null, id: null, name: null, type: null, value: null },
    };
  }

  try {
    const details = await wc.executeJavaScript(`
      (() => {
        const active = document.activeElement;
        return {
          title: document.title || '',
          activeElement: {
            tagName: active?.tagName || null,
            id: active?.id || null,
            name: active?.getAttribute?.('name') || null,
            type: active?.getAttribute?.('type') || null,
            value: typeof active?.value === 'string' ? active.value : null
          }
        };
      })()
    `) as { title?: string; activeElement?: Partial<ActiveElementState> };

    return {
      url: safeUrl(wc),
      title: details?.title || '',
      loading: wc.isLoading(),
      activeElement: {
        tagName: details?.activeElement?.tagName ?? null,
        id: details?.activeElement?.id ?? null,
        name: details?.activeElement?.name ?? null,
        type: details?.activeElement?.type ?? null,
        value: summarize(details?.activeElement?.value ?? null),
      },
    };
  } catch {
    return {
      url: safeUrl(wc),
      title: '',
      loading: wc.isLoading(),
      activeElement: { tagName: null, id: null, name: null, type: null, value: null },
    };
  }
}

export async function readSelectorState(wc: WebContents, selector: string): Promise<InteractionElementState | null> {
  if (wc.isDestroyed()) return null;

  try {
    const result = await wc.executeJavaScript(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const active = document.activeElement;
        return {
          found: true,
          tagName: el.tagName || null,
          text: (el.textContent || '').trim().slice(0, ${MAX_SUMMARY_LENGTH}),
          value: typeof el.value === 'string' ? el.value.slice(0, ${MAX_SUMMARY_LENGTH}) : null,
          focused: active === el,
          connected: el.isConnected !== false,
          checked: typeof el.checked === 'boolean' ? el.checked : null,
          disabled: typeof el.disabled === 'boolean' ? el.disabled : null
        };
      })()
    `) as InteractionElementState | null;

    return result;
  } catch {
    return null;
  }
}

export async function confirmSelectorValue(
  wc: WebContents,
  selector: string,
  expectedValue: string,
  timeoutMs?: number,
): Promise<ElementConfirmation<InteractionElementState>> {
  const effectiveTimeoutMs = clampPositive(timeoutMs, DEFAULT_CONFIRM_TIMEOUT_MS);
  const startedAt = Date.now();
  let lastState = await readSelectorState(wc, selector);

  while (Date.now() - startedAt <= effectiveTimeoutMs) {
    if (lastState?.value === expectedValue) {
      return {
        confirmed: true,
        state: lastState,
        observedAfterMs: Date.now() - startedAt,
      };
    }

    await delay(POLL_INTERVAL_MS);
    lastState = await readSelectorState(wc, selector);
  }

  return {
    confirmed: lastState?.value === expectedValue,
    state: lastState,
    observedAfterMs: Date.now() - startedAt,
  };
}

export async function captureNavigationState(
  wc: WebContents,
  beforeUrl: string,
  options?: WaitForNavigationOptions,
): Promise<NavigationState> {
  const waitApplied = options?.waitForNavigation === true;
  const timeoutMs = clampPositive(options?.timeoutMs, DEFAULT_NAVIGATION_TIMEOUT_MS);
  const settleMs = clampPositive(options?.settleMs, DEFAULT_SETTLE_MS);
  const startedAt = Date.now();

  if (waitApplied) {
    let sawNavigationSignal = wc.isLoading() || safeUrl(wc) !== beforeUrl;

    while (!sawNavigationSignal && Date.now() - startedAt < timeoutMs) {
      await delay(POLL_INTERVAL_MS);
      sawNavigationSignal = wc.isLoading() || safeUrl(wc) !== beforeUrl;
    }

    while (wc.isLoading() && Date.now() - startedAt < timeoutMs) {
      await delay(POLL_INTERVAL_MS);
    }

    if (!wc.isLoading()) {
      await delay(settleMs);
    }
  } else {
    await delay(settleMs);
  }

  const urlAfter = safeUrl(wc);
  const loading = wc.isLoading();
  const timedOut = waitApplied && Date.now() - startedAt >= timeoutMs && loading;

  return {
    urlBefore: beforeUrl,
    urlAfter,
    changed: urlAfter !== beforeUrl,
    loading,
    waitApplied,
    completed: !loading,
    timeout: timedOut,
  };
}
