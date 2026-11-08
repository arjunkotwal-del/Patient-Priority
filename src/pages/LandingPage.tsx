import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <div className="public">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="public-header">
        <Link to="/" className="side-brand">
          <span className="logo" aria-hidden="true">+</span>
          <span><strong>PatientPriority</strong><span>Virtual fast track</span></span>
        </Link>
        <div className="row">
          <Link to="/login" state={{ from: { pathname: '/doctor' } }} className="btn btn-ghost">Clinician login</Link>
          <Link to="/login" className="btn btn-secondary">Log in</Link>
        </div>
      </header>

      <main id="main-content" className="wrap">
        <section className="hero" aria-labelledby="hero-title">
          <div>
            <span className="eyebrow">Ontario emergency department · CTAS 4 and 5</span>
            <h1 id="hero-title">Minor problem?<br /><em>Skip the waiting room.</em></h1>
            <p className="hero-lead">
              Sore throat, sprain, rash or ear pain? Tell us what's going on from your phone. A doctor reviews your answers and
              replies once with a plan, or a time to be seen in person.
            </p>
            <div className="hero-actions">
              <Link to="/login" className="btn btn-lg">Start a visit →</Link>
              <a href="#how" className="btn btn-lg btn-secondary">How it works</a>
            </div>
          </div>

          <div className="preview" aria-label="Example consultation">
            <span className="chat-stamp">Private consultation · example</span>
            <div className="msg">
              <span className="msg-icon" aria-hidden="true">+</span>
              <div className="msg-main">
                <div className="msg-head"><strong>Intake assistant</strong><span className="msg-tag">AI</span></div>
                <div className="msg-body">Is the pain getting better, worse, or staying the same?</div>
              </div>
            </div>
            <div className="msg msg-patient">
              <span className="msg-icon" aria-hidden="true">You</span>
              <div className="msg-main">
                <div className="msg-body">A bit worse since yesterday.</div>
              </div>
            </div>
            <div className="msg msg-doctor">
              <span className="msg-icon" aria-hidden="true">Dr</span>
              <div className="msg-main">
                <div className="msg-head"><strong>Your doctor</strong><span className="msg-tag">Doctor</span></div>
                <div className="msg-body">Here's your plan, with a prescription you can pick up today.</div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="steps" aria-label="How it works">
          <div className="step">
            <span className="mono">01 · Describe it</span>
            <h3>Tell us what's wrong</h3>
            <p>In your own words, then tap through a few quick questions.</p>
          </div>
          <div className="step">
            <span className="mono">02 · Follow-up</span>
            <h3>The AI asks the right questions</h3>
            <p>About 4 to 8 follow-ups, so the doctor gets the full picture.</p>
          </div>
          <div className="step">
            <span className="mono">03 · One reply</span>
            <h3>A doctor answers once</h3>
            <p>A plan with any prescriptions and tests, or in-person times to pick from.</p>
          </div>
        </section>

        <p className="emergency" role="note">
          <span><strong>Not for emergencies.</strong> Chest pain, trouble breathing or anything that feels serious: go to the triage desk now, or call 911.</span>
        </p>
      </main>

      <footer className="footer">
        <span>PatientPriority</span>
        <span>Demo build · fake patient data only</span>
      </footer>
    </div>
  );
}
