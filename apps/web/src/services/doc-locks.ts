/**
 * A journey is open in one tab only, also across browser windows (§18.3): a Web Lock per
 * workspace file, and a BroadcastChannel to ask the window that holds it to show its tab.
 */

const held = new Map<string, () => void>();
const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('rnjb');

interface FocusMessage {
  type: 'focus';
  key: string;
}

/** Resolves `false` when another window already holds `key`. */
export function acquireLock(tabId: string, key: string): Promise<boolean> {
  const locks = navigator.locks as LockManager | undefined;
  if (!locks) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    void locks.request(`rnjb:${key}`, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false);
        return undefined;
      }
      resolve(true);
      return new Promise<void>((release) => held.set(tabId, release));
    });
  });
}

export function releaseLock(tabId: string): void {
  held.get(tabId)?.();
  held.delete(tabId);
}

export function requestFocusElsewhere(key: string): void {
  channel?.postMessage({ type: 'focus', key } satisfies FocusMessage);
}

export function onFocusRequest(handler: (key: string) => void): () => void {
  if (!channel) return () => undefined;
  const listener = (event: MessageEvent<FocusMessage>) => {
    if (event.data?.type === 'focus') handler(event.data.key);
  };
  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}
