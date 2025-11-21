import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SyncProvider } from './contexts/SyncContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardLayout } from './components/DashboardLayout';
import { SignIn } from './pages/SignIn';
import { SignUp } from './pages/SignUp';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { AcceptInvitation } from './pages/AcceptInvitation';
import { Dashboard } from './pages/Dashboard';
import { CallsPage } from './pages/CallsPage';
import { BillingPage } from './pages/BillingPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminSystemPage } from './pages/AdminSystemPage';
import { AdminCallsAnalytics } from './pages/AdminCallsAnalytics';
import { UserDetailsPage } from './pages/UserDetailsPage';
import { OAuthCallback } from './pages/OAuthCallback';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SyncProvider>
          <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/accept-invitation" element={<AcceptInvitation />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="calls" element={<CallsPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="profile" element={<ProfilePage />} />

            <Route
              path="admin/users"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminUsersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/users/:userId"
              element={
                <ProtectedRoute requireAdmin>
                  <UserDetailsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/system"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminSystemPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/calls"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminCallsAnalytics />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </SyncProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
