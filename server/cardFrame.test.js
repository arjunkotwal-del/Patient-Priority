import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkFrame, cropRect, LIMITS, motionBetween, problemWith } from '../lib/cardFrame.ts';

const W = 320;
const H = 202;
// The card fills the frame minus the small margin cropRect adds around the guide.
const INSET = Math.round(W * 0.04);

/** Builds an RGBA frame from a brightness function. */
function frame(shade) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = shade(x, y);
      const p = (y * W + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = v;
      data[p + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

const onCard = (x, y) => x >= INSET && x < W - INSET && y >= INSET && y < H - INSET;
/** Rows of small dark "letters" on a light card, like printed text. */
const text = (x, y) => (Math.floor(y / 6) % 3 === 0 && Math.floor(x / 3) % 2 === 0 ? 60 : 200);

const sharpCard = frame((x, y) => (onCard(x, y) ? text(x, y) : 35));

describe('checkFrame', () => {
  it('passes a sharp card lined up with the guide', () => {
    const check = checkFrame(sharpCard);
    assert.equal(check.edges, 4);
    assert.ok(check.sharpness >= LIMITS.minSharpness, `sharpness ${check.sharpness}`);
    assert.equal(problemWith(check, 0), null);
  });

  it('finds no card in an empty frame', () => {
    assert.equal(problemWith(checkFrame(frame(() => 120)), 0), 'no_card');
  });

  it('finds no card when busy texture fills the frame but no edges line up', () => {
    let seed = 7;
    const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256);
    assert.equal(problemWith(checkFrame(frame(() => noise())), 0), 'no_card');
  });

  it('still passes with a thumb over one edge', () => {
    const thumb = frame((x, y) => (x < W * 0.2 ? 150 : onCard(x, y) ? text(x, y) : 35));
    const check = checkFrame(thumb);
    assert.equal(check.edges, 3);
    assert.equal(problemWith(check, 0), null);
  });

  it('calls a card with no fine detail blurry', () => {
    const blurry = frame((x, y) => (onCard(x, y) ? 140 + Math.round(30 * Math.sin(x / 25)) : 35));
    assert.equal(problemWith(checkFrame(blurry), 0), 'blurry');
  });

  it('spots glare', () => {
    const glare = frame((x, y) => (onCard(x, y) && x > W * 0.4 && x < W * 0.6 && y > H * 0.3 && y < H * 0.7 ? 255 : onCard(x, y) ? text(x, y) : 35));
    assert.equal(problemWith(checkFrame(glare), 0), 'glare');
  });
});

describe('motionBetween', () => {
  it('is zero for the same frame and large for a shifted one', () => {
    const a = checkFrame(sharpCard).gray;
    const shifted = checkFrame(frame((x, y) => (onCard(x + 9, y) ? text(x + 9, y) : 35))).gray;
    assert.equal(motionBetween(a, a), 0);
    assert.ok(motionBetween(a, shifted) > LIMITS.maxMotion);
    assert.equal(problemWith(checkFrame(sharpCard), motionBetween(a, shifted)), 'moving');
  });
});

describe('cropRect', () => {
  it('keeps the card shape and stays inside the video', () => {
    for (const [vw, vh] of [[1920, 1080], [1080, 1920], [640, 480]]) {
      const r = cropRect(vw, vh, 0.86, 85.6 / 54);
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= vw + 1e-6 && r.y + r.h <= vh + 1e-6);
      assert.ok(Math.abs(r.w / r.h - 85.6 / 54) < 1e-9);
    }
  });
});
