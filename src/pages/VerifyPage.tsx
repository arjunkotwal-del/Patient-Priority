import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type Verification } from '../auth/AuthContext';

/** Standard ID-1 card shape (85.6 × 54 mm). */
const CARD_RATIO = 85.6 / 54;
/** Guide frame width as a share of the camera frame; must match .scanner-guide in CSS. */
const GUIDE_WIDTH = 0.86;
const MAX_UPLOAD_PX = 2400;

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
      setCameraOn(true);
      // Video element mounts after cameraOn flips.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setCameraError('Camera unavailable or permission denied. You can upload a photo instead.');
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    // Crop to the guide frame plus a small margin so the whole card is kept.
    let w = Math.min(vw, vw * GUIDE_WIDTH * 1.08);
    let h = w / CARD_RATIO;
    if (h > vh) {
      h = vh;
      w = h * CARD_RATIO;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);
    canvas.getContext('2d')!.drawImage(video, (vw - w) / 2, (vh - h) / 2, w, h, 0, 0, w, h);
    setPhoto(await canvasToBlob(canvas));
    stopCamera();
  };

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
      navigate('/medical', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const ready = firstName.trim() && lastName.trim() && photo && consent && !submitting;

  return (
    <div className="landing">
      <header className="topbar">
        <span className="brand">Patient Priority</span>
        <div className="topbar-user">
          <span>{user?.email}</span>
          <button className="btn btn-ghost" onClick={logout}>Log out</button>
        </div>
      </header>

      <main className="content">
        <form className="panel verify" onSubmit={onSubmit}>
          <h1>Verify your health card</h1>
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

            {cameraOn ? (
              <div className="scanner">
                <video ref={videoRef} playsInline muted />
                <div className="scanner-guide" aria-hidden="true" />
                <p className="scanner-hint">Fit the card inside the frame. Avoid glare.</p>
              </div>
            ) : preview ? (
              <img className="scanner-preview" src={preview} alt="Your health card photo" />
            ) : (
              <div className="scanner-empty muted">No photo yet</div>
            )}

            <div className="row-buttons">
              {cameraOn ? (
                <>
                  <button type="button" className="btn" onClick={() => void capture()}>Capture</button>
                  <button type="button" className="btn btn-ghost" onClick={stopCamera}>Cancel</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn" onClick={() => void startCamera()}>
                    {photo ? 'Retake with camera' : 'Use camera'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
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
