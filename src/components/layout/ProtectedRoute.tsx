// ──────────────────────────────────────────────
// ProtectedRoute — Redirects unauthenticated users
// ──────────────────────────────────────────────

import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { Sparkles } from 'lucide-react';

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
