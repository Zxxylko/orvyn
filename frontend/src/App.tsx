import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CalendarPage } from './pages/CalendarPage';
import { BriefingPage } from './pages/BriefingPage';
import { AcademicPage } from './pages/AcademicPage';
import { FinancePage } from './pages/FinancePage';
import { HealthPage } from './pages/HealthPage';
import { CampusPage } from './pages/CampusPage';
import { StudentHubPage } from './pages/StudentHubPage';
import { AppShell } from './components/layout/AppShell';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
        
        <Routes>
          <Route path="/" element={<LoginPage />} />
          
          {/* Protected App Routes wrapped in the AppShell Layout */}
          <Route
            path="/dashboard"
            element={
              <AppShell>
                <DashboardPage />
              </AppShell>
            }
          />
          <Route
            path="/student-hub"
            element={
              <AppShell>
                <StudentHubPage />
              </AppShell>
            }
          />
          <Route
            path="/calendar"
            element={
              <AppShell>
                <CalendarPage />
              </AppShell>
            }
          />
          <Route
            path="/briefing"
            element={
              <AppShell>
                <BriefingPage />
              </AppShell>
            }
          />
          <Route
            path="/academic"
            element={
              <AppShell>
                <AcademicPage />
              </AppShell>
            }
          />
          <Route
            path="/campus"
            element={
              <AppShell>
                <CampusPage />
              </AppShell>
            }
          />
          <Route
            path="/finance"
            element={
              <AppShell>
                <FinancePage />
              </AppShell>
            }
          />
          <Route
            path="/health"
            element={
              <AppShell>
                <HealthPage />
              </AppShell>
            }
          />
          
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
