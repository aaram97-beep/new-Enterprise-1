import React from 'react';
import { useIMS } from '../../context/IMSContext';
import { LogOut, X } from 'lucide-react';

interface SidebarProps {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  sidebarCollapsed: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  drawerOpen,
  setDrawerOpen,
  sidebarCollapsed,
}) => {
  const { db, view, setView, allowedNavs, session, sessionUser, logout, t } = useIMS();

  const handleNavClick = (id: string) => {
    setView(id);
    setDrawerOpen(false);
  };

  return (
    <>
      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-xs transition-opacity"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside
        className={`bg-slate-950 text-slate-300 flex-shrink-0 flex flex-col fixed md:sticky md:top-0 md:h-screen inset-y-0 left-0 z-40 transition-all duration-300 ease-in-out ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        } ${
          sidebarCollapsed
            ? 'md:-translate-x-full md:w-0 md:opacity-0 md:pointer-events-none md:border-r-0'
            : 'md:translate-x-0 md:w-64 md:opacity-100 border-r border-slate-800/80'
        } shadow-2xl md:shadow-none overflow-hidden select-none`}
      >
        <div className="w-64 flex flex-col h-full">
          {/* Brand header */}
          <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-white font-bold text-base leading-tight truncate">
                {db.settings.companyName}
              </div>
              <div className="text-[11px] text-slate-400 font-semibold tracking-wider uppercase mt-0.5">
                {t('Enterprise IMS')}
              </div>
            </div>

            {/* Mobile close drawer button */}
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label={t('Close drawer')}
              className="md:hidden text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/80"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation items list */}
          <nav className="flex-1 overflow-y-auto py-2.5 px-2 space-y-0.5 custom-scrollbar">
            {allowedNavs.map((n) => {
              const isActive = view === n.id;
              const labelText = db.settings.lang === 'ar' ? n.ar || n.label : n.label;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleNavClick(n.id)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm flex items-center gap-3 transition-colors cursor-pointer font-medium ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/40 dark:shadow-blue-600/50 dark:ring-1 dark:ring-blue-400/30 font-semibold'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <span className="w-5 text-center text-base shrink-0">{n.icon}</span>
                  <span className="truncate">{labelText}</span>
                </button>
              );
            })}
          </nav>

          {/* User profile footer */}
          {session && (
            <div className="px-5 py-3.5 border-t border-slate-800/80 bg-slate-950/70 text-xs">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-slate-100 font-semibold truncate">{session.name}</div>
                  <div className="text-[11px] text-slate-400 capitalize">{sessionUser?.role || session.role}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void logout()}
                  title={t('Sign out')}
                  className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 p-2 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
