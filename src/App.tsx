import { Navigate, Route, Routes } from 'react-router-dom';
import { DoctorRoute, HomeRedirect, ProtectedRoute, PublicOnlyRoute, VerifyRoute } from './components/RouteGuards';
import { AppLayout } from './components/AppLayout';
import { DoctorLayout } from './components/DoctorLayout';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { VerifyPage } from './pages/VerifyPage';
import { MedicalPage } from './pages/MedicalPage';
import { SettingsPage } from './pages/SettingsPage';
import { AccountPage } from './pages/AccountPage';
import { DoctorQueuePage } from './pages/DoctorQueuePage';
import { DoctorLoginPage } from './pages/DoctorLoginPage';
import { DoctorHistoryPage } from './pages/DoctorHistoryPage';
import { DoctorHistoryCasePage } from './pages/DoctorHistoryCasePage';

export default function App() {
  return (
    <Routes>
      {/* Logged-out only */}
      <Route element={<PublicOnlyRoute />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/doctor/login" element={<DoctorLoginPage />} />
      </Route>

      {/* Logged in: picks the doctor or patient side */}
      <Route path="/home" element={<HomeRedirect />} />

      {/* Logged in, health card not yet verified */}
      <Route element={<VerifyRoute />}>
        <Route path="/verify" element={<VerifyPage />} />
      </Route>

      {/* Logged in and verified */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/medical" element={<MedicalPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Route>
      </Route>

      {/* Doctors only (checked on the server): the priority queue and the history of closed cases. */}
      <Route element={<DoctorRoute />}>
        <Route element={<DoctorLayout />}>
          <Route path="/doctor" element={<DoctorQueuePage />} />
          <Route path="/doctor/history" element={<DoctorHistoryPage />} />
          <Route path="/doctor/history/:id" element={<DoctorHistoryCasePage />} />
        </Route>
      </Route>
      <Route path="/doctor/*" element={<Navigate to="/doctor" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
