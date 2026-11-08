import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <div className="landing">
      <div className="utility-bar"><div className="site-width">Patient information & clinical care <span>Patient Priority</span></div></div>
      <header className="topbar public-header">
        <a className="skip-link" href="#main-content">Skip to content</a>
        <Link to="/" className="brand"><span className="brand-mark" aria-hidden="true">+</span>Patient Priority</Link>
        <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#care-access">Access your care</a></nav>
        <Link to="/login" className="btn btn-ghost">Log in <span aria-hidden="true">↗</span></Link>
      </header>
      <main id="main-content">
        <section className="hero site-width" aria-labelledby="hero-title">
          <div className="hero-copy" data-enter>
            <p className="eyebrow">PATIENTS & CARE TEAMS</p>
            <h1 id="hero-title">Patient care,<br />in one place.</h1>
            <p className="hero-description">Your health information and your care team, in one place. Get started as a patient or sign in to your clinical workspace.</p>
            <Link to="/login" className="btn btn-lg">Access your account <span aria-hidden="true">→</span></Link>
            <p className="hero-note"><span className="status-dot" aria-hidden="true" /> Account access for patients and clinicians</p>
          </div>
          <div className="care-guide" aria-label="Your patient journey">
            <div className="guide-header"><span className="eyebrow">YOUR PATIENT JOURNEY</span><span className="guide-symbol" aria-hidden="true">+</span></div>
            <h2>Start with the essentials.</h2>
            <ol className="journey-list">
              <li><span className="step-number">1</span><div><h3>Access your account</h3><p>Log in or create an account to begin.</p></div></li>
              <li><span className="step-number">2</span><div><h3>Verify your health card</h3><p>Have your Ontario health card ready.</p></div></li>
              <li><span className="step-number">3</span><div><h3>Open your patient resources</h3><p>Find your medical reference and account details.</p></div></li>
            </ol>
            <div className="guide-footer">Already registered? <Link to="/login">Log in to continue <span aria-hidden="true">→</span></Link></div>
          </div>
        </section>
        <div className="emergency-notice site-width" role="note"><span className="notice-icon" aria-hidden="true">!</span><p><strong>Need emergency care?</strong> This website is not an emergency service. For a medical emergency, call 911 or go to your nearest emergency department.</p></div>
        <section className="access-section site-width" id="care-access" aria-labelledby="access-title">
          <div className="section-heading"><p className="eyebrow">THE RIGHT PLACE TO START</p><h2 id="access-title">Access for every part of care.</h2></div>
          <div className="access-grid">
            <Link className="access-card patient-access" to="/login"><span className="access-label">FOR PATIENTS</span><h3>Your patient account <span aria-hidden="true">↗</span></h3><p>Verify your health card, open patient resources, and manage your account preferences.</p><span className="access-action">Access patient services <span aria-hidden="true">→</span></span></Link>
            <Link className="access-card clinician-access" to="/doctor/login"><span className="access-label">FOR CLINICIANS</span><h3>Your clinical workspace <span aria-hidden="true">↗</span></h3><p>Work through the patient queue: give advice or schedule an in-person meeting.</p><span className="access-action">Doctor login <span aria-hidden="true">→</span></span></Link>
          </div>
        </section>
        <section className="how-section" id="how-it-works" aria-labelledby="how-title"><div className="site-width how-layout"><div><p className="eyebrow">BEFORE YOU BEGIN</p><h2 id="how-title">Account access & preparation.</h2><p className="muted">Simple steps so you know what to expect.</p></div><div className="info-list"><div><h3>One account to get started</h3><p>New here? Choose “Create an account” on the login page. Returning users can log in with their existing account.</p></div><div><h3>Health card verification for patients</h3><p>Patients verify their Ontario health card before opening patient resources. Doctors have their own login, set up by the clinic, and never need a health card.</p></div><div><h3>Text size and appearance</h3><p>Adjust text size and appearance in Settings once you are signed in.</p></div></div></div></section>
      </main>
      <footer className="footer site-width"><Link to="/" className="brand">Patient Priority</Link><span>Patient information. Care team access.</span><span>© {new Date().getFullYear()} Patient Priority</span></footer>
    </div>
  );
}
