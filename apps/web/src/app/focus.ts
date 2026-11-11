/** Where keyboard focus is, for shortcuts that must not steal keys from fields or panels. */
export const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Focus on the canvas, or on nothing in particular (the page itself). */
export const onCanvas = (target: EventTarget | null): boolean =>
  target === document.body ||
  (target instanceof HTMLElement && target.closest('[data-board]') !== null);
