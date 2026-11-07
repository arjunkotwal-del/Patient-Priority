// Ontario (OHIP) health card checks: OCR the photo, then decide whether it
// "more or less looks like" a real card and whether the name matches.
// Everything here is offline: no government sites or external lookups.
// The image and OCR text only live in memory for the length of one request.
import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import { fileURLToPath } from 'node:url';

const CACHE = fileURLToPath(new URL('../.cache/tesseract', import.meta.url));

// The worker is shared and each OCR attempt changes its settings, so attempts from
// different requests must not interleave. This chains them one after another.
let queue = Promise.resolve();
function exclusive(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

let workerPromise = null;
function getWorker() {
  // One shared worker; tesseract.js queues concurrent recognize() calls.
  // If starting it fails, forget it so the next scan tries again instead of failing forever.
  workerPromise ??= createWorker('eng', 1, { cachePath: CACHE, logger: () => {} }).catch((err) => {
    workerPromise = null;
    throw err;
  });
  return workerPromise;
}

/** Throws away a worker that failed mid-scan, so the next scan starts a fresh one. */
async function resetWorker() {
  const old = workerPromise;
  workerPromise = null;
  try {
    await (await old)?.terminate();
  } catch {
    /* already gone */
  }
}

/**
 * Prepare a photo for OCR: honour EXIF rotation, upscale small images, boost contrast.
 * - plain: global contrast stretch.
 * - local: local contrast (CLAHE), which lifts text off the card's patterned green
 *   background and evens out shadows and glare.
 * - threshold: local contrast, then pure black and white.
 */
async function preprocess(buffer, angle, variant = 'plain') {
  // Stage 1 makes an 8-bit grayscale image; CLAHE refuses the float data resize produces.
  const gray = await sharp(buffer)
    .rotate() // EXIF orientation
    .rotate(angle)
    .resize({ width: 2000 }) // cards need about 30 px tall text for good OCR
    .grayscale()
    .png()
    .toBuffer();
  // sharp runs operations in its own fixed order, so CLAHE gets its own pass too.
  const base = variant === 'plain' ? gray : await sharp(gray).clahe({ width: 80, height: 80, maxSlope: 4 }).png().toBuffer();
  let img = sharp(base);
  img = variant === 'plain' ? img.normalize().sharpen() : img.sharpen();
  if (variant === 'threshold') img = img.median(3).threshold(140);
  return img.png().toBuffer();
}

/**
 * OCR attempts, in order. Sparse-text mode suits ID cards, where text is scattered
 * around a photo and logos instead of flowing in paragraphs. The digits-only pass
 * reads the health number more reliably than a full-alphabet pass.
 */
const ATTEMPTS = [
  { angle: 0, variant: 'local', psm: PSM.SPARSE_TEXT },
  { angle: 0, variant: 'local', psm: PSM.SPARSE_TEXT, digits: true },
  { angle: 0, variant: 'plain', psm: PSM.AUTO },
  { angle: 0, variant: 'threshold', psm: PSM.SPARSE_TEXT },
  { angle: 180, variant: 'local', psm: PSM.SPARSE_TEXT },
  { angle: 90, variant: 'local', psm: PSM.SPARSE_TEXT },
  { angle: 270, variant: 'local', psm: PSM.SPARSE_TEXT },
];

async function ocr(worker, buffer, { angle, variant, psm, digits }) {
  const img = await preprocess(buffer, angle, variant);
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    tessedit_char_whitelist: digits ? '0123456789- ' : '',
  });
  const { data } = await worker.recognize(img);
  return data.text ?? '';
}

/** OCR text with every digit hidden, safe enough for a dev log. */
const masked = (text) => text.replace(/\d/g, '#').replace(/\s+/g, ' ').trim().slice(0, 400);

// ---- Text helpers -------------------------------------------------------

/** Uppercase, strip accents, keep letters/digits/spaces. */
export function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s\-–—.,]/g, ' ');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Allowed OCR typos (lenient): 0 for 1–2 letters, 1 for 3–5, 2 for 6–9, 3 for longer. */
const tolerance = (word) => (word.length <= 2 ? 0 : word.length <= 5 ? 1 : word.length <= 9 ? 2 : 3);

function hasWordLike(tokens, word) {
  if (tokens.some((t) => Math.abs(t.length - word.length) <= 3 && levenshtein(t, word) <= tolerance(word))) return true;
  // OCR often glues words together ("SMITHJOHN"), so also look in the joined text.
  return word.length >= 4 && tokens.join('').includes(word);
}

const lettersOnly = (s) => s.replace(/[^A-Z]/g, '');

// ---- Health number ------------------------------------------------------

/** Luhn (mod 10) check used by Ontario health numbers. */
export function luhnValid(digits) {
  if (!/^\d{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let d = Number(digits[9 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

// Characters OCR commonly reads in place of digits.
const DIGIT_FIX = { O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', Z: '2', S: '5', B: '8', G: '6', T: '7' };

/**
 * Find an Ontario health number in OCR text. Card layout is "1234 - 567 - 890 - AB"
 * (4-3-3 digits, optional 2-letter version code). Lenient: prefers a number that passes
 * the check digit, but falls back to any 10-digit number, since OCR often misreads one
 * digit. `checked` says whether the check digit passed.
 */
export function findHealthNumber(rawText) {
  const text = normalize(rawText);
  const SEP = '[\\s\\-–—.,]*';
  const D = '[0-9OQDILZSBGT]';
  const VERSION = `(?:${SEP}([A-Z]{2})(?![A-Z]))?`;
  const patterns = [
    // Usual 4-3-3 grouping.
    new RegExp(`(?<![0-9])(${D}{4}${SEP}${D}{3}${SEP}${D}{3})(?![0-9])${VERSION}`, 'g'),
    // Any 10 digit-like characters, split anywhere (OCR groups digits oddly).
    new RegExp(`(?<![0-9])((?:${D}${SEP}){9}${D})(?![0-9])${VERSION}`, 'g'),
  ];
  let fallback = null;
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const raw = m[1].replace(/[^0-9A-Z]/g, '');
      if (raw.length !== 10) continue;
      const digits = raw.replace(/[^0-9]/g, (c) => DIGIT_FIX[c] ?? c);
      // Need mostly real digits so ordinary words don't get "fixed" into numbers.
      const realDigits = raw.replace(/[^0-9]/g, '').length;
      if (realDigits < 7) continue;
      const versionCode = m[2] ?? null;
      if (luhnValid(digits)) return { number: digits, versionCode, checked: true };
      if (!fallback && realDigits >= 8) fallback = { number: digits, versionCode, checked: false };
    }
  }
  return fallback;
}

// ---- Card checks --------------------------------------------------------

export function looksLikeOntarioCard(rawText) {
  const tokens = normalize(rawText).split(/\s+/).map(lettersOnly).filter(Boolean);
  const ontario = hasWordLike(tokens, 'ONTARIO');
  const health = hasWordLike(tokens, 'HEALTH') || hasWordLike(tokens, 'SANTE');
  return { ontario, health, ok: ontario || health };
}

/**
 * Lenient name check: passes when the first word of the first name OR any part of the
 * last name appears on the card, with OCR typos tolerated.
 */
export function nameMatches(rawText, firstName, lastName) {
  const tokens = normalize(rawText).split(/[\s\-–—.,]+/).map(lettersOnly).filter(Boolean);
  const split = (s) => normalize(s).split(/[\s\-–—.,']+/).map(lettersOnly).filter(Boolean);
  const first = split(firstName).slice(0, 1);
  const last = split(lastName);
  if (first.length === 0 || last.length === 0) return false;
  return [...first, ...last].some((word) => hasWordLike(tokens, word));
}

/**
 * Full check (lenient). Runs the OCR attempts in order and stops once it has a
 * check-digit-valid number and the name (or, after the upright attempts, any 10-digit
 * number and the name). The "ONTARIO / HEALTH" wording is not required, and the name
 * is looked for in the text from every attempt.
 * With `debug`, logs what was read (digits masked) so failures on real cards can be tuned.
 * Returns { ok: true, number, versionCode } or { ok: false, code, message }.
 */
export function verifyOntarioCard(imageBuffer, firstName, lastName, { debug = false } = {}) {
  return exclusive(() => runCheck(imageBuffer, firstName, lastName, debug));
}

async function runCheck(imageBuffer, firstName, lastName, debug) {
  const worker = await getWorker();
  const texts = [];
  let found = null;
  let sawCard = false;
  let nameOk = false;
  const started = Date.now();

  for (const [i, attempt] of ATTEMPTS.entries()) {
    let text;
    try {
      text = await ocr(worker, imageBuffer, attempt);
    } catch (err) {
      await resetWorker();
      throw err;
    }
    texts.push(text);
    if (looksLikeOntarioCard(text).ok) sawCard = true;
    const hit = findHealthNumber(text);
    if (hit && (!found || (hit.checked && !found.checked))) found = { ...hit, versionCode: hit.versionCode ?? found?.versionCode ?? null };
    else if (hit && found && !found.versionCode) found.versionCode = hit.versionCode;
    nameOk ||= nameMatches(text, firstName, lastName);
    if (debug) {
      console.log(
        `[card] attempt ${i + 1} (${attempt.variant}, ${attempt.angle}°, psm ${attempt.psm}${attempt.digits ? ', digits' : ''}):`,
        `number=${hit ? `******${hit.number.slice(-4)}${hit.checked ? ' (check digit ok)' : ' (check digit FAILED)'}` : 'none'}`,
        `name=${nameOk} card-words=${sawCard}\n  text: ${masked(text)}`,
      );
    }
    const uprightDone = i >= 3;
    if (found && nameOk && (found.checked || uprightDone)) break;
  }
  if (debug) console.log(`[card] done in ${Date.now() - started} ms: number=${!!found} name=${nameOk}`);

  if (!found) {
    return {
      ok: false,
      code: 'number_not_found',
      message: sawCard
        ? "We could see the card but couldn't read the health number. Try a sharper, well-lit photo with no glare."
        : "We couldn't read a health number. Make sure the front of the card fills the frame.",
    };
  }
  if (!nameOk && !nameMatches(texts.join('\n'), firstName, lastName)) {
    return {
      ok: false,
      code: 'name_mismatch',
      message: "We couldn't find your name on the card. Check the spelling matches the card.",
    };
  }
  return { ok: true, number: found.number, versionCode: found.versionCode };
}
