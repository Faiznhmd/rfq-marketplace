import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api';
import { Loading, ErrorState } from './components';
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  async function restore() {
    setLoading(true);
    setError(null);
    try {
      setUser((await api('/auth/me')).user);
    } catch (error) {
      if (error.status !== 401) setError(error);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    restore();
    const expired = () => setUser(null);
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } catch (error) {
      if (error.status !== 401) throw error;
    }
    setUser(null);
  }
  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      {loading ? (
        <div className="initial-state">
          <Loading label="Opening your workspace…" />
        </div>
      ) : error ? (
        <div className="initial-state">
          <ErrorState error={error} retry={restore} />
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function Protected({ role, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user)
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  if (role && user.role !== role) return <Navigate to="/rfqs" replace />;
  return children;
}
