import React, { useState } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Plus, Edit2, Trash2, RotateCcw, Archive } from 'lucide-react';
import type { User } from '../../types';

interface UsersViewProps {
  onNewUser: () => void;
  onEditUser: (user: User) => void;
}

export const UsersView: React.FC<UsersViewProps> = ({ onNewUser, onEditUser }) => {
  const { db, saveUser, deleteUser, session, t } = useIMS();
  const [showDeleted, setShowDeleted] = useState(false);

  const branchName = (id: string) => (db.branches.find((b) => b.id === id) || {}).name || id;

  const activeUsers = db.users.filter((u) => !u.deleted);
  const deletedUsers = db.users.filter((u) => u.deleted === true);
  const visibleUsers = showDeleted ? db.users : activeUsers;

  const handleToggleActive = (u: User) => {
    if (u.deleted) return;
    void saveUser({ ...u, active: !u.active });
  };

  const handleRestore = (u: User) => {
    void saveUser({ ...u, active: true, deleted: false, deletedAt: undefined });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-base md:text-lg text-slate-900">
          {t('Users & Permissions')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {deletedUsers.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDeleted((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
                showDeleted
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>
                {showDeleted ? t('Hide Deleted') : `${t('Show Deleted')} (${deletedUsers.length})`}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onNewUser}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t('New User')}
          </button>
        </div>
      </div>

      {/* Mobile Users List */}
      <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
        {visibleUsers.map((u) => (
          <div key={u.id} className={`p-3.5 space-y-2.5 ${u.deleted ? 'bg-slate-50/80 opacity-80' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm text-slate-900 flex items-center gap-1.5 flex-wrap">
                  <span>{u.name}</span>
                  {u.deleted && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">
                      {t('Deleted')}
                    </span>
                  )}
                </div>
                <div className="font-mono text-xs text-slate-500">{u.username}</div>
              </div>
              <span
                className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  u.role === 'admin'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {u.role}
              </span>
            </div>

            <div className="text-xs text-slate-600">
              <span className="text-slate-400">{t('Branches')}: </span>
              {u.role === 'admin' ? 'all' : u.branchIds.map((b) => branchName(b)).join(', ')}
            </div>

            <div className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
              <span className="text-slate-600 font-medium">{t('Active')}</span>
              <input
                type="checkbox"
                checked={!u.deleted && u.active}
                disabled={u.deleted === true}
                onChange={() => handleToggleActive(u)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
              {u.deleted ? (
                <button
                  type="button"
                  onClick={() => handleRestore(u)}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  {t('Restore')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onEditUser(u)}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    {t('Edit')}
                  </button>
                  {u.id !== session?.id && (
                    <button
                      type="button"
                      onClick={() => void deleteUser(u)}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      {t('Del')}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2.5">{t('Name')}</th>
              <th className="text-left px-3 py-2.5">{t('Username')}</th>
              <th className="text-center px-3 py-2.5">{t('Role')}</th>
              <th className="text-center px-3 py-2.5">{t('Branches')}</th>
              <th className="text-center px-3 py-2.5">{t('Active')}</th>
              <th className="text-right px-4 py-2.5">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleUsers.map((u) => (
              <tr
                key={u.id}
                className={`hover:bg-slate-50/80 transition-colors ${u.deleted ? 'bg-slate-50/70 opacity-80' : ''}`}
              >
                <td className="px-3 py-2.5 font-medium text-slate-900">
                  <div className="flex items-center gap-2">
                    <span>{u.name}</span>
                    {u.deleted && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">
                        {t('Deleted')}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{u.username}</td>
                <td className="text-center py-2.5">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      u.role === 'admin'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="text-center py-2.5 text-xs text-slate-600">
                  {u.role === 'admin' ? 'all' : u.branchIds.map((b) => branchName(b)).join(', ')}
                </td>
                <td className="text-center py-2.5">
                  <input
                    type="checkbox"
                    checked={!u.deleted && u.active}
                    disabled={u.deleted === true}
                    onChange={() => handleToggleActive(u)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs space-x-2">
                  {u.deleted ? (
                    <button
                      type="button"
                      onClick={() => handleRestore(u)}
                      className="text-emerald-700 hover:text-emerald-900 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {t('Restore')}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onEditUser(u)}
                        className="text-blue-600 hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        {t('Edit')}
                      </button>
                      {u.id !== session?.id && (
                        <button
                          type="button"
                          onClick={() => void deleteUser(u)}
                          className="text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
                        >
                          {t('Del')}
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
