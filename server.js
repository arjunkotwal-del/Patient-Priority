// Patient Priority server.
//   npm start         -> serves the built app from ./dist plus the /api routes on PORT (default 3000)
//   npm run dev       -> Vite on 3000 and this API on 3001 (`--dev`); Vite proxies /api here
import express from 'express';
import multer from 'multer';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireUser, getAppMetadata, findUsersByCardHash, setHealthCard } from './server/auth0.js';
import { verifyOntarioCard } from './server/healthCard.js';
import { encrypt, cardHash, checkKeys } from './server/secureStore.js';
import { visitsRouter } from './server/visits.js';
import { doctorRouter } from './server/doctor.js';
import { eventsRouter, eventStreamHandler } from './server/events.js';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* no .env.local: rely on real environment variables (e.g. in production) */
}

const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.PORT) || (DEV ? 3001 : 3000);
const HOST = process.env.HOST || (DEV ? '127.0.0.1' : '0.0.0.0');
const DIST = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist');

const app = express();
app.disable('x-powered-by');

// ---- API ----------------------------------------------------------------

// Card photos are kept in memory only and never written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

/** What the browser is allowed to see: never the number itself, only the last 4 digits. */
function publicStatus(card) {
  if (!card?.verified_at) return { verified: false };
  return {
    verified: true,
    province: card.province,
    last4: card.last4,
    versionCode: card.version_code ?? null,
    legalName: card.legal_name,
    verifiedAt: card.verified_at,
  };
}

// Simple per-user limit on scan attempts (OCR is expensive and this slows guessing).
const attempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60 * 60 * 1000;
function rateLimited(userId) {
  const now = Date.now();
  const recent = (attempts.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(userId, recent);
  return recent.length > MAX_ATTEMPTS;
}

const api = express.Router();
api.use(requireUser);

api.get('/verification', async (req, res, next) => {
  try {
    const meta = await getAppMetadata(req.userId);
    res.json(publicStatus(meta.health_card));
  } catch (err) {
    next(err);
  }
});

api.post('/verification', upload.single('card'), async (req, res, next) => {
  try {
    checkKeys();
    const firstName = String(req.body.firstName ?? '').trim().slice(0, 100);
    const lastName = String(req.body.lastName ?? '').trim().slice(0, 100);
    if (!firstName || !lastName) {
      return res.status(400).json({ code: 'name_required', message: 'Enter your first and last name.' });
    }
    if (!req.file) {
      return res.status(400).json({ code: 'image_required', message: 'Add a photo of the front of your health card.' });
    }
    if (rateLimited(req.userId)) {
      return res.status(429).json({ code: 'rate_limited', message: 'Too many attempts. Try again in an hour.' });
    }

    const existing = await getAppMetadata(req.userId);
    if (existing.health_card?.verified_at) {
      return res.status(409).json({ code: 'already_verified', message: 'Your account is already verified.' });
    }

    let result;
    try {
      result = await verifyOntarioCard(req.file.buffer, firstName, lastName);
    } catch (err) {
      console.warn('Card image could not be processed:', err.message);
      return res.status(400).json({ code: 'bad_image', message: "We couldn't read that image. Try a JPG or PNG photo." });
    } finally {
      req.file.buffer = null; // drop the photo as soon as OCR is done
    }
    if (!result.ok) return res.status(422).json({ code: result.code, message: result.message });

    const hash = cardHash('ON', result.number);
    const owners = (await findUsersByCardHash(hash)).filter((id) => id !== req.userId);
    if (owners.length > 0) {
      return res.status(409).json({
        code: 'card_in_use',
        message: 'This health card is already linked to another account.',
      });
    }

    const card = {
      province: 'ON',
      number_enc: encrypt(result.number),
      hash,
      last4: result.number.slice(-4),
      version_code: result.versionCode,
      legal_name: { first: firstName, last: lastName },
      verified_at: new Date().toISOString(),
    };
    await setHealthCard(req.userId, card);
    res.json(publicStatus(card));
  } catch (err) {
    next(err);
  }
});

api.use(visitsRouter);
api.use(doctorRouter);
api.use(eventsRouter);

// The live stream checks its own one-time ticket, so it sits before the login check.
app.get('/api/events', eventStreamHandler);
app.use('/api', api);
app.use('/api', (_req, res) => res.status(404).json({ code: 'not_found', message: 'Not found.' }));

// ---- Static app (production only; in dev Vite serves the frontend) -------

if (!DEV) {
  app.use(
    express.static(DIST, {
      index: false,
      setHeaders: (res, path) => {
        // Hashed assets can be cached forever; everything else must revalidate.
        res.setHeader(
          'Cache-Control',
          path.includes(`${join('dist', 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );
  // Unknown paths fall back to index.html so React Router routes work on refresh.
  // Missing files with an extension are a real 404, not the app shell.
  app.use((req, res) => {
    if (req.method !== 'GET' || extname(req.path)) return res.status(404).type('text').send('Not Found');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(DIST, 'index.html'));
  });
}

// Never echo internal errors (or anything from the card) back to the client.
app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(500).json({ code: 'server_error', message: 'Something went wrong on our side. Please try again.' });
});

app.listen(PORT, HOST, () => {
  console.log(`Patient Priority ${DEV ? 'API (dev)' : 'server'} running at http://localhost:${PORT}`);
});
