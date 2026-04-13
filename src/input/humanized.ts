import type { WebContents } from 'electron';
import { behaviorReplay } from '../behavior/replay';
import {
  captureNavigationState,
  confirmSelectorValue,
  hasObservableInteractionEffect,
  readPageState,
  readSelectorState,
  type InteractionElementState,
  type NavigationState,
  type PageState,
  type WaitForNavigationOptions,
} from '../interaction/page-state';

const MAX_TYPED_CHARS = 10_000;
const DEFAULT_CONFIRM_TIMEOUT_MS = 700;

export interface HumanizedClickResult {
  ok: boolean;
  error?: string;
  target: {
    selector: string;
    found: boolean;
    tagName: string | null;
    text: string | null;
  };
  completion: {
    dispatchCompleted: boolean;
    effectConfirmed: boolean;
    mode: 'confirmed' | 'dispatched';
    caveat?: string;
  };
  postAction?: {
    page: PageState;
    element: InteractionElementState | null;
    navigation: NavigationState;
  };
}

export interface HumanizedTypeResult {
  ok: boolean;
  error?: string;
  target: {
    selector: string;
    found: boolean;
    tagName: string | null;
    text: string | null;
  };
  completion: {
    dispatchCompleted: boolean;
    effectConfirmed: boolean;
    mode: 'confirmed' | 'dispatched';
    caveat?: string;
  };
  postAction?: {
    page: PageState;
    element: InteractionElementState | null;
    observedAfterMs: number;
  };
}

export interface HumanizedInteractionOptions extends WaitForNavigationOptions {
  confirm?: boolean;
  confirmTimeoutMs?: number;
}

/**
 * Gaussian random number (Box-Muller transform).
 * Returns a value centered on mean with given stddev.
 */
function gaussianRandom(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.round(mean + z * stddev);
}

/** Random delay between actions (gaussian, 80-300ms fallback profile) */
function humanDelay(min: number = 80, max: number = 300): Promise<void> {
  const mean = (min + max) / 2;
  const stddev = (max - min) / 4;
  let delay = gaussianRandom(mean, stddev);
  delay = Math.max(min, Math.min(max, delay));
  return new Promise(resolve => setTimeout(resolve, delay));
}

/** Random typing delay per character using BehaviorReplay */
function typingDelay(currentChar: string = '', nextChar: string = ''): Promise<void> {
  const delay = behaviorReplay.getTypingDelay(currentChar, nextChar);
  return new Promise(resolve => setTimeout(resolve, delay));
}

function selectAllModifiers(): Electron.InputEvent['modifiers'] {
  return process.platform === 'darwin' ? ['meta'] : ['control'];
}

/**
 * Get element position by selector via executeJavaScript.
 * Returns center coordinates of the element.
 */
async function getElementPosition(wc: WebContents, selector: string): Promise<{ x: number; y: number; found: boolean; tag?: string; text?: string }> {
  const result = await wc.executeJavaScript(`
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { found: false };
      const rect = el.getBoundingClientRect();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const rect2 = el.getBoundingClientRect();
      return {
        found: true,
        x: Math.round(rect2.left + rect2.width / 2),
        y: Math.round(rect2.top + rect2.height / 2),
        tag: el.tagName,
        text: (el.textContent || '').substring(0, 100)
      };
    })()
  `);
  return result;
}

async function prepareSelectorForTextEntry(
  wc: WebContents,
  selector: string,
  replaceExisting: boolean,
): Promise<{
  found: boolean;
  focused: boolean;
  selectionPrepared: boolean;
  existingTextLength: number;
}> {
  const result = await wc.executeJavaScript(`
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) {
        return { found: false, focused: false, selectionPrepared: false, existingTextLength: 0 };
      }

      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      }

      if (typeof el.focus === 'function') {
        try {
          el.focus({ preventScroll: true });
        } catch {
          el.focus();
        }
      }

      let selectionPrepared = false;
      const valueLength = typeof el.value === 'string'
        ? el.value.length
        : typeof el.textContent === 'string'
          ? el.textContent.length
          : 0;

      if (${replaceExisting ? 'true' : 'false'}) {
        if (typeof el.select === 'function') {
          try {
            el.select();
            selectionPrepared = true;
          } catch {
            // fall through
          }
        }

        if (!selectionPrepared && typeof el.setSelectionRange === 'function' && typeof el.value === 'string') {
          try {
            el.setSelectionRange(0, el.value.length);
            selectionPrepared = true;
          } catch {
            // fall through
          }
        }

        if (!selectionPrepared && el.isContentEditable) {
          try {
            const range = document.createRange();
            range.selectNodeContents(el);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            selectionPrepared = true;
          } catch {
            // fall through
          }
        }
      }

      return {
        found: true,
        focused: document.activeElement === el,
        selectionPrepared,
        existingTextLength: valueLength,
      };
    })()
  `) as {
    found: boolean;
    focused: boolean;
    selectionPrepared: boolean;
    existingTextLength: number;
  };

  return result;
}

async function sendSelectAllShortcut(wc: WebContents): Promise<void> {
  const modifiers = selectAllModifiers();
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'a', modifiers });
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'a', modifiers });
  await typingDelay();
}

async function clearSelectedText(wc: WebContents): Promise<void> {
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' });
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
  await humanDelay(40, 80);
}

/**
 * Click an element using sendInputEvent (OS-level, Event.isTrusted = true).
 * Uses humanized delays and mouse movement.
 */
export async function humanizedClick(
  wc: WebContents,
  selector: string,
  options?: HumanizedInteractionOptions,
): Promise<HumanizedClickResult> {
  const pos = await getElementPosition(wc, selector);
  if (!pos.found) {
    return {
      ok: false,
      error: 'Element not found',
      target: {
        selector,
        found: false,
        tagName: null,
        text: null,
      },
      completion: {
        dispatchCompleted: false,
        effectConfirmed: false,
        mode: 'dispatched',
        caveat: 'Selector could not be resolved before dispatch.',
      },
    };
  }

  const beforePage = await readPageState(wc);
  const beforeElement = await readSelectorState(wc, selector);

  // Small random offset within element (not dead center)
  const offsetX = gaussianRandom(0, 3);
  const offsetY = gaussianRandom(0, 3);
  const x = pos.x + offsetX;
  const y = pos.y + offsetY;

  // Pre-click hesitation (hover → click delay)
  await humanDelay(50, 150);

  // Move mouse to position using trained trajectory
  // E.g., start from a random nearby point representing current cursor
  const startX = Math.round(x + gaussianRandom(0, 200));
  const startY = Math.round(y + gaussianRandom(0, 200));
  const trajectory = behaviorReplay.getMouseTrajectory(startX, startY, x, y);

  for (const point of trajectory) {
    wc.sendInputEvent({
      type: 'mouseMove',
      x: point.x,
      y: point.y,
    });
    if (point.delayMs > 0) {
      await new Promise(r => setTimeout(r, point.delayMs));
    }
  }

  await humanDelay(30, 80);

  // Mouse down
  wc.sendInputEvent({
    type: 'mouseDown',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });

  // Brief hold (humans don't instant-release)
  await humanDelay(40, 120);

  // Mouse up
  wc.sendInputEvent({
    type: 'mouseUp',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });

  const navigation = await captureNavigationState(wc, beforePage.url, options);
  const afterPage = await readPageState(wc);
  const afterElement = options?.confirm === false ? null : await readSelectorState(wc, selector);
  const effectConfirmed = options?.confirm === false
    ? false
    : hasObservableInteractionEffect({
        beforePage,
        afterPage,
        navigation,
        beforeElement,
        afterElement,
      });

  return {
    ok: true,
    target: {
      selector,
      found: true,
      tagName: pos.tag ?? null,
      text: pos.text ?? null,
    },
    completion: {
      dispatchCompleted: true,
      effectConfirmed,
      mode: effectConfirmed ? 'confirmed' : 'dispatched',
      caveat: effectConfirmed
        ? undefined
        : options?.confirm === false
          ? 'Click dispatch was acknowledged without post-click confirmation.'
          : 'Click dispatch finished, but no immediate focus, value, checked, or navigation change was observable.',
    },
    postAction: {
      page: afterPage,
      element: afterElement,
      navigation,
    },
  };
}

/**
 * Type text using sendInputEvent character by character (Event.isTrusted = true).
 * Humanized typing rhythm with gaussian delays.
 */
export async function humanizedType(
  wc: WebContents,
  selector: string,
  text: string,
  clear: boolean = false,
  options?: HumanizedInteractionOptions,
): Promise<HumanizedTypeResult> {
  const pos = await getElementPosition(wc, selector);
  if (!pos.found) {
    return {
      ok: false,
      error: 'Element not found',
      target: {
        selector,
        found: false,
        tagName: null,
        text: null,
      },
      completion: {
        dispatchCompleted: false,
        effectConfirmed: false,
        mode: 'dispatched',
        caveat: 'Selector could not be resolved before typing began.',
      },
    };
  }

  // Click to focus the element first
  wc.sendInputEvent({ type: 'mouseMove', x: pos.x, y: pos.y });
  await humanDelay(30, 60);
  wc.sendInputEvent({ type: 'mouseDown', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  await humanDelay(40, 80);
  wc.sendInputEvent({ type: 'mouseUp', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  await humanDelay(80, 200);

  const chars = Array.from(text).slice(0, MAX_TYPED_CHARS);
  const preparation = await prepareSelectorForTextEntry(wc, selector, clear);

  if (clear && preparation.found && preparation.existingTextLength > 0 && !preparation.selectionPrepared) {
    await sendSelectAllShortcut(wc);
  }

  if (clear && chars.length === 0) {
    await clearSelectedText(wc);
  }

  // Type each character with humanized delays
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const nextChar = i + 1 < chars.length ? chars[i + 1] : '';
    wc.sendInputEvent({ type: 'char', keyCode: char });
    await typingDelay(char, nextChar);
  }

  if (options?.confirm === false) {
    return {
      ok: true,
      target: {
        selector,
        found: true,
        tagName: pos.tag ?? null,
        text: pos.text ?? null,
      },
      completion: {
        dispatchCompleted: true,
        effectConfirmed: false,
        mode: 'dispatched',
        caveat: 'Typing dispatch finished without post-type value confirmation.',
      },
      postAction: {
        page: await readPageState(wc),
        element: await readSelectorState(wc, selector),
        observedAfterMs: 0,
      },
    };
  }

  const confirmation = await confirmSelectorValue(
    wc,
    selector,
    text,
    options?.confirmTimeoutMs ?? DEFAULT_CONFIRM_TIMEOUT_MS,
  );
  const page = await readPageState(wc);

  return {
    ok: true,
    target: {
      selector,
      found: true,
      tagName: pos.tag ?? null,
      text: pos.text ?? null,
    },
    completion: {
      dispatchCompleted: true,
      effectConfirmed: confirmation.confirmed,
      mode: confirmation.confirmed ? 'confirmed' : 'dispatched',
      caveat: confirmation.confirmed ? undefined : 'Typed text was dispatched, but the requested value was not observed before the confirmation window expired.',
    },
    postAction: {
      page,
      element: confirmation.state,
      observedAfterMs: confirmation.observedAfterMs,
    },
  };
}
