import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { Login } from './screens/Login';

const AuthenticatedApp = lazy(() => import('./AuthenticatedApp'));

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="card pad-card">
          <p className="small">Verificando acesso à área de membros…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Suspense
      fallback={
        <div className="auth-shell">
          <div className="card pad-card">
            <p className="small">Preparando sua área de membros…</p>
          </div>
        </div>
      }
    >
      <AuthenticatedApp />
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
