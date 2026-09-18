import { useState } from 'react';
import { NavLink, Link, Outlet } from 'react-router-dom';
import { ArrowUpRight, FileText, Layers3, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from './auth';
import { ErrorState } from './components';

export function Brand({ light = false }) {
  return (
    <Link to="/rfqs" className={`brand ${light ? 'light' : ''}`} aria-label="Sourcewell home">
      <span className="brand-symbol">
        <Layers3 size={23} strokeWidth={2} />
      </span>
      sourcewell<span className="brand-dot">.</span>
    </Link>
  );
}
export function Layout() {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const buyer = user.role === 'BUYER';
  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      await logout();
    } catch (error) {
      setError(error);
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <span className="workspace-label">RFQ WORKSPACE</span>
          <button
            className="menu-toggle"
            aria-expanded={menu}
            aria-controls="main-nav"
            aria-label={menu ? 'Close navigation' : 'Open navigation'}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
          <nav id="main-nav" className={menu ? 'nav open-nav' : 'nav'} aria-label="Main navigation">
            <NavLink to="/rfqs" onClick={() => setMenu(false)}>
              <FileText size={17} />
              {buyer ? 'My RFQs' : 'Browse RFQs'}
            </NavLink>
            {!buyer && (
              <NavLink to="/quotations" onClick={() => setMenu(false)}>
                My quotations
              </NavLink>
            )}
            {!buyer && (
              <NavLink to="/saved-rfqs" onClick={() => setMenu(false)}>
                Saved RFQs
              </NavLink>
            )}
            <div className="user-chip">
              <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{user.name}</strong>
                <span>{buyer ? 'Buyer' : 'Supplier'} account</span>
              </div>
            </div>
            <button className="logout" onClick={signOut} disabled={busy} aria-label="Log out">
              <LogOut size={19} />
              <span>{busy ? 'Logging out…' : 'Log out'}</span>
            </button>
          </nav>
        </div>
      </header>
      <main id="main" className="main-container">
        {error && <ErrorState error={error} />}
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>
          Sourcewell <span className="footer-divider">/</span> Clear requests. Better connections.
        </span>
        <span>
          Buyer & supplier workspace <ArrowUpRight size={14} />
        </span>
      </footer>
    </div>
  );
}
