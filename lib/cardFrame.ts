// Checks one camera frame to decide whether the health card is ready to capture.
// Runs in the browser on a small copy of the guide area, a few times a second.
// Pure functions on pixel arrays, so they can be tested without a camera.

/** RGBA pixels, as in canvas ImageData. */
export interface Frame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface FrameCheck {
  /** How many of the card's 4 edges line up with the guide (0 to 4). */
  edges: number;
  /** Higher is sharper (variance of the Laplacian). */
  sharpness: number;
  /** Share of pixels that are blown-out white, from 0 to 1. */
  glare: number;
  /** Grayscale copy, kept to measure movement against the next frame. */
  gray: Uint8Array;
}

export type Problem = 'no_card' | 'glare' | 'blurry' | 'moving';

// Tuned for a frame about 320 px wide. Strict about whether a card is there (so it doesn't
// fire on random scenes), lenient about blur, glare and movement.
export const LIMITS = {
  /** Edges that must be found; 3 allows a thumb over one edge. */
  minEdges: 3,
  /** Only look for an edge this far in from the frame's sides. */
  edgeBand: 0.2,
  /** Brightness jump (0-255) that counts as an edge. */
  edgeContrast: 22,
  /** Share of rows or columns that must show the same straight edge. */
  edgeCoverage: 0.5,
  minSharpness: 35,
  maxGlare: 0.06,
  /** Average brightness change per pixel between checks. */
  maxMotion: 16,
};

export const HINTS: Record<Problem | 'ok', string> = {
  no_card: 'Line the card up with the frame',
  glare: 'Tilt the card a little to remove glare',
  blurry: 'Hold steady so the camera can focus',
  moving: 'Hold still…',
  ok: 'Hold still… capturing',
};

export function toGray({ data, width, height }: Frame): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }
  return gray;
}

/**
 * Looks for one straight card edge near a side of the frame. Scans each line across
 * the band, finds its strongest brightness jump, and counts the lines whose jump is
 * strong and at the same distance from the side as most others. Card print and text
 * give jumps too, but not lined up in a straight row along the whole side.
 * Returns +1 if the inside of the edge is brighter than the outside, -1 if darker, 0 for
 * no edge. A real card on a surface has the same sign on every side.
 */
function edgeSign(gray: Uint8Array, width: number, height: number, side: 'left' | 'right' | 'top' | 'bottom'): number {
  const vertical = side === 'left' || side === 'right';
  const along = vertical ? height : width; // lines to scan
  const across = vertical ? width : height; // pixels per line
  const band = Math.max(4, Math.round(across * LIMITS.edgeBand));
  const at = (line: number, pos: number) => (vertical ? gray[line * width + pos] : gray[pos * width + line]);
  // Skip the corners, which are rounded on a card.
  const from = Math.round(along * 0.15);
  const to = Math.round(along * 0.85);

  const far = side === 'right' || side === 'bottom';
  const hits: { pos: number; sign: number }[] = [];
  for (let line = from; line < to; line++) {
    let best = 0;
    let bestPos = -1;
    let bestSign = 0;
    for (let k = 1; k < band - 1; k++) {
      const pos = far ? across - 1 - k : k;
      // Inside minus outside: moving inward is +pos on near sides, -pos on far sides.
      const diff = far ? at(line, pos - 1) - at(line, pos + 1) : at(line, pos + 1) - at(line, pos - 1);
      if (Math.abs(diff) > best) {
        best = Math.abs(diff);
        bestPos = k;
        bestSign = Math.sign(diff);
      }
    }
    if (best >= LIMITS.edgeContrast) hits.push({ pos: bestPos, sign: bestSign });
  }
  if (hits.length === 0) return 0;

  const sorted = hits.map((h) => h.pos).sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  // Lines on the same straight edge (a few pixels of drift for a tilted card) ...
  const straight = hits.filter((h) => Math.abs(h.pos - median) <= 3);
  // ... that also agree on which side is brighter.
  const up = straight.filter((h) => h.sign > 0).length;
  const down = straight.length - up;
  return Math.max(up, down) / (to - from) >= LIMITS.edgeCoverage ? (up >= down ? 1 : -1) : 0;
}

/** Variance of the Laplacian over the middle of the frame: low means blurry. */
function sharpnessOf(gray: Uint8Array, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = Math.round(height * 0.2); y < Math.round(height * 0.8); y++) {
    for (let x = Math.round(width * 0.1); x < Math.round(width * 0.9); x++) {
      const i = y * width + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function checkFrame(frame: Frame): FrameCheck {
  const { width, height } = frame;
  const gray = toGray(frame);
  const sides = ['left', 'right', 'top', 'bottom'] as const;
  // Count only edges that agree with the majority on which side is brighter, so stray
  // lines in the background (a door frame, a keyboard) don't add up to a "card".
  const signs = sides.map((side) => edgeSign(gray, width, height, side));
  const edges = Math.max(signs.filter((s) => s > 0).length, signs.filter((s) => s < 0).length);
  let blown = 0;
  for (const v of gray) if (v >= 250) blown++;
  return { edges, sharpness: sharpnessOf(gray, width, height), glare: blown / gray.length, gray };
}

/** Average brightness change per pixel between two checks of the same size. */
export function motionBetween(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return Infinity;
  let total = 0;
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}

/** The first thing stopping a capture, or null if the frame is good. Ordered by what to fix first. */
export function problemWith(check: FrameCheck, motion: number): Problem | null {
  if (check.edges < LIMITS.minEdges) return 'no_card';
  if (check.glare > LIMITS.maxGlare) return 'glare';
  // Movement only matters when it costs sharpness: a clearly sharp frame is good even if
  // the hand drifted a little since the last check.
  if (motion > LIMITS.maxMotion && check.sharpness < LIMITS.minSharpness * 2) return 'moving';
  if (check.sharpness < LIMITS.minSharpness) return 'blurry';
  return null;
}

/**
 * The part of the camera frame to keep: the guide box plus a small margin, in video pixels.
 * The guide is drawn guideWidth wide (share of the video width) with the card's shape.
 */
export function cropRect(videoWidth: number, videoHeight: number, guideWidth: number, cardRatio: number) {
  let w = Math.min(videoWidth, videoWidth * guideWidth * 1.08);
  let h = w / cardRatio;
  if (h > videoHeight) {
    h = videoHeight;
    w = h * cardRatio;
  }
  return { x: (videoWidth - w) / 2, y: (videoHeight - h) / 2, w, h };
}
