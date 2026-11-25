import React from 'react';
import { useIMS } from '../../context/IMSContext';
import { Menu, Bell, Building2, PanelLeftClose, PanelLeftOpen, Sun, Moon } from 'lucide-react';
import { NAVS } from '../../data/constants';
import { diffDays, todayStr, toIsoDate } from '../../utils/formatters';
import { checkRemaining } from '../../utils/calculations';
import { getGlobalTrackFlags } from '../../utils/tracking';

interface HeaderProps {
  onOpenDrawer: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenDrawer,
  sidebarCollapsed,
  setSidebarCollapsed,
}) => {
  const { db, view, setView, branchId, setBranchId, myBranches, theme, toggleTheme, canAccess, t } = useIMS();

  const currentNav = NAVS.find((x) => x.id === view);
  const currentTitle = currentNav ? (db.settings.lang === 'ar' ? currentNav.ar : currentNav.label) : view;

  // Calculate alerts badge count
  const today = todayStr();
  const trackExpiry = getGlobalTrackFlags(db.settings).trackExpiry;
  const warn = +db.settings.expiryWarnDays || 30;
  const live = db.stocks.filter((s) => s.qty > 0.005);
  const expiredCount = trackExpiry
    ? live.filter((s) => s.expiry && toIsoDate(s.expiry) < today).length
    : 0;
  const expiringCount = trackExpiry
    ? live.filter(
        (s) => s.expiry && toIsoDate(s.expiry) >= today && diffDays(s.expiry, today) <= warn
      ).length
    : 0;
  const lowCount = db.items.filter((i) => {
    const st = db.stocks
      .filter((s) => s.itemId === i.id)
      .reduce((a, s) => a + (+s.qty || 0), 0);
    return i.reorder > 0 && st <= i.reorder;
  }).length;
  const checksCount = db.checks.filter((c) => {
    if (c.status === 'cleared' || c.status === 'bounced') return false;
    if (checkRemaining(c) <= 0.005) return false;
    return c.dueDate && diffDays(c.dueDate, today) <= 14;
  }).length;
  const disposalsCount = db.disposals.filter((d) => d.status === 'pending').length;
  const transitCount = db.transfers.filter((t) => t.status === 'transit').length;
  const returnsCount = db.returnSlips.filter((s) => !s.returnInvoiceId).length;

  const totalAlerts =
    (canAccess('inventory') ? expiredCount + expiringCount + lowCount : 0) +
    (canAccess('checks') ? checksCount : 0) +
    (canAccess('disposals') ? disposalsCount : 0) +
    (canAccess('transfers') ? transitCount : 0) +
    (canAccess('sales') ? returnsCount : 0);

  React.useEffect(() => {
    if (view !== 'inventory' && branchId === 'all') {
      setBranchId(myBranches[0]?.id || 'b1');
    }
  }, [view, branchId, myBranches, setBranchId]);

  return (
    <header className="bg-white border-b border-slate-200/80 px-4 md:px-6 py-2.5 sm:py-3 flex items-center gap-2.5 sm:gap-3 sticky top-0 z-30 shadow-xs">
      {/* Mobile drawer toggle */}
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label="Open navigation drawer"
        className="md:hidden text-slate-600 hover:text-slate-900 p-2 rounded-xl hover:bg-slate-100 border border-slate-200/80 cursor-pointer"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Desktop sidebar toggle button: ALWAYS VISIBLE */}
      <button
        type="button"
        onClick={() => setSidebarCollapsed((prev) => !prev)}
        aria-label={sidebarCollapsed ? t('Show sidebar') : t('Hide sidebar')}
        title={sidebarCollapsed ? t('Show sidebar') : t('Hide sidebar')}
        className={`hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all duration-200 shrink-0 ${
          sidebarCollapsed
            ? 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-sm shadow-blue-500/30 ring-1 ring-blue-700/20'
            : 'border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white shadow-2xs'
        }`}
      >
        {sidebarCollapsed ? (
          <>
            <PanelLeftOpen className="w-4 h-4 animate-pulse" />
            <span>{t('Show Sections')}</span>
          </>
        ) : (
          <>
            <PanelLeftClose className="w-4 h-4 text-slate-500" />
            <span className="hidden xl:inline">{t('Hide Sections')}</span>
          </>
        )}
      </button>

      <div className="font-bold text-slate-900 text-base md:text-lg flex-1 truncate">
        {currentTitle}
      </div>

      {/* Branch selector */}
      {(myBranches.length > 1 || view !== 'dash') && (
        <div className="flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-slate-400 hidden sm:inline" />
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="border border-slate-300 rounded-xl px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs sm:text-sm bg-white font-medium text-slate-700 shadow-2xs hover:border-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[110px] sm:max-w-none truncate"
          >
            {view === 'inventory' && (
              <option value="all">
                🌐 {t('All Branches')}
              </option>
            )}
            {myBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.name}
              </option>
            ))}
          </select>
        </div>
      )}


      {/* Theme Toggle Button (Light / Dark) with Dark Blue Ambient Glow */}
      <button
        type="button"
        onClick={toggleTheme}
        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/90 text-slate-700 dark:text-blue-400 border border-transparent dark:border-blue-900/40 shadow-xs dark:shadow-md dark:shadow-blue-950/60 transition-all cursor-pointer flex items-center justify-center"
        title={theme === 'dark' ? t('Switch to Light Mode') : t('Switch to Dark Mode')}
        aria-label={theme === 'dark' ? t('Switch to Light Mode') : t('Switch to Dark Mode')}
      >
        {theme === 'dark' ? (
          <Sun className="w-4 h-4 text-amber-400 animate-in spin-in-180 duration-300" />
        ) : (
          <Moon className="w-4 h-4 text-blue-600 animate-in spin-in-180 duration-300" />
        )}
      </button>

      {/* Alerts notification bell */}
      <button
        type="button"
        onClick={() => setView('alerts')}
        className="relative p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-transparent dark:border-slate-700/60 transition-colors cursor-pointer shadow-xs dark:shadow-md dark:shadow-blue-950/40"
        title={t('Open Alerts')}
      >
        <Bell className="w-4 h-4" />
        {totalAlerts > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
            {totalAlerts}
          </span>
        )}
      </button>
    </header>
  );
};
