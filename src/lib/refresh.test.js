import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { subscribeToRefresh } from './refresh.ts';

const oldWindow = globalThis.window;
const oldDocument = globalThis.document;
let tick, cleared, interval;
beforeEach(() => {
  const document = new EventTarget();
  document.visibilityState = 'visible';
  globalThis.document = document;
  cleared = false;
  globalThis.window = {
    setInterval(callback, ms) {
      tick = callback;
      interval = ms;
      return 42;
    },
    clearInterval(id) {
      cleared = id === 42;
    },
  };
});
afterEach(() => {
  if (oldWindow === undefined) delete globalThis.window;
  else globalThis.window = oldWindow;
  if (oldDocument === undefined) delete globalThis.document;
  else globalThis.document = oldDocument;
});

describe('refresh fallback', () => {
  it('refreshes visible tabs every minute when the live stream is unavailable', () => {
    let count = 0;
    const stop = subscribeToRefresh(() => count++);
    assert.equal(interval, 60_000);
    tick();
    assert.equal(count, 1);
    document.visibilityState = 'hidden';
    tick();
    assert.equal(count, 1);
    document.visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(count, 2);
    stop();
    assert.ok(cleared);
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(count, 2);
  });
});
