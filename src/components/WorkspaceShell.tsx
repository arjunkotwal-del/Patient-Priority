import { BrandLogo } from './BrandLogo';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './LineIcon';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  count?: number;
}
interface Props {
  role: 'patient' | 'doctor';
  name: string;
  email?: string;
  items: NavItem[];
  logout: () => void;
  children: ReactNode;
}

export function WorkspaceShell({ role, name, email, items, logout, children }: Props) {
  const key = `pp.sidebar.${role}`;
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(key) === 'collapsed';
    } catch {
      return false;
    }
  });
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [open, setOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const current = items.find((i) =>
    i.end ? location.pathname === i.to : location.pathname.startsWith(i.to),
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const changed = () => {
      setMobile(media.matches);
      setOpen(false);
    };
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    try {
      localStorage.setItem(key, collapsed ? 'collapsed' : 'expanded');
    } catch {
      /* preference is optional */
    }
  }, [key, collapsed]);
  useEffect(() => {
    if (!mobile || !open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = sidebar.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)');
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keyboard);
      toggle.current?.focus();
    };
  }, [mobile, open]);

  return (
    <div
      className={`workspace ${collapsed ? 'sidebar-collapsed' : ''} ${open ? 'sidebar-open' : ''}`}
      data-workspace={role}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobile && open && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          tabIndex={-1}
        />
      )}
      <aside
        ref={sidebar}
        id="workspace-sidebar"
        className="workspace-sidebar"
        aria-label={`${role === 'doctor' ? 'Clinical' : 'Patient'} navigation`}
        role={mobile && open ? 'dialog' : undefined}
        aria-modal={mobile && open ? true : undefined}
        inert={mobile && !open}
      >
        <div className="sidebar-brand-row">
          <Link
            className="brand"
            to={role === 'doctor' ? '/doctor' : '/dashboard'}
            aria-label="Patient Priority dashboard"
          >
            <BrandLogo />
          </Link>
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <p className="sidebar-role sidebar-label">
          {role === 'doctor' ? 'CLINICIAN WORKSPACE' : 'PATIENT PORTAL'}
        </p>
        <nav>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={item.label}
              aria-label={item.count ? `${item.label}, ${item.count} unread` : item.label}
              className="sidebar-link"
            >
              <Icon name={item.icon} />
              <span className="sidebar-label">{item.label}</span>
              {!!item.count && <span className="sidebar-count">{item.count}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-support sidebar-label">
            <span className="status-dot" />
            {role === 'doctor' ? 'Clinical access' : 'Your care workspace'}
            <p>
              {role === 'doctor'
                ? 'Review patient information and coordinate next steps.'
                : 'Your visits and care updates, together.'}
            </p>
          </div>
          <div className="sidebar-profile">
            <span className="avatar" aria-hidden="true">
              {name.slice(0, 1).toUpperCase() || 'P'}
            </span>
            <div className="sidebar-label">
              <strong>{name}</strong>
              <span>{email}</span>
            </div>
          </div>
          <button
            className="sidebar-link logout-button"
            onClick={logout}
            aria-label="Log out"
            title="Log out"
          >
            <Icon name="logout" />
            <span className="sidebar-label">Log out</span>
          </button>
        </div>
      </aside>
      <div className="workspace-body" inert={mobile && open}>
        <header className="workspace-topbar">
          <button
            ref={toggle}
            className="icon-button"
            aria-label={mobile ? 'Open navigation' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-controls="workspace-sidebar"
            aria-expanded={mobile ? open : !collapsed}
            onClick={() => (mobile ? setOpen(!open) : setCollapsed(!collapsed))}
          >
            <Icon name={mobile ? 'menu' : 'collapse'} />
          </button>
          <div className="workspace-breadcrumb">
            {role === 'doctor' ? 'Clinical workspace' : 'Patient portal'}
            <span aria-hidden="true">/</span>
            <strong>{current?.label ?? (role === 'doctor' ? 'Patient case' : 'Consultation')}</strong>
          </div>
          <div className="workspace-identity">
            <span className="role-chip">{role === 'doctor' ? 'Clinician' : 'Patient'}</span>
            <span className="avatar avatar-small" aria-hidden="true">
              {name.slice(0, 1).toUpperCase() || 'P'}
            </span>
            <span>{name}</span>
          </div>
        </header>
        <main id="main-content" className="workspace-main" tabIndex={-1}>
          {children}
        </main>
        <footer className="workspace-footer">
          <span>Patient Priority</span>
          <span>
            {role === 'doctor'
              ? 'Clinical information for authorized care teams'
              : 'For a medical emergency, call 911.'}
          </span>
        </footer>
      </div>
    </div>
  );
}
