import { useState, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { adminService } from '../services/admin';
import {
  LayoutDashboard,
  Phone,
  CreditCard,
  User,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  RefreshCw,
  BarChart3,
  LifeBuoy,
} from 'lucide-react';
import logoLight from '../assets/Voice AI Dash Logo with Text.png';
import logoDark from '../assets/Voice AI Dash Logo with Text Dark.png';
import { SupportModal } from './SupportModal';

export function DashboardLayout() {
  const { profile, signOut } = useAuth();
  const { isSyncing, syncData, getLastSyncDisplay } = useSync();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [systemHealth, setSystemHealth] = useState<'healthy' | 'unhealthy' | 'unknown' | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    if (profile?.role === 'admin') {
      const checkSystemHealth = async () => {
        try {
          const connections = await adminService.getConnectionsStatus();
          if (connections.length === 0) {
            setSystemHealth('unknown');
            return;
          }

          const hasUnhealthy = connections.some((conn: any) => {
            // Check if any connection or token is unhealthy (red dot in UI)
            const isConnected = conn.has_connection;
            const isTokenHealthy = conn.token_status === 'valid';

            return !isConnected || !isTokenHealthy;
          });

          setSystemHealth(hasUnhealthy ? 'unhealthy' : 'healthy');
        } catch (error) {
          console.error('Error checking system health:', error);
        }
      };

      checkSystemHealth();
    }
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const clientNavigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Call Logs', href: '/calls', icon: Phone },
    { name: 'Billing', href: '/billing', icon: CreditCard },
    { name: 'Profile', href: '/profile', icon: User },
  ];

  const adminNavigation = [
    { name: 'Call Analytics', href: '/admin/calls', icon: BarChart3 },
    { name: 'Users', href: '/admin/users', icon: Users },
    {
      name: 'System',
      href: '/admin/system',
      icon: Settings,
      status: systemHealth
    },
    { name: 'Profile', href: '/profile', icon: User },
  ];

  const navigation = profile?.role === 'admin' ? adminNavigation : clientNavigation;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between px-6 h-20">
              <img
                src={theme === 'dark' ? logoDark : logoLight}
                alt="Voice AI Dash"
                className="h-14"
              />
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium flex-1">{item.name}</span>
                  {(item as any).status && (
                    <div
                      className={`h-2.5 w-2.5 rounded-full ${(item as any).status === 'healthy'
                        ? 'bg-green-500'
                        : (item as any).status === 'unhealthy'
                          ? 'bg-red-500'
                          : 'bg-gray-400'}`}
                      title={(item as any).status === 'healthy'
                        ? 'All systems operational'
                        : (item as any).status === 'unhealthy'
                          ? 'System attention needed'
                          : 'No user connections'}
                    />
                  )}
                </Link>
              );
            })}

            {/* Support Button for Clients */}
            {profile?.role !== 'admin' && (
              <button
                onClick={() => {
                  setShowSupportModal(true);
                  setSidebarOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <LifeBuoy className="h-5 w-5" />
                <span className="font-medium">Support</span>
              </button>
            )}
          </nav>

          {/* User section */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 bg-blue-600 dark:bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                {profile?.first_name?.[0]}
                {profile?.last_name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {profile?.first_name} {profile?.last_name}
                </p>
                {profile?.role === 'admin' ? (
                  <span className="mt-1 inline-flex items-center px-2.5 py-1 text-[11px] font-semibold uppercase bg-red-600 text-white rounded-full tracking-wide shadow-sm">
                    Admin
                  </span>
                ) : (
                  <span className="text-xs text-gray-500 dark:text-gray-400 capitalize truncate">
                    {profile?.role}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between h-20 px-4 lg:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <Menu className="h-6 w-6" />
            </button>

            <div className="flex items-center gap-4 ml-auto">
              {/* Sync Status - Only for Clients */}
              {profile?.role !== 'admin' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                    Last synced: {getLastSyncDisplay()}
                  </span>
                  <button
                    onClick={() => syncData()}
                    disabled={isSyncing}
                    className={`p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors ${isSyncing ? 'animate-spin' : ''
                      }`}
                    title="Sync Data"
                  >
                    <RefreshCw className="h-5 w-5" />
                  </button>
                </div>
              )}

              <button
                onClick={toggleTheme}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>

      <SupportModal
        isOpen={showSupportModal}
        onClose={() => setShowSupportModal(false)}
      />
    </div>
  );
}
