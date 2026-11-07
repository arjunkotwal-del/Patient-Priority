import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <div className="landing">
      <header className="topbar">
        <span className="brand">Patient Priority</span>
        <div className="topbar-user">
          <Link to="/login" className="btn btn-ghost">Log in</Link>
          <Link to="/login" className="btn">Sign up</Link>
        </div>
      </header>

      <section className="hero">
        <h1>Know who needs care first.</h1>
        <p>
          Patient Priority puts the medical reference your team relies on in one place,
          available as soon as you sign in.
        </p>
        <Link to="/login" className="btn btn-lg">Get started</Link>
      </section>

      <section className="features">
        <div className="card">
          <h3>One reference page</h3>
          <p>Everything on a single page you can scroll or jump through.</p>
        </div>
        <div className="card">
          <h3>Private by default</h3>
          <p>Content is only visible to signed-in users.</p>
        </div>
        <div className="card">
          <h3>Your preferences</h3>
          <p>Settings and account details that stay with you.</p>
        </div>
      </section>

      <footer className="footer">© {new Date().getFullYear()} Patient Priority</footer>
    </div>
  );
}
