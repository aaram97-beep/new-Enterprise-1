import React from 'react';
import { useIMS } from '../../context/IMSContext';
import { FEATURE_KEYS } from '../../data/constants';
import { getGlobalTrackingMode, getGlobalTrackFlags } from '../../utils/tracking';
import type { TrackingMode } from '../../types';
import { Upload, Trash2 } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { db, setDb, audit, sessionUser, theme, setTheme, toastMsg, t } = useIMS();

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 400000) {
      toastMsg('Logo too large   please use an image under ~400 KB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDb((prev) => ({
        ...prev,
        settings: { ...prev.settings, logo: reader.result as string },
      }));
      audit('Settings', 'Company logo updated');
      toastMsg('Logo updated');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setDb((prev) => ({
      ...prev,
      settings: { ...prev.settings, logo: '' },
    }));
    audit('Settings', 'Logo removed');
    toastMsg('Logo removed');
  };

  const handleFeatureToggle = (key: string) => {
    setDb((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        features: {
          ...prev.settings.features,
          [key]: !prev.settings.features[key],
        },
      },
    }));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 max-w-2xl space-y-6">
      <h2 className="font-bold text-lg text-slate-900">{t('Settings')}</h2>

      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            {t('Company name')}
          </label>
          <input
            type="text"
            value={db.settings.companyName}
            onChange={(e) =>
              setDb((p) => ({
                ...p,
                settings: { ...p.settings, companyName: e.target.value },
              }))
            }
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            {t('Address')}
          </label>
          <input
            type="text"
            value={db.settings.address}
            onChange={(e) =>
              setDb((p) => ({
                ...p,
                settings: { ...p.settings, address: e.target.value },
              }))
            }
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            {t('Phone')}
          </label>
          <input
            type="text"
            value={db.settings.phone}
            onChange={(e) =>
              setDb((p) => ({
                ...p,
                settings: { ...p.settings, phone: e.target.value },
              }))
            }
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          />
        </div>

        {/* Currency & Money Decimals */}
        <div className="space-y-4 sm:col-span-2">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 uppercase">
                {t('Currency')}
              </label>
              <div className="flex gap-2">
                <select
                  value={
                    [
                      { code: 'IQD', symbol: 'IQD', label: 'IQD — Iraqi Dinar (د.ع)' },
                      { code: 'USD', symbol: '$', label: 'USD — US Dollar ($)' },
                      { code: 'EUR', symbol: '€', label: 'EUR — Euro (€)' },
                      { code: 'JPY', symbol: '¥', label: 'JPY — Japanese Yen (¥)' },
                      { code: 'CNY', symbol: 'CNY', label: 'CNY — Chinese Yuan (¥ / 元)' },
                    ].some((c) => c.symbol === db.settings.currency || c.code === db.settings.currency)
                      ? ([
                          { code: 'IQD', symbol: 'IQD', label: 'IQD — Iraqi Dinar (د.ع)' },
                          { code: 'USD', symbol: '$', label: 'USD — US Dollar ($)' },
                          { code: 'EUR', symbol: '€', label: 'EUR — Euro (€)' },
                          { code: 'JPY', symbol: '¥', label: 'JPY — Japanese Yen (¥)' },
                          { code: 'CNY', symbol: 'CNY', label: 'CNY — Chinese Yuan (¥ / 元)' },
                        ].find((c) => c.symbol === db.settings.currency || c.code === db.settings.currency)?.symbol || db.settings.currency)
                      : 'custom'
                  }
                  onChange={(e) => {
                    if (e.target.value !== 'custom') {
                      setDb((p) => ({
                        ...p,
                        settings: { ...p.settings, currency: e.target.value },
                      }));
                    }
                  }}
                  className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer"
                >
                  <option value="IQD">IQD — Iraqi Dinar (د.ع)</option>
                  <option value="$">USD — US Dollar ($)</option>
                  <option value="€">EUR — Euro (€)</option>
                  <option value="¥">JPY — Japanese Yen (¥)</option>
                  <option value="CNY">CNY — Chinese Yuan (¥ / 元)</option>
                  <option value="custom">{t('Custom currency symbol/code...')}</option>
                </select>
                <input
                  type="text"
                  value={db.settings.currency}
                  onChange={(e) =>
                    setDb((p) => ({
                      ...p,
                      settings: { ...p.settings, currency: e.target.value },
                    }))
                  }
                  placeholder={t('Symbol / Code')}
                  className="w-24 border border-slate-300 rounded-xl px-2 py-2 text-sm bg-white font-medium text-center"
                  title={t('Current currency symbol or code')}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                {t('Changing currency re-labels amounts system-wide. No exchange rate is applied and existing values are not converted.')}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 uppercase">
                {t('Money Decimals')}
              </label>
              <select
                value={db.settings.moneyDecimals ?? 2}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setDb((p) => ({
                    ...p,
                    settings: { ...p.settings, moneyDecimals: val },
                  }));
                  audit('Settings', `Money decimal places changed to ${val}`);
                  toastMsg(t('Decimal points updated'));
                }}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer font-medium text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              >
                <option value={0}>{t('None (0 decimals — e.g. 1,250)')}</option>
                <option value={1}>{t('1 decimal point (e.g. 1,250.0)')}</option>
                <option value={2}>{t('2 decimal points (e.g. 1,250.00)')}</option>
                <option value={3}>{t('3 decimal points (e.g. 1,250.000)')}</option>
              </select>
              <p className="text-[11px] text-slate-400">
                {t('Controls how many decimal places are shown for all money and financial figures system-wide.')}
              </p>
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
            {t('Language (اللغة)')}
          </label>
          <div className="flex gap-6 text-sm">
            <label className="flex items-center gap-2 cursor-pointer font-medium">
              <input
                type="radio"
                name="lang"
                value="en"
                checked={db.settings.lang === 'en'}
                onChange={() =>
                  setDb((p) => ({
                    ...p,
                    settings: { ...p.settings, lang: 'en' },
                  }))
                }
                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
              />
              <span>English</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-medium">
              <input
                type="radio"
                name="lang"
                value="ar"
                checked={db.settings.lang === 'ar'}
                onChange={() =>
                  setDb((p) => ({
                    ...p,
                    settings: { ...p.settings, lang: 'ar' },
                  }))
                }
                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
              />
              <span>العربية</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
            {t('Theme')}
          </label>
          <div className="flex gap-6 text-sm">
            <label className="flex items-center gap-2 cursor-pointer font-medium">
              <input
                type="radio"
                name="theme"
                value="dark"
                checked={theme === 'dark'}
                onChange={() => setTheme('dark')}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
              />
              <span>🌙 {t('Dark Theme')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-medium">
              <input
                type="radio"
                name="theme"
                value="light"
                checked={theme === 'light'}
                onChange={() => setTheme('light')}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
              />
              <span>☀️ {t('Light Theme')}</span>
            </label>
          </div>
        </div>



        {/* Feature Toggles */}
        {sessionUser?.role === 'admin' && (
          <div className="sm:col-span-2 pt-4 border-t border-slate-100">
            <div className="font-semibold text-sm text-slate-900 mb-1">{t('Features')}</div>
            <div className="text-[11px] text-slate-400 mb-3">
              {t(
                'Disable a feature to hide it from the sidebar and dashboards. Nothing is deleted   turn it back on anytime.'
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              {FEATURE_KEYS.map((f) => {
                const label =
                  f.k === 'sales' && db.settings.directSaleMode
                    ? 'Sales   invoices, returns'
                    : f.label;
                return (
                  <label key={f.k} className="flex items-center gap-2 cursor-pointer text-slate-700">
                    <input
                      type="checkbox"
                      checked={db.settings.features[f.k] !== false}
                      onChange={() => handleFeatureToggle(f.k)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>{t(label)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            {t('Default tax %')}
          </label>
          <input
            type="number"
            step="any"
            value={db.settings.taxRate}
            onChange={(e) =>
              setDb((p) => ({
                ...p,
                settings: { ...p.settings, taxRate: +e.target.value },
              }))
            }
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          />
        </div>

        {/* Lot & Expiry Global Mode Dropdown */}
        <div className="sm:col-span-2 pt-4 border-t border-slate-100">
          <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2">
            <label htmlFor="lotExpiryMode" className="block text-sm font-bold text-slate-800">
              {t('Lot & Expiry Tracking')}
            </label>
            <select
              id="lotExpiryMode"
              value={getGlobalTrackingMode(db.settings)}
              onChange={(e) => {
                const val = e.target.value as TrackingMode;
                setDb((p) => ({
                  ...p,
                  settings: {
                    ...p.settings,
                    lotExpiryMode: val,
                    trackBatchExpiry: val !== 'none',
                  },
                }));
                audit('Settings', `Lot & expiry tracking mode set to ${val}`);
                toastMsg(t('Tracking mode updated'));
              }}
              className="w-full sm:max-w-sm border border-slate-300 rounded-xl px-3 py-2 text-sm font-medium bg-white text-slate-800 cursor-pointer"
            >
              <option value="both">{t('Lot & Expiry Date')}</option>
              <option value="lot">{t('Lot / Batch only')}</option>
              <option value="expiry">{t('Expiry Date only')}</option>
              <option value="none">{t('None (Quantity only)')}</option>
            </select>
            <p className="text-xs text-slate-500">
              {t('Choose whether stock uses Lot/Batch numbers, Expiry dates, both, or quantity only. Disabling an option hides those boxes across all forms and overrides individual items. Existing data is preserved safely.')}
            </p>
          </div>
        </div>

        {/* Indicate Stock in Other Branches Toggle */}
        <div className="sm:col-span-2">
          <div className="flex items-start gap-3 p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl">
            <input
              type="checkbox"
              id="showInOtherBranchStatus"
              checked={db.settings.showInOtherBranchStatus !== false}
              onChange={(e) => {
                const val = e.target.checked;
                setDb((p) => ({
                  ...p,
                  settings: { ...p.settings, showInOtherBranchStatus: val },
                }));
                audit('Settings', `"In other branch" status indicator ${val ? 'enabled' : 'disabled'}`);
                toastMsg(val ? t('"In other branch" status enabled') : t('"In other branch" status disabled'));
              }}
              className="w-5 h-5 mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <div className="space-y-0.5 flex-1">
              <label htmlFor="showInOtherBranchStatus" className="block text-sm font-bold text-slate-800 cursor-pointer">
                {t('Indicate Stock in Other Branches')}
              </label>
              <p className="text-xs text-slate-500">
                {t('When enabled, items out of stock in the active branch will show "in other branch" if available elsewhere. When disabled, the status will consider active branch stock only.')}
              </p>
            </div>
          </div>
        </div>

        {/* Branch Company Mode Toggle */}
        <div className="sm:col-span-2">
          <div className="flex items-start gap-3 p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl">
            <input
              type="checkbox"
              id="isBranchCompany"
              checked={db.settings.isBranchCompany === true}
              onChange={(e) => {
                const val = e.target.checked;
                setDb((p) => ({
                  ...p,
                  settings: { ...p.settings, isBranchCompany: val },
                }));
                audit('Settings', `Branch company mode ${val ? 'enabled' : 'disabled'}`);
                toastMsg(val ? t('Branch company mode enabled') : t('Branch company mode disabled'));
              }}
              className="w-5 h-5 mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <div className="space-y-0.5 flex-1">
              <label htmlFor="isBranchCompany" className="block text-sm font-bold text-slate-800 cursor-pointer">
                {t("I'm a branch company")}
              </label>
              <p className="text-xs text-slate-500">
                {t('Enables direct arrival notes in Purchases and delegates cost/profit figures to central headquarters so the branch focuses cleanly on sales, inventory, and cash operations.')}
              </p>
            </div>
          </div>
        </div>

        {/* Direct Sale Mode Toggle */}
        <div className="sm:col-span-2">
          <div className="flex items-start gap-3 p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl">
            <input
              type="checkbox"
              id="directSaleMode"
              checked={db.settings.directSaleMode === true}
              onChange={(e) => {
                const val = e.target.checked;
                setDb((p) => ({
                  ...p,
                  settings: { ...p.settings, directSaleMode: val },
                }));
                audit('Settings', `Direct sale mode ${val ? 'enabled' : 'disabled'}`);
                toastMsg(val ? t('Direct sale mode enabled') : t('Direct sale mode disabled'));
              }}
              className="w-5 h-5 mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <div className="space-y-0.5 flex-1">
              <label htmlFor="directSaleMode" className="block text-sm font-bold text-slate-800 cursor-pointer">
                {t('Direct Sale Mode (No Delivery Slips)')}
              </label>
              <p className="text-xs text-slate-500">
                {t('Deducts stock directly when saving an invoice and hides Delivery Slips everywhere. Purchases stay unchanged, and Lot/Expiry batch selection appears right on invoice lines when enabled.')}
              </p>
            </div>
          </div>
        </div>

        {getGlobalTrackFlags(db.settings).trackExpiry ? (
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              {t('Expiry warning (days)')}
            </label>
            <input
              type="number"
              value={db.settings.expiryWarnDays}
              onChange={(e) =>
                setDb((p) => ({
                  ...p,
                  settings: { ...p.settings, expiryWarnDays: +e.target.value },
                }))
              }
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
              {t('Expiry warning (days)')}
            </label>
            <input
              type="text"
              disabled
              value={t('Expiry tracking disabled')}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-100 text-slate-400 cursor-not-allowed"
            />
          </div>
        )}
      </div>

      {/* Logo Upload Section */}
      <div className="pt-4 border-t border-slate-100 space-y-3">
        <div className="font-semibold text-sm text-slate-900">{t('Company Logo')}</div>
        <div className="flex flex-wrap items-center gap-4">
          {db.settings.logo ? (
            <img
              src={db.settings.logo}
              className="h-20 max-w-[180px] object-contain border border-slate-200 rounded-xl bg-white p-1.5 shadow-2xs"
              alt="Logo Preview"
            />
          ) : (
            <div className="h-20 w-36 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center text-xs text-slate-400">
              {t('no logo')}
            </div>
          )}
          <div className="space-y-2">
            <label className="bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs">
              <Upload className="w-3.5 h-3.5" />
              Upload / Update
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </label>
            {db.settings.logo && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="text-rose-600 hover:text-rose-800 text-xs font-semibold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('Remove')}
              </button>
            )}
          </div>
        </div>
        <div className="text-[11px] text-slate-400">
          {t('PNG/JPG, recommended under 200 KB. Appears on login screen and all printed documents.')}
        </div>
      </div>
    </div>
  );
};
