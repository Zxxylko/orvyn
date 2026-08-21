import { lazy, Suspense } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import { Navigate } from './lib/router';

const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then((module) => ({ default: module.CalendarPage })));
const BriefingPage = lazy(() => import('./pages/BriefingPage').then((module) => ({ default: module.BriefingPage })));
const AcademicPage = lazy(() => import('./pages/AcademicPage').then((module) => ({ default: module.AcademicPage })));
const FinancePage = lazy(() => import('./pages/FinancePage').then((module) => ({ default: module.FinancePage })));
const HealthPage = lazy(() => import('./pages/HealthPage').then((module) => ({ default: module.HealthPage })));
const CampusPage = lazy(() => import('./pages/CampusPage').then((module) => ({ default: module.CampusPage })));
const StudentHubPage = lazy(() => import('./pages/StudentHubPage').then((module) => ({ default: module.StudentHubPage })));
const AppShell = lazy(() => import('./components/layout/AppShell').then((module) => ({ default: module.AppShell })));

const protectedPages: Record<string, LazyExoticComponent<ComponentType>> = {
  '/dashboard': DashboardPage,
  '/student-hub': StudentHubPage,
  '/calendar': CalendarPage,
  '/briefing': BriefingPage,
  '/academic': AcademicPage,
  '/campus': CampusPage,
  '/finance': FinancePage,
  '/health': HealthPage,
};

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white" role="status" aria-label="Memuat halaman">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-800 border-t-cyan-300" />
        <p className="text-xs font-semibold text-slate-500">Menyiapkan ruang kerja...</p>
      </div>
    </div>
  );
}

function ProtectedApp() {
  const [pathname] = useLocation();
  const Page = protectedPages[pathname];

  if (!Page) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AppShell>
      <Page />
    </AppShell>
  );
}

function App() {
  return (
    <AuthProvider>
      <MotionConfig reducedMotion="user">
        <Toaster 
          position="top-right" 
          theme="dark"
          toastOptions={{
            style: {
              background: '#111827',
              border: '1px solid rgba(148, 163, 184, 0.18)',
              color: 'white',
              boxShadow: '0 10px 28px rgba(0, 0, 0, 0.22)',
            },
          }}
        />
        
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/">
              <LoginPage />
            </Route>
            <Route>
              <ProtectedApp />
            </Route>
          </Switch>
        </Suspense>
      </MotionConfig>
    </AuthProvider>
  );
}

export default App;
