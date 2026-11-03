/**
 * Structural frame size on the board (board units). Real device sizes come from the devices pack
 * (F6); until one is active, frames use this neutral size and never claim to be a device.
 */
export const FRAME_WIDTH = 360;
export const FRAME_HEIGHT = 760;

export interface FrameSize {
  width: number;
  height: number;
}

export const DEFAULT_FRAME_SIZE: FrameSize = { width: FRAME_WIDTH, height: FRAME_HEIGHT };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boundsOf(
  points: readonly { x: number; y: number }[],
  size: FrameSize = DEFAULT_FRAME_SIZE,
): Rect {
  if (points.length === 0) return { x: 0, y: 0, width: size.width, height: size.height };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + size.width);
    maxY = Math.max(maxY, y + size.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Saved positions are in board units laid out for the default frame size. A larger frame
 * (landscape, tablet, unfolded foldable) spreads them by the same factor so frames never overlap;
 * moves divide by it, so the document does not depend on the device being previewed.
 */
export const boardScale = (size: FrameSize): number =>
  Math.max(1, size.width / DEFAULT_FRAME_SIZE.width, size.height / DEFAULT_FRAME_SIZE.height);
