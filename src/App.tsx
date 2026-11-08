import { Navigate, Route, Routes } from 'react-router-dom';
import { DoctorRoute, HomeRedirect, ProtectedRoute, PublicOnlyRoute, VerifyRoute } from './components/RouteGuards';
import { AppLayout } from './components/AppLayout';
import { DoctorLayout } from './components/DoctorLayout';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { VerifyPage } from './pages/VerifyPage';
import { VisitsPage } from './pages/VisitsPage';
import { VisitPage } from './pages/VisitPage';
import { PatientDashboardPage } from './pages/PatientDashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { AccountPage } from './pages/AccountPage';
import { DoctorQueuePage } from './pages/DoctorQueuePage';
import { DoctorVisitPage } from './pages/DoctorVisitPage';

export default function App() {
  return (
    <Routes>
      {/* Logged-out only */}
      <Route element={<PublicOnlyRoute />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Route>

      {/* Logged in: picks the doctor or patient side */}
      <Route path="/home" element={<HomeRedirect />} />

      {/* Logged in, health card not yet verified */}
      <Route element={<VerifyRoute />}>
        <Route path="/verify" element={<VerifyPage />} />
      </Route>

      {/* Patients: logged in and verified */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<PatientDashboardPage />} />
          <Route path="/visits" element={<VisitsPage />} />
          <Route path="/visits/new" element={<Navigate to="/visits" replace />} />
          <Route path="/visits/:id" element={<VisitPage />} />
          <Route path="/history" element={<PatientDashboardPage history />} />
          <Route path="/care-plan" element={<Navigate to="/history" replace />} />
          <Route path="/notifications" element={<Navigate to="/history" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/account" element={<AccountPage />} />
          {/* Old link from the previous UI. */}
          <Route path="/medical" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>

      {/* Doctors only (checked against the doctors table on the server) */}
      <Route element={<DoctorRoute />}>
        <Route element={<DoctorLayout />}>
          <Route path="/doctor" element={<DoctorQueuePage />} />
          <Route path="/doctor/visits/:id" element={<DoctorVisitPage />} />
          <Route path="/doctor/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
