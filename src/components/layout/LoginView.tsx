import React, { useState } from 'react';
import { useIMS } from '../../context/IMSContext';
import { LogIn } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { db, login, t } = useIMS();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!username.trim() || !password) {
      setError(t('Invalid credentials or inactive account'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await login(username, password, keepSignedIn);
      if (!res.ok) {
        setError(res.error || 'Invalid credentials');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const titleName =
    db.settings.companyName && db.settings.companyName !== 'My Company'
      ? db.settings.companyName
      : 'Enterprise IMS';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 border border-slate-100">
        <div className="text-center mb-6">
          {db.settings.logo ? (
            <img src={db.settings.logo} className="mx-auto mb-3 max-h-16 object-contain" alt="Company Logo" />
          ) : (
            <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl mx-auto mb-3 flex items-center justify-center text-2xl font-bold shadow-lg shadow-blue-500/30">
              ⚡
            </div>
          )}
          <h1 className="font-bold text-xl text-slate-900 tracking-tight">{titleName}</h1>
          <div className="text-[11px] text-slate-400 tracking-widest uppercase font-semibold mt-0.5">
            {t('Enterprise IMS v2')}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-username" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              {t('Username')}
            </label>
            <input
              id="login-username"
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (error) setError('');
              }}
              className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={t('Username')}
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              {t('Password')}
            </label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
              className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={t('Password')}
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              id="login-keep-signed-in"
              checked={keepSignedIn}
              onChange={(e) => setKeepSignedIn(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span>{t('Keep me signed in')}</span>
          </label>

          {error && <div className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-lg border border-rose-200">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white rounded-xl py-3 font-semibold text-sm transition-all shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            <LogIn className="w-4 h-4" />
            {submitting ? `${t('Sign In')}...` : t('Sign In')}
          </button>
        </form>
      </div>
    </div>
  );
};
