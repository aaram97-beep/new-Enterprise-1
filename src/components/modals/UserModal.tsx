import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { isValidInternalUsername } from '../../firebase';
import { PERM_KEYS } from '../../data/constants';
import {
  DELETE_PERM_KEYS,
  EDIT_PERM_KEYS,
  REPORT_PERM_KEYS,
  SENSITIVE_FINANCIAL_PERM_KEYS,
  isPermKeyVisible,
  PermItem,
} from '../../utils/permissions';
import type { User, UserPermissions } from '../../types';
import { Trash2, Edit3, BarChart3, ShieldAlert, Layers, Building2, CheckSquare, Square, ShieldCheck } from 'lucide-react';

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
}

export const UserModal: React.FC<UserModalProps> = ({ isOpen, onClose, user }) => {
  const { db, saveUser, toastMsg, t } = useIMS();
  const isDirectSale = db.settings.directSaleMode === true;
  const visibleDeletePerms = DELETE_PERM_KEYS.filter((p) => isPermKeyVisible(p.k, db.settings.features, isDirectSale));
  const visibleEditPerms = EDIT_PERM_KEYS.filter((p) => isPermKeyVisible(p.k, db.settings.features, isDirectSale));
  const visibleReportPerms = REPORT_PERM_KEYS.filter((p) => isPermKeyVisible(p.k, db.settings.features, isDirectSale));
  const visibleNavPerms = PERM_KEYS.filter((p) => isPermKeyVisible(p.k, db.settings.features, isDirectSale));
  const [draft, setDraft] = useState<User>(user);
  const [activeTab, setActiveTab] = useState<'del' | 'edit' | 'rep' | 'conf' | 'nav' | 'branch'>('del');
  const [filterQuery, setFilterQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const initPerms: UserPermissions = { ...(user.perms || {}) };
    // Ensure all standard keys exist with boolean values
    PERM_KEYS.forEach((p) => {
      if (initPerms[p.k] === undefined) initPerms[p.k] = false;
    });
    DELETE_PERM_KEYS.forEach((p) => {
      if (initPerms[p.k] === undefined) initPerms[p.k] = false;
    });
    EDIT_PERM_KEYS.forEach((p) => {
      if (initPerms[p.k] === undefined) initPerms[p.k] = false;
    });
    REPORT_PERM_KEYS.forEach((p) => {
      if (initPerms[p.k] === undefined) initPerms[p.k] = false;
    });
    SENSITIVE_FINANCIAL_PERM_KEYS.forEach((p) => {
      if (initPerms[p.k] === undefined) initPerms[p.k] = false;
    });

    setDraft({
      ...user,
      branchIds: user.branchIds?.length
        ? user.branchIds
        : db.branches.length
        ? [db.branches[0].id]
        : [],
      perms: initPerms,
    });
    setActiveTab('del');
    setFilterQuery('');
  }, [user, isOpen, db.branches]);

  const handleBranchToggle = (bId: string) => {
    setDraft((prev) => {
      const exists = prev.branchIds.includes(bId);
      const branchIds = exists
        ? prev.branchIds.filter((x) => x !== bId)
        : [...prev.branchIds, bId];
      return { ...prev, branchIds };
    });
  };

  const handlePermToggle = (key: string) => {
    setDraft((prev) => ({
      ...prev,
      perms: {
        ...prev.perms,
        [key]: !prev.perms[key],
      },
    }));
  };

  const setGroupPerms = (items: PermItem[], enable: boolean) => {
    setDraft((prev) => {
      const perms = { ...prev.perms };
      items.forEach((item) => {
        perms[item.k] = enable;
      });
      return { ...prev, perms };
    });
  };

  const handleSave = async () => {
    if (saving) return;
    if (!draft.name || !draft.name.trim()) {
      toastMsg(t('Full name is required'), 'error');
      return;
    }
    const cleanUsername = (draft.username || '').trim().toLowerCase();
    if (!cleanUsername || !isValidInternalUsername(cleanUsername)) {
      toastMsg(
        t('Username must be 2–64 characters using letters, numbers, dots, underscores, or hyphens.'),
        'error'
      );
      return;
    }
    if (!draft.id && (!draft.pass || draft.pass.length < 6)) {
      toastMsg(t('Password must be at least 6 characters for Firebase Authentication.'), 'error');
      return;
    }
    if (draft.id && draft.pass && draft.pass.length < 6) {
      toastMsg(t('Password must be at least 6 characters for Firebase Authentication.'), 'error');
      return;
    }

    const rec: User = {
      id: draft.id || '',
      name: draft.name.trim(),
      username: cleanUsername,
      pass: draft.pass || '',
      role: draft.role,
      branchIds: draft.branchIds.slice(),
      perms: { ...draft.perms },
      active: draft.active,
    };

    setSaving(true);
    try {
      const res = await saveUser(rec);
      if (res.ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  const countActive = (items: PermItem[]) => {
    return items.filter((i) => !!draft.perms[i.k]).length;
  };

  const countNavActive = () => {
    return visibleNavPerms.filter((p) => !!draft.perms[p.k]).length;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${draft.id ? t('Edit') : t('+ New')} ${t('User & Permissions')}`}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4 text-xs">
        {/* User basic credentials */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 p-3 rounded-xl">
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1 text-[11px]">
              {t('Full name')} *
            </label>
            <input
              type="text"
              required
              value={draft.name}
              onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Ali Ahmed"
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1 text-[11px]">
              {t('Username')} *
            </label>
            <input
              type="text"
              required
              disabled={Boolean(draft.id)}
              value={draft.username}
              onChange={(e) => setDraft((p) => ({ ...p, username: e.target.value }))}
              placeholder="username"
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono bg-white disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {!draft.id &&
              draft.username.trim().length > 0 &&
              db.users.some(
                (u) => u.deleted === true && u.username.toLowerCase() === draft.username.trim().toLowerCase()
              ) && (
                <p className="mt-1 text-[11px] text-amber-700">
                  Matches a deleted employee. Restore them from Users → Show Deleted, or choose a different username.
                </p>
              )}
          </div>

          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1 text-[11px]">
              {t('Password')}
            </label>
            <input
              type="password"
              placeholder={draft.id ? '(unchanged)' : '••••••••'}
              value={draft.pass}
              onChange={(e) => setDraft((p) => ({ ...p, pass: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="sm:col-span-2 flex items-center gap-4">
            <div className="flex-1">
              <label className="block font-semibold text-slate-700 uppercase mb-1 text-[11px]">
                {t('Role')}
              </label>
              <select
                value={draft.role}
                onChange={(e) => setDraft((p) => ({ ...p, role: e.target.value as 'admin' | 'user' }))}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white font-medium cursor-pointer"
              >
                <option value="user">{t('Standard User (Custom granular permissions)')}</option>
                <option value="admin">{t('Super Administrator (Full unrestricted access)')}</option>
              </select>
            </div>
            <div className="pt-4">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft((p) => ({ ...p, active: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="font-semibold text-slate-800 text-xs">{t('Account Active')}</span>
              </label>
            </div>
          </div>
        </div>

        {/* If Admin: show full access info */}
        {draft.role === 'admin' ? (
          <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/70 text-indigo-900 space-y-1">
            <div className="flex items-center gap-2 font-bold text-sm text-indigo-950">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <span>{t('Super Administrator Role Active')}</span>
            </div>
            <p className="text-xs text-indigo-800">
              {t('Administrators possess absolute privileges across all system areas. They have unrestricted use of all Delete buttons, Edit buttons, complete access to all reports, item buying cost prices, and company financial worth without restriction.')}
            </p>
          </div>
        ) : (
          /* Granular Permissions UI */
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-2xs">
            {/* Category tabs */}
            <div className="flex flex-wrap border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/90 px-2 pt-2 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('del')}
                className={`px-3 py-2 rounded-t-lg font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border-t border-x ${
                  activeTab === 'del'
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 border-b-transparent text-rose-700 dark:text-rose-400 shadow-2xs'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white dark:hover:bg-slate-700/50'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>{t('Delete Buttons')}</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
                  {countActive(visibleDeletePerms)}/{visibleDeletePerms.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                className={`px-3 py-2 rounded-t-lg font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border-t border-x ${
                  activeTab === 'edit'
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 border-b-transparent text-blue-700 dark:text-blue-400 shadow-2xs'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white dark:hover:bg-slate-700/50'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>{t('Edit Buttons')}</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
                  {countActive(visibleEditPerms)}/{visibleEditPerms.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('rep')}
                className={`px-3 py-2 rounded-t-lg font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border-t border-x ${
                  activeTab === 'rep'
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 border-b-transparent text-emerald-700 dark:text-emerald-400 shadow-2xs'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white dark:hover:bg-slate-700/50'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{t('Reports Permitted')}</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                  {countActive(visibleReportPerms)}/{visibleReportPerms.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('conf')}
                className={`px-3 py-2 rounded-t-lg font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border-t border-x ${
                  activeTab === 'conf'
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 border-b-transparent text-amber-700 dark:text-amber-400 shadow-2xs'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white dark:hover:bg-slate-700/50'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>{t('Financial & Cost Privacy')}</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                  {countActive(SENSITIVE_FINANCIAL_PERM_KEYS)}/2
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('nav')}
                className={`px-3 py-2 rounded-t-lg font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border-t border-x ${
                  activeTab === 'nav'
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 border-b-transparent text-slate-800 dark:text-slate-200 shadow-2xs'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white dark:hover:bg-slate-700/50'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                <span>{t('Section Access')}</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                  {countNavActive()}/{visibleNavPerms.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('branch')}
                className={`px-3 py-2 rounded-t-lg font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border-t border-x ${
                  activeTab === 'branch'
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 border-b-transparent text-purple-700 dark:text-purple-400 shadow-2xs'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white dark:hover:bg-slate-700/50'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>{t('Branches')}</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300">
                  {draft.branchIds.length}/{db.branches.length}
                </span>
              </button>
            </div>

            {/* Tab content */}
            <div className="p-4 max-h-[380px] overflow-y-auto space-y-3">
              {/* TAB 1: DELETE PERMISSIONS */}
              {activeTab === 'del' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <Trash2 className="w-4 h-4 text-rose-600" />
                        <span>{t('Granular Deletion Permissions by Section')}</span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {t('Determine exactly which sections this user has permission to delete items or records from.')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setGroupPerms(visibleDeletePerms, true)}
                        className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckSquare className="w-3 h-3" />
                        {t('Allow All')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupPerms(visibleDeletePerms, false)}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Square className="w-3 h-3" />
                        {t('Disallow All')}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {visibleDeletePerms.map((p) => {
                      const enabled = !!draft.perms[p.k];
                      return (
                        <label
                          key={p.k}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                            enabled
                              ? 'border-rose-200 bg-rose-50/50 hover:bg-rose-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => handlePermToggle(p.k)}
                            className="mt-0.5 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-900 text-xs flex items-center justify-between">
                              <span>{t(p.label)}</span>
                              {enabled ? (
                                <span className="text-[10px] text-rose-700 bg-rose-100 px-1.5 py-0.2 rounded font-mono">
                                  {t('CAN DELETE')}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded font-mono">
                                  {t('BLOCKED')}
                                </span>
                              )}
                            </div>
                            {p.desc && <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{t(p.desc)}</p>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 2: EDIT PERMISSIONS */}
              {activeTab === 'edit' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <Edit3 className="w-4 h-4 text-blue-600" />
                        <span>{t('Granular Editing Permissions by Section')}</span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {t('Determine which sections this user is allowed to edit or modify existing records in.')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setGroupPerms(visibleEditPerms, true)}
                        className="px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckSquare className="w-3 h-3" />
                        {t('Allow All')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupPerms(visibleEditPerms, false)}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Square className="w-3 h-3" />
                        {t('Disallow All')}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {visibleEditPerms.map((p) => {
                      const enabled = !!draft.perms[p.k];
                      return (
                        <label
                          key={p.k}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                            enabled
                              ? 'border-blue-200 bg-blue-50/50 hover:bg-blue-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => handlePermToggle(p.k)}
                            className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-900 text-xs flex items-center justify-between">
                              <span>{t(p.label)}</span>
                              {enabled ? (
                                <span className="text-[10px] text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded font-mono">
                                  {p.k === 'adjust_inventory' ? t('ALLOWED') : t('CAN EDIT')}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded font-mono">
                                  {t('BLOCKED')}
                                </span>
                              )}
                            </div>
                            {p.desc && <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{t(p.desc)}</p>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: REPORTS PERMITTED */}
              {activeTab === 'rep' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <BarChart3 className="w-4 h-4 text-emerald-600" />
                        <span>{t('Types of Reports Permitted')}</span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {t('Select which specific reports and analytical statements this user is allowed to generate.')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setGroupPerms(visibleReportPerms, true)}
                        className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckSquare className="w-3 h-3" />
                        {t('Allow All')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupPerms(visibleReportPerms, false)}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Square className="w-3 h-3" />
                        {t('Disallow All')}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {visibleReportPerms.map((p) => {
                      const enabled = !!draft.perms[p.k];
                      return (
                        <label
                          key={p.k}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                            enabled
                              ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => handlePermToggle(p.k)}
                            className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-900 text-xs flex items-center justify-between">
                              <span>{t(p.label)}</span>
                              {enabled ? (
                                <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded font-mono">
                                  {t('VISIBLE')}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded font-mono">
                                  {t('HIDDEN')}
                                </span>
                              )}
                            </div>
                            {p.desc && <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{t(p.desc)}</p>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 4: CONFIDENTIAL FINANCIALS (BUYING PRICES & COMPANY WORTH) */}
              {activeTab === 'conf' && (
                <div className="space-y-4">
                  <div className="pb-2 border-b border-slate-100">
                    <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-600" />
                      <span>{t('Confidential Financial & Cost Protection List')}</span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      {t('Crucial security controls to protect company valuation and supplier purchase prices from unauthorized staff.')}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {/* Buying Prices / Item Cost Control */}
                    <div
                      className={`p-3.5 rounded-xl border transition-all ${
                        draft.perms.view_buying_cost
                          ? 'border-emerald-300 bg-emerald-50/40'
                          : 'border-amber-300 bg-amber-50/40'
                      }`}
                    >
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!draft.perms.view_buying_cost}
                          onChange={() => handlePermToggle('view_buying_cost')}
                          className="mt-1 w-5 h-5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div className="space-y-1">
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                            <span>{t('View Buying Prices of Items (Cost)')}</span>
                            {draft.perms.view_buying_cost ? (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                                {t('Purchasing Cost Visible')}
                              </span>
                            ) : (
                              <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                                {t('Costs Strictly Masked (***)')}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {t('When unchecked, supplier purchasing costs and item cost columns are completely masked (***) across Inventory catalog, Buying Receipts, Stock Valuation, and edit dialogs. This prevents unauthorized employees from discovering wholesale buying prices.')}
                          </p>
                        </div>
                      </label>
                    </div>

                    {/* Company Worth / Balance Sheet Equity Control */}
                    <div
                      className={`p-3.5 rounded-xl border transition-all ${
                        draft.perms.view_company_worth
                          ? 'border-emerald-300 bg-emerald-50/40'
                          : 'border-rose-300 bg-rose-50/40'
                      }`}
                    >
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!draft.perms.view_company_worth}
                          onChange={() => handlePermToggle('view_company_worth')}
                          className="mt-1 w-5 h-5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div className="space-y-1">
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                            <span>{t('View Worth of the Company & Financial Assets')}</span>
                            {draft.perms.view_company_worth ? (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                                {t('Company Worth Visible')}
                              </span>
                            ) : (
                              <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold">
                                {t('Company Worth Restricted')}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {t('When unchecked, this user cannot view total company valuation, owner net worth, Balance Sheet equity figures, or overall inventory valuation totals. Highly sensitive company wealth figures will be hidden with a privacy block.')}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: SECTION ACCESS (NAVIGATION) */}
              {activeTab === 'nav' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-slate-600" />
                        <span>{t('Main Section & Menu Access')}</span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {t('Toggle access to the top navigation modules for this user.')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setDraft((prev) => {
                            const perms = { ...prev.perms };
                            visibleNavPerms.forEach((p) => { perms[p.k] = true; });
                            return { ...prev, perms };
                          });
                        }}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckSquare className="w-3 h-3" />
                        {t('Allow All')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft((prev) => {
                            const perms = { ...prev.perms };
                            visibleNavPerms.forEach((p) => { perms[p.k] = false; });
                            perms.adjust_inventory = false;
                            return { ...prev, perms };
                          });
                        }}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Square className="w-3 h-3" />
                        {t('Disallow All')}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {visibleNavPerms.map((p) =>
                      p.k === 'inventory' ? (
                        <div
                          key={p.k}
                          className={`p-2.5 rounded-xl border transition-all space-y-2 ${
                            draft.perms[p.k]
                              ? 'border-blue-200 bg-blue-50/40 text-blue-900'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!draft.perms[p.k]}
                              onChange={() =>
                                setDraft((prev) => {
                                  const nextInv = !prev.perms.inventory;
                                  return {
                                    ...prev,
                                    perms: {
                                      ...prev.perms,
                                      inventory: nextInv,
                                      adjust_inventory: nextInv ? prev.perms.adjust_inventory : false,
                                    },
                                  };
                                })
                              }
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="font-semibold text-xs">{t(p.label)}</span>
                          </label>
                          <label className="ml-6 flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!draft.perms.adjust_inventory}
                              onChange={() =>
                                setDraft((prev) => ({
                                  ...prev,
                                  perms: {
                                    ...prev.perms,
                                    inventory: !prev.perms.adjust_inventory ? true : prev.perms.inventory,
                                    adjust_inventory: !prev.perms.adjust_inventory,
                                  },
                                }))
                              }
                              className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="font-medium">{t('See & use Adjust in Inventory')}</span>
                          </label>
                        </div>
                      ) : (
                        <label
                          key={p.k}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                            draft.perms[p.k]
                              ? 'border-blue-200 bg-blue-50/40 text-blue-900'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!!draft.perms[p.k]}
                            onChange={() => handlePermToggle(p.k)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <span className="font-semibold text-xs">
                            {t(p.k === 'sales' && isDirectSale ? 'Sales   Invoices   Returns' : p.label)}
                          </span>
                        </label>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* TAB 6: BRANCHES */}
              {activeTab === 'branch' && (
                <div className="space-y-3">
                  <div className="pb-2 border-b border-slate-100">
                    <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-purple-600" />
                      <span>{t('Allowed Branch Locations')}</span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      {t('Select which warehouses or branches this user is authorized to operate in.')}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {db.branches.map((b) => {
                      const selected = draft.branchIds.includes(b.id);
                      return (
                        <label
                          key={b.id}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all cursor-pointer ${
                            selected
                              ? 'border-purple-300 bg-purple-50/50 text-purple-900 font-semibold'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => handleBranchToggle(b.id)}
                            className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                          />
                          <div>
                            <div className="text-xs font-semibold">{b.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{b.code} {b.isMain ? `• ${t('Main')}` : ''}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium cursor-pointer"
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-500/20 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            {saving ? `${t('Save User & Permissions')}...` : t('Save User & Permissions')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
