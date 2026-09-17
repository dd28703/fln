import { apiFetch } from '../services/apiClient';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useState } from 'react';
import { Eye, EyeOff, AlertCircle, ArrowLeft } from 'lucide-react';
import { User, UserRole } from '../types';

// Loaded in development builds so the quick-select demo role buttons are
// visible on the login page. In production (`import.meta.env.MODE !==
// 'development'`) the import is dropped so the panel and the sample
// account addresses never ship to a deployed bundle.
const IS_DEV = import.meta.env.MODE === 'development';
const DemoLoginPanel = IS_DEV ? lazy(() => import('./DemoLoginPanel')) : null;

interface LoginViewProps {
  onLoginSuccess: (token: string, user: User) => void;
  onBackToHome: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, onBackToHome }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Demo one-click sign-in cards. Visible in development builds so testers
  // can switch roles with a single click. In production (`MODE !==
  // 'development'`) the panel is dropped from the bundle entirely — the
  // sample addresses never ship to a deployed build.
  //
  // The password defaults to the backend's SEED_DEMO_PASSWORD_HASH source
  // literal (`Fln@2026`) so the buttons work out-of-the-box in dev. Override
  // via VITE_DEMO_LOGIN_PASSWORD if your local seed uses a different value.
  const showDemoLogins = IS_DEV;
  const demoLoginPassword =
    (import.meta.env as any).VITE_DEMO_LOGIN_PASSWORD || 'Fln@2026';

  const handleLogin = async (e?: React.FormEvent, customEmail?: string, customPass?: string) => {
  if (e) e.preventDefault();
  setError(null);
  setLoading(true);

  const loginEmail = customEmail || email;
  const loginPass = customPass || password;

    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPass })
      });
      const data = await res.json();
      if (res.ok) {
        const payload = data?.data || data;
        const token = payload?.token;
        const user = payload?.user || payload?.teacher || payload;
        onLoginSuccess(token, user);
      } else {
        setError(data.error || 'Invalid email or password');
      }
    } catch (error) {
      console.error("Authentication Error:", error);
      setError("Failed connecting to the backend server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-12 transition-colors duration-200">
      
      {/* Container with neutral double border design */}
      <div className="w-full max-w-lg rounded-xl border-t-8 border-t-indigo-700 dark:border-t-indigo-600 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-md dark:shadow-slate-950/50 transition-all">

        {/* Branding header */}
        <div className="flex flex-col items-center text-center">
          {/* Authentic Ashoka Pillar Emblem Visual Representation */}
          <div className="flex h-16 w-16 items-center justify-center rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-1.5 shadow-sm text-amber-800 dark:text-amber-400">
            <svg className="h-12 w-12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12,2A3,3 0 0,0 9,5C9,6.08 9.58,7.03 10.42,7.56C9.03,8.4 8,9.88 8,11.6V13.5H16V11.6C16,9.88 14.97,8.4 13.58,7.56C14.42,7.03 15,6.08 15,5A3,3 0 0,0 12,2M12,4A1,1 0 0,1 13,5A1,1 0 0,1 12,6A1,1 0 0,1 11,5A1,1 0 0,1 12,4M10,15V19H14V15H10M9,20V21H15V20H9Z" />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-2xl uppercase">
            FLN Portal Login
          </h2>
          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Foundational Literacy and Numeracy (FLN) assessment scheme
          </p>
          <span className="mt-2 inline-block rounded bg-amber-100 dark:bg-amber-950/40 px-3 py-1 text-[10px] font-extrabold text-amber-800 dark:text-amber-400 uppercase tracking-widest border border-amber-200 dark:border-amber-800">
            AUTHORIZED DEPARTMENTAL SIGN-IN
          </span>
        </div>

        {/* Form panel */}
        <form className="mt-8 space-y-4" onSubmit={(e) => handleLogin(e)}>
          
          {/* User Email or Username input */}
          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
              Official Email Address / SSO Username
            </label>
            <input
              type="email"
              required
              className="w-full rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-700 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-700 dark:focus:ring-indigo-500 font-medium"
              placeholder="enter mail or username"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          {/* User Password input */}
          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
              Official Access Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                className="w-full rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 pr-10 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-700 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-700 dark:focus:ring-indigo-500 font-medium"
                placeholder="*********"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Validation Alerts */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3.5 text-xs font-bold text-red-700 dark:text-red-400 animate-shake">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Action Trigger */}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-lg bg-indigo-700 dark:bg-indigo-800 py-3.5 text-xs font-extrabold text-white shadow-md dark:shadow-slate-950/50 transition-all duration-150 hover:bg-indigo-600 dark:hover:bg-indigo-700 border border-indigo-300 dark:border-indigo-700 active:scale-[0.98] disabled:opacity-50 uppercase tracking-widest cursor-pointer font-mono"
          >
            {loading ? 'Verifying Digital Certificate Signature...' : 'Secure Sign In'}
          </button>
        </form>

        {showDemoLogins && DemoLoginPanel && (
          <Suspense fallback={null}>
            <DemoLoginPanel
              password={demoLoginPassword}
              onSelect={(demoEmail, demoPass) => handleLogin(undefined, demoEmail, demoPass)}
            />
          </Suspense>
        )}

        {/* Back to Home CTA */}
        <button
          onClick={onBackToHome}
          className="mt-6 flex w-full items-center justify-center gap-1.5 text-xs font-extrabold text-indigo-700 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:underline uppercase tracking-wider"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Public Information Portal
        </button>

        {/* Legal Disclaimer Tag */}
        <div className="mt-8 border-t border-slate-100 dark:border-slate-800 pt-4 text-center text-[9px] text-slate-400 dark:text-slate-500 font-medium leading-relaxed uppercase tracking-wider">
          Warning: Unauthorized access to this system is strictly prohibited under the IT Act, 2000. All activities are monitored.
        </div>
      </div>
    </div>
  );
};