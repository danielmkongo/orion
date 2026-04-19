import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DevicesPage } from '@/pages/DevicesPage';
import { DeviceDetailPage } from '@/pages/DeviceDetailPage';
import { MapPage } from '@/pages/MapPage';
import { TelemetryPage } from '@/pages/TelemetryPage';
import { AlertsPage } from '@/pages/AlertsPage';
import { ControlPage } from '@/pages/ControlPage';
import { RulesPage } from '@/pages/RulesPage';
import { OtaPage } from '@/pages/OtaPage';
import { UsersPage } from '@/pages/UsersPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ReportsPage } from '@/pages/ReportsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"   element={<DashboardPage />} />
        <Route path="devices"     element={<DevicesPage />} />
        <Route path="devices/:id" element={<DeviceDetailPage />} />
        <Route path="map"         element={<MapPage />} />
        <Route path="telemetry"   element={<TelemetryPage />} />
        <Route path="alerts"      element={<AlertsPage />} />
        <Route path="control"     element={<ControlPage />} />
        <Route path="rules"       element={<RulesPage />} />
        <Route path="ota"         element={<OtaPage />} />
        <Route path="reports"     element={<ReportsPage />} />
        <Route path="users"       element={<UsersPage />} />
        <Route path="settings"    element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
