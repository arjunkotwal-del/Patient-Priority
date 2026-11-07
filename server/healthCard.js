// Ontario (OHIP) health card checks: OCR the photo, then decide whether it
// "more or less looks like" a real card and whether the name matches.
// Everything here is offline: no government sites or external lookups.
// The image and OCR text only live in memory for the length of one request.
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { fileURLToPath } from 'node:url';

const CACHE = fileURLToPath(new URL('../.cache/tesseract', import.meta.url));

let workerPromise = null;
function getWorker() {
  // One shared worker; tesseract.js queues concurrent recognize() calls.
  workerPromise ??= createWorker('eng', 1, { cachePath: CACHE, logger: () => {} });
  return workerPromise;
}

/** Prepare a photo for OCR: honour EXIF rotation, upscale small images, boost contrast. */
async function preprocess(buffer, angle) {
  const meta = await sharp(buffer).rotate().metadata();
  const width = Math.max(1600, Math.min(meta.width ?? 1600, 2400));
  return sharp(buffer)
    .rotate() // EXIF orientation
    .rotate(angle)
    .resize({ width })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
}

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

/** Allowed OCR typos: none for short words, 1 for 4–8 letters, 2 for longer. */
const tolerance = (word) => (word.length <= 3 ? 0 : word.length <= 8 ? 1 : 2);

function hasWordLike(tokens, word) {
  return tokens.some((t) => Math.abs(t.length - word.length) <= 2 && levenshtein(t, word) <= tolerance(word));
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
 * (4-3-3 digits, optional 2-letter version code). Returns the first candidate that
 * passes the check digit.
 */
export function findHealthNumber(rawText) {
  const text = normalize(rawText);
  const SEP = '[\\s\\-–—.]*';
  const D = '[0-9OQDILZSBGT]';
  const re = new RegExp(
    `(?<![0-9])(${D}{4})${SEP}(${D}{3})${SEP}(${D}{3})(?![0-9])(?:${SEP}([A-Z]{2})(?![A-Z]))?`,
    'g',
  );
  for (const m of text.matchAll(re)) {
    const digits = (m[1] + m[2] + m[3]).replace(/[^0-9]/g, (c) => DIGIT_FIX[c] ?? c);
    // Need at least 7 real digits so ordinary words don't get "fixed" into numbers.
    const realDigits = (m[1] + m[2] + m[3]).replace(/[^0-9]/g, '').length;
    if (realDigits >= 7 && luhnValid(digits)) {
      return { number: digits, versionCode: m[4] ?? null };
    }
  }
  return null;
}

// ---- Card checks --------------------------------------------------------

export function looksLikeOntarioCard(rawText) {
  const tokens = normalize(rawText).split(/\s+/).map(lettersOnly).filter(Boolean);
  const ontario = hasWordLike(tokens, 'ONTARIO');
  const health = hasWordLike(tokens, 'HEALTH') || hasWordLike(tokens, 'SANTE');
  return { ontario, health, ok: ontario || health };
}

/**
 * Every part of the first and last name the user typed must appear on the card
 * (OCR typos tolerated). Only the first word of the first name is required, since
 * cards often omit or abbreviate middle names.
 */
export function nameMatches(rawText, firstName, lastName) {
  const tokens = normalize(rawText).split(/[\s\-–—.,]+/).map(lettersOnly).filter(Boolean);
  const split = (s) => normalize(s).split(/[\s\-–—.,']+/).map(lettersOnly).filter(Boolean);
  const first = split(firstName).slice(0, 1);
  const last = split(lastName);
  const required = [...first, ...last];
  if (first.length === 0 || last.length === 0) return false;
  return required.every((word) => hasWordLike(tokens, word));
}

/**
 * Full check. Tries the photo upright first, then rotated, in case it was taken sideways.
 * Returns { ok: true, number, versionCode } or { ok: false, code, message }.
 */
export async function verifyOntarioCard(imageBuffer, firstName, lastName) {
  const worker = await getWorker();
  let best = null;

  for (const angle of [0, 180, 90, 270]) {
    const img = await preprocess(imageBuffer, angle);
    const { data } = await worker.recognize(img);
    const text = data.text ?? '';
    const found = findHealthNumber(text);
    const card = looksLikeOntarioCard(text);
    if (found) {
      best = { text, found, card };
      break;
    }
    if (!best && card.ok) best = { text, found: null, card };
  }

  if (!best || !best.found) {
    return {
      ok: false,
      code: 'number_not_found',
      message: best?.card.ok
        ? "We could see the card but couldn't read a valid health number. Try a sharper, well-lit photo with no glare."
        : "This doesn't look like an Ontario health card. Make sure the front of the card fills the frame.",
    };
  }
  if (!best.card.ok) {
    return {
      ok: false,
      code: 'not_a_card',
      message: "This doesn't look like an Ontario health card. Make sure the whole front of the card is visible.",
    };
  }
  if (!nameMatches(best.text, firstName, lastName)) {
    return {
      ok: false,
      code: 'name_mismatch',
      message: "The name on the card doesn't match the name you entered. Enter it exactly as it appears on the card.",
    };
  }
  return { ok: true, number: best.found.number, versionCode: best.found.versionCode };
}
