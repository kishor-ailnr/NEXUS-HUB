import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { isSupabaseConfigured } from './lib/supabase';
import { Hub } from './pages/Hub';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { NotFound } from './pages/NotFound';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from './components/ui/sonner';
// FLEET-TWIN (mock) - removable
const FleetTwinListPage = React.lazy(() =>
  import('./features/fleet-twin').then((m) => ({ default: m.FleetTwinListPage })),
);
const VehicleDigitalTwinPage = React.lazy(() =>
  import('./features/fleet-twin').then((m) => ({ default: m.VehicleDigitalTwinPage })),
);

export const App: React.FC = () => {
  const { initAuth } = useAuthStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return (
    <ErrorBoundary>
      {!isSupabaseConfigured && (
        <div
          role="alert"
          className="bg-amber-600/90 text-white px-4 py-2.5 text-xs sm:text-sm text-center font-medium backdrop-blur-md sticky top-0 z-50 flex items-center justify-center gap-2 shadow-lg"
        >
          <span>⚠️</span>
          <span>
            <strong>Configuration Notice:</strong> Supabase environment variables (<code>VITE_SUPABASE_URL</code> & <code>VITE_SUPABASE_ANON_KEY</code>) must be configured in Render deployment settings for authentication to work.
          </span>
        </div>
      )}
      <BrowserRouter>
        <Routes>
          {/* Real Multimodal Hub Page */}
          <Route path="/" element={<Hub />} />

          {/* Parameterized Generic Auth & Operation Routes */}
          {/* FLEET-TWIN (mock) - removable */}
          <Route
            path="/roadways/fleet-twin"
            element={
              <ProtectedRoute>
                <React.Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-400">Loading Fleet Digital Twin...</div>}>
                  <FleetTwinListPage />
                </React.Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/roadways/fleet-twin/:vehicleId"
            element={
              <ProtectedRoute>
                <React.Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-400">Loading Vehicle Digital Twin...</div>}>
                  <VehicleDigitalTwinPage />
                </React.Suspense>
              </ProtectedRoute>
            }
          />

          <Route path="/:mode/login" element={<Login />} />
          <Route path="/:mode/register" element={<Register />} />
          <Route
            path="/:mode/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          {/* Fallback & 404 Route */}
          <Route path="/404" element={<NotFound />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </ErrorBoundary>
  );
};

export default App;
