import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type Verification } from '../auth/AuthContext';
import { HINTS, LIMITS, checkFrame, cropRect, motionBetween, problemWith } from '../../lib/cardFrame.ts';

/** Standard ID-1 card shape (85.6 × 54 mm). */
const CARD_RATIO = 85.6 / 54;
/** Guide frame width as a share of the camera frame; must match .scanner-guide in CSS. */
const GUIDE_WIDTH = 0.86;
const MAX_UPLOAD_PX = 2400;
// Auto capture: check a small copy of the guide area every CHECK_MS, and take the photo
// once STEADY_CHECKS good checks have built up (about a third of a second). One bad
// frame only knocks progress back a step instead of starting over. Meanwhile the
// sharpest frame that clearly shows a card is kept; if the card has been in the frame
// for CARD_SEEN_MS but never quite steady, that frame is used, so nobody has to hold
// perfectly still for long. Frames without a card never count.
const ANALYSIS_WIDTH = 320;
const CHECK_MS = 100;
const STEADY_CHECKS = 3;
const CARD_SEEN_MS = 2500;

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not capture image'))), 'image/jpeg', 0.92),
  );
}

/** Downscale big phone photos before upload; also bakes in EXIF rotation. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_UPLOAD_PX / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvasToBlob(canvas);
}

export function VerifyPage() {
  const { user, logout, getToken, setVerification, verificationError, refreshVerification } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [consent, setConsent] = useState(false);

  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scan, setScan] = useState({ hint: HINTS.no_card, progress: 0 });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  useEffect(() => stopCamera, []);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const startCamera = async () => {
    setCameraError(null);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setPhoto(null);
      setScan({ hint: HINTS.no_card, progress: 0 });
      setCameraOn(true); // the effect below connects the stream once the video element exists
    } catch {
      setCameraError('Camera unavailable or permission denied. You can upload a photo instead.');
    }
  };

  /** Full-resolution copy of the guide area (plus a small margin so the whole card is kept). */
  const grabFrame = (video: HTMLVideoElement, into = document.createElement('canvas')) => {
    const r = cropRect(video.videoWidth, video.videoHeight, GUIDE_WIDTH, CARD_RATIO);
    into.width = Math.round(r.w);
    into.height = Math.round(r.h);
    into.getContext('2d')!.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, into.width, into.height);
    return into;
  };

  /** Takes the photo: from a frame saved earlier, or from the live video. */
  const capture = async (saved?: HTMLCanvasElement) => {
    const video = videoRef.current;
    if (!saved && (!video || !video.videoWidth)) return;
    setPhoto(await canvasToBlob(saved ?? grabFrame(video!)));
    stopCamera();
  };

  // Connect the camera to the video element after React has put it on the page.
  useEffect(() => {
    const video = videoRef.current;
    if (!cameraOn || !video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    video.play().catch(() => setCameraError('The camera started but the preview could not play. Tap "Use camera" again.'));
  }, [cameraOn]);

  // Auto capture: watch the camera and take the photo once the card is lined up, sharp,
  // free of glare and held still. The manual button stays as a backup.
  useEffect(() => {
    if (!cameraOn) return;
    const canvas = document.createElement('canvas');
    canvas.width = ANALYSIS_WIDTH;
    canvas.height = Math.round(ANALYSIS_WIDTH / CARD_RATIO);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let previous: Uint8Array | null = null;
    let good = 0;
    let done = false;
    // How long a card has been in the frame (resets when it leaves).
    let cardSince = 0;
    // Sharpest frame so far that shows a card without glare, kept at full resolution.
    const best = document.createElement('canvas');
    let bestSharpness = 0;

    const finish = (saved?: HTMLCanvasElement) => {
      done = true;
      navigator.vibrate?.(60);
      void capture(saved);
    };

    const timer = setInterval(() => {
      const video = videoRef.current;
      if (done || !ctx || !video || !video.videoWidth || video.readyState < 2) return;
      const r = cropRect(video.videoWidth, video.videoHeight, GUIDE_WIDTH, CARD_RATIO);
      ctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
      const check = checkFrame(ctx.getImageData(0, 0, canvas.width, canvas.height));
      const problem = problemWith(check, previous ? motionBetween(previous, check.gray) : Infinity);
      previous = check.gray;

      if (problem === 'no_card') {
        // Card gone: forget the saved frame so a later fallback can't use an old one.
        cardSince = 0;
        bestSharpness = 0;
      } else {
        cardSince ||= performance.now();
        // Remember the sharpest card frame without glare (movement and slight blur are OK).
        if (problem !== 'glare' && check.sharpness > bestSharpness) {
          bestSharpness = check.sharpness;
          grabFrame(video, best);
        }
      }

      good = problem ? Math.max(0, good - 1) : good + 1;
      setScan({ hint: HINTS[problem ?? 'ok'], progress: Math.min(1, good / STEADY_CHECKS) });
      if (good >= STEADY_CHECKS) return finish();
      // Card held up for a while but never steady: use its sharpest frame, unless hopelessly blurry.
      const cardHeld = cardSince > 0 && performance.now() - cardSince > CARD_SEEN_MS;
      if (cardHeld && bestSharpness >= LIMITS.minSharpness * 0.7) finish(best);
    }, CHECK_MS);
    return () => clearInterval(timer);
    // capture only uses refs and state setters, so it is safe to leave out.
  }, [cameraOn]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    stopCamera();
    try {
      setPhoto(await shrink(file));
    } catch {
      setError("That file couldn't be opened as an image.");
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!photo) return setError('Take or upload a photo of your card first.');
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('firstName', firstName.trim());
      form.append('lastName', lastName.trim());
      form.append('card', photo, 'card.jpg');
      const res = await fetch('/api/verification', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await getToken()}` },
        body: form,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? `Server error (${res.status})`);
      setVerification(body as Verification);
      navigate('/visits', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const ready = firstName.trim() && lastName.trim() && photo && consent && !submitting;

  return (
    <div className="public">
      <header className="public-header">
        <span className="side-brand">
          <span className="logo" aria-hidden="true">+</span>
          <span><strong>PatientPriority</strong><span>Identity check</span></span>
        </span>
        <div className="row">
          <span className="mono faint">{user?.email}</span>
          <button className="btn btn-ghost" onClick={logout}>Log out</button>
        </div>
      </header>

      <main className="page page-narrow">
        <form className="card verify" onSubmit={onSubmit}>
          <div>
            <span className="eyebrow">One-time step</span>
            <h1>Verify your health card</h1>
          </div>
          <p className="muted">
            One last step. We check that your Ontario health card matches your name before you can use Patient
            Priority.
          </p>

          {verificationError && (
            <p className="error">
              Couldn't reach the server: {verificationError}{' '}
              <button type="button" className="link-btn" onClick={() => void refreshVerification()}>
                Retry
              </button>
            </p>
          )}

          <fieldset>
            <legend>1. Your name, exactly as it appears on the card</legend>
            <div className="row">
              <label>
                First name
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" required />
              </label>
              <label>
                Last name
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" required />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>2. Photo of the front of your card</legend>
            <p className="muted small">
              Hold the card inside the frame on a dark, plain surface. The photo is taken automatically when the card
              is clear.
            </p>

            {cameraOn ? (
              <div className="scanner">
                <video ref={videoRef} playsInline muted />
                <div className={scan.progress > 0 ? 'scanner-guide locking' : 'scanner-guide'} aria-hidden="true" />
                <div className="scanner-hint" role="status" aria-live="polite">
                  <p>{scan.hint}</p>
                  <div className="scanner-progress" aria-hidden="true">
                    <span style={{ transform: `scaleX(${scan.progress})` }} />
                  </div>
                </div>
              </div>
            ) : preview ? (
              <img className="scanner-preview" src={preview} alt="Your health card photo" />
            ) : (
              <div className="scanner-empty muted">No photo yet</div>
            )}

            <div className="row-buttons">
              {cameraOn ? (
                <>
                  <button type="button" className="btn" onClick={() => void capture()}>Take photo now</button>
                  <button type="button" className="btn btn-ghost" onClick={stopCamera}>Cancel</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn" onClick={() => void startCamera()}>
                    {photo ? 'Retake with camera' : 'Use camera'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
                    Upload photo
                  </button>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  void onFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            {cameraError && <p className="error">{cameraError}</p>}
          </fieldset>

          <label className="checkbox">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              I agree to Patient Priority reading this card to verify my identity. The photo is checked once and not
              saved. My health number is stored encrypted and linked to my account.
            </span>
          </label>

          {error && <p className="error">{error}</p>}

          <button className="btn btn-lg" type="submit" disabled={!ready}>
            {submitting ? 'Checking your card…' : 'Verify'}
          </button>
        </form>
      </main>
    </div>
  );
}
