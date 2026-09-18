import React, { Component, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, Protected } from './auth';
import { Layout } from './layout';
import { ErrorState, Loading } from './components';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import './styles.css';

const AuthPage = lazy(() => import('./pages/AuthPage'));
const RfqList = lazy(() => import('./pages/RfqList'));
const RfqForm = lazy(() => import('./pages/RfqForm'));
const RfqDetail = lazy(() => import('./pages/RfqDetail'));
const Quotations = lazy(() => import('./pages/Quotations'));

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError() {
    return { error: new Error('The page could not be displayed. Reload to try again.') };
  }
  render() {
    return this.state.error ? (
      <div className="initial-state">
        <ErrorState error={this.state.error} retry={() => window.location.reload()} />
      </div>
    ) : (
      this.props.children
    );
  }
}
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ScrollToTop />
          <Suspense fallback={<Loading label="Loading page…" />}>
            <Routes>
              <Route path="/login" element={<AuthPage key="login" />} />
              <Route path="/register" element={<AuthPage key="register" register />} />
              <Route
                element={
                  <Protected>
                    <Layout />
                  </Protected>
                }
              >
                <Route path="/rfqs" element={<RfqList />} />
                <Route
                  path="/rfqs/new"
                  element={
                    <Protected role="BUYER">
                      <RfqForm />
                    </Protected>
                  }
                />
                <Route
                  path="/rfqs/:id/edit"
                  element={
                    <Protected role="BUYER">
                      <RfqForm />
                    </Protected>
                  }
                />
                <Route path="/rfqs/:id" element={<RfqDetail />} />
                <Route
                  path="/quotations"
                  element={
                    <Protected role="SUPPLIER">
                      <Quotations />
                    </Protected>
                  }
                />
              </Route>
              <Route path="/" element={<Navigate to="/rfqs" replace />} />
              <Route
                path="*"
                element={
                  <div className="not-found">
                    <span className="eyebrow">404 · PAGE NOT FOUND</span>
                    <h1>Let’s get you back on track.</h1>
                    <p>This page doesn’t exist.</p>
                    <Link className="button primary" to="/rfqs">
                      Go to your workspace
                    </Link>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
createRoot(document.getElementById('root')).render(<App />);
