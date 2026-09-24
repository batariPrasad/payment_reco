import { useState } from 'react';
import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { Sidebar as PrimeSidebar } from 'primereact/sidebar';
import { Button } from 'primereact/button';
import MisUploadPage from './pages/MisUploadPage';
import ZoneReferencePage from './pages/ZoneReferencePage';
import RateCardsPage from './pages/RateCardsPage';
import SyncPage from './pages/SyncPage';
import ShipmentUploadPage from './pages/ShipmentUploadPage';
import ReconciliationRunsPage from './pages/ReconciliationRunsPage';
import ReconciliationResultsPage from './pages/ReconciliationResultsPage';
import LoginPage from './pages/LoginPage';
import AdminUsersPage from './pages/AdminUsersPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import { RequireAuth, RequireAdmin } from './components/RequireAuth';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Shell />
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

const NAV_ITEMS = [
  { to: '/mis-upload', label: 'MIS Upload', icon: 'pi-upload' },
  { to: '/sync', label: 'Sync from Kwikship', icon: 'pi-sync' },
  { to: '/shipment-upload', label: 'Upload Shipment Data', icon: 'pi-truck' },
  { to: '/zone-reference', label: 'Zone Reference', icon: 'pi-map' },
  { to: '/rate-cards', label: 'Rate Card', icon: 'pi-percentage' },
  { to: '/reconciliation', label: 'Reconciliation Runs', icon: 'pi-chart-bar' },
];

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
    isActive
      ? 'bg-gradient-to-r from-[#f0620f] to-[#c9302c] font-semibold text-white shadow-lg shadow-black/30'
      : 'text-[#f3d9c0] hover:bg-white/10'
  }`;
}

function NavIcon({ icon }: { icon: string }) {
  return (
    <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/15">
      <i className={`pi ${icon} text-[0.72rem]`} />
    </span>
  );
}

function Shell() {
  const { user, logout } = useAuth();
  const { mode, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navContent = (onNavigate?: () => void) => (
    <div className="flex h-full min-h-0 flex-col text-[#f3d9c0]">
      <div className="px-3 pb-6 pt-1">
        <img src="/logo-white.png" alt="Pokonut" className="h-14 w-auto" />
        <div className="mt-1 text-[0.6rem] tracking-[0.35em] opacity-70">PAYMENT RECO</div>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} onClick={onNavigate} className={navLinkClass}>
            <NavIcon icon={item.icon} />
            {item.label}
          </NavLink>
        ))}
        {user?.role === 'admin' && (
          <NavLink to="/admin/users" onClick={onNavigate} className={navLinkClass}>
            <NavIcon icon="pi-users" />
            User Management
          </NavLink>
        )}
      </nav>

      <div className="mt-auto rounded-2xl bg-white/10 p-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#f0620f] to-[#c9302c] font-bold text-white">
            {user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 text-xs">
            <div className="truncate">{user?.email}</div>
            <div className="opacity-70">{user?.role === 'admin' ? 'Admin' : 'User'}</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[0.7rem]">
          <NavLink to="/change-password" onClick={onNavigate} className="rounded-lg bg-white/10 py-1.5 hover:bg-white/20">
            <i className="pi pi-key mr-1" />
            Password
          </NavLink>
          <button onClick={toggle} className="rounded-lg bg-white/10 py-1.5 hover:bg-white/20">
            <i className={`pi ${mode === 'dark' ? 'pi-sun' : 'pi-moon'} mr-1`} />
            {mode === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button onClick={logout} className="rounded-lg bg-white/10 py-1.5 hover:bg-white/20">
            <i className="pi pi-sign-out mr-1" />
            Logout
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside
        className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col p-4 md:flex"
        style={{ background: 'var(--side)' }}
      >
        {navContent()}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-4 py-3 md:hidden" style={{ background: 'var(--side)' }}>
          <img src="/logo-white.png" alt="Pokonut" className="h-9 w-auto" />
          <Button icon="pi pi-bars" text onClick={() => setMobileOpen(true)} aria-label="Open menu" className="!text-white" />
        </div>
        <PrimeSidebar
          visible={mobileOpen}
          onHide={() => setMobileOpen(false)}
          className="w-72"
          style={{ background: 'var(--side)' }}
        >
          {navContent(() => setMobileOpen(false))}
        </PrimeSidebar>

        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
          <Routes>
            <Route path="/" element={<Navigate to="/mis-upload" replace />} />
            <Route path="/mis-upload" element={<MisUploadPage />} />
            <Route path="/sync" element={<SyncPage />} />
            <Route path="/shipment-upload" element={<ShipmentUploadPage />} />
            <Route path="/zone-reference" element={<ZoneReferencePage />} />
            <Route path="/rate-cards" element={<RateCardsPage />} />
            <Route path="/reconciliation" element={<ReconciliationRunsPage />} />
            <Route path="/reconciliation/:runId" element={<ReconciliationResultsPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route
              path="/admin/users"
              element={
                <RequireAdmin>
                  <AdminUsersPage />
                </RequireAdmin>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}
