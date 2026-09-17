import { apiFetch, withBase } from '../services/apiClient';
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { User, UserRole, Student, ClassGroup, School, LogEntry, Ticket } from '../types';

import { DiagnosticWorkflow } from './DiagnosticWorkflow';
import { BulkDiagnosticWorkflow } from './BulkDiagnosticWorkflow';
import { WorksheetWorkflow } from './WorksheetWorkflow';
import { LogbookView } from './LogbookView';
import { TicketSubmission } from './TicketSubmission';
import { IcrScanner } from './IcrScanner';
import { BaselineUpload } from './BaselineUpload';
import { SkillGraphPanel } from './SkillGraphPanel';
import { Users, ShieldAlert, BookOpen, UserCheck, Calendar, ArrowRight, CheckCircle2, XCircle, SlidersHorizontal, Layers, Award, MapPin, School as SchoolIcon, BarChart3, FileText, ClipboardList, Layers as BulkIcon } from 'lucide-react';
import { Table, Column } from './Table';
import { MetricCard } from './Card';
import { Input, Select, Textarea } from './Form';
import { SuperAdminExecutiveDashboard } from './SuperAdminExecutiveDashboard';



export { FLN_LEVELS_LIST, FLNLevelReferenceModal } from './dashboards/FLNLevelReference';

export const STATE_NAMES: Record<string, string> = {
  'PB': 'Punjab',
  'HR': 'Haryana',
  'RJ': 'Rajasthan',
  'UP': 'Uttar Pradesh'
};

export const DISTRICT_NAMES: Record<string, string> = {
  'LDH': 'Ludhiana',
  'MOG': 'Moga',
  'AMB': 'Ambala',
  'JAI': 'Jaipur',
  'LKO': 'Lucknow'
};

// export type { DashboardProps };

export function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function parseCSVText(text: string): Record<string, any>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one data row.');
  }

  const rawHeaders = splitCSVLine(lines[0]);
  const headerMap: Record<string, string> = {
    'name': 'name',
    'class': 'classGroup',
    'classgroup': 'classGroup',
    'section': 'section',
    'aadhar': 'aadharNumber',
    'aadharnumber': 'aadharNumber',
    'id': 'aadharNumber',
    'idcard': 'aadharNumber',
    'id card': 'aadharNumber',
    'dob': 'dob',
    'date of birth': 'dob',
    'date-of-birth': 'dob',
    'gender': 'gender',
    'guardianname': 'guardianName',
    'guardian name': 'guardianName',
    'guardianrelation': 'guardianRelation',
    'guardian relation': 'guardianRelation',
    'guardiancontact': 'guardianContact',
    'guardian contact': 'guardianContact',
    'address': 'address',
    'bloodgroup': 'bloodGroup',
    'blood group': 'bloodGroup',
    'disabilitystatus': 'disabilityStatus',
    'disability status': 'disabilityStatus',
    'middaymealbeneficiary': 'midDayMealBeneficiary',
    'mid day meal beneficiary': 'midDayMealBeneficiary',
    'busroute': 'busRoute',
    'bus route': 'busRoute',
    'siblingsinschool': 'siblingsInSchool',
    'siblings in school': 'siblingsInSchool'
  };

  const headers = rawHeaders.map(h => {
    const clean = h.trim().toLowerCase();
    return headerMap[clean] || clean;
  });

  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    const row: Record<string, any> = {};
    headers.forEach((h, i) => {
      let val = (vals[i] || '').trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).trim();
      }

      // Normalize classGroup (e.g. '2' -> 'Class 2')
      if (h === 'classGroup') {
        const numMatch = val.match(/\d+/);
        if (numMatch) {
          val = `Class ${numMatch[0]}`;
        } else if (val.toLowerCase().includes('preschool 1')) {
          val = 'Preschool 1';
        } else if (val.toLowerCase().includes('preschool 2')) {
          val = 'Preschool 2';
        } else if (val.toLowerCase().includes('balvatika')) {
          val = 'Balvatika';
        }
      }

      // Normalize dob (DD-MM-YYYY or DD/MM/YYYY to YYYY-MM-DD)
      if (h === 'dob' && val) {
        const dmyMatch = val.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (dmyMatch) {
          const day = dmyMatch[1].padStart(2, '0');
          const month = dmyMatch[2].padStart(2, '0');
          const year = dmyMatch[3];
          val = `${year}-${month}-${day}`;
        }
      }

      // Normalize aadharNumber (scientific notation)
      if (h === 'aadharNumber' && val) {
        if (/^\d+(\.\d+)?[eE]\+?\d+$/.test(val)) {
          try {
            val = Number(val).toFixed(0);
          } catch (e) {
            // fallback
          }
        }
      }

      row[h] = val;
    });
    return row;
  });
}

interface DashboardProps {
  user: User;
  token: string;
}

// ==========================================
// GEOGRAPHICAL COMPARATIVE ANALYTICS (SHARED VIEW)
// ==========================================
import { RegionalAnalyticsView } from './dashboards/RegionalAnalyticsView';
export { RegionalAnalyticsView } from './dashboards/RegionalAnalyticsView';

// ==========================================
// 1. SUPERADMIN (NATIONAL) DASHBOARD
// ==========================================
import { SuperadminDashboard } from './dashboards/SuperadminDashboard';
export { SuperadminDashboard } from './dashboards/SuperadminDashboard';



// ==========================================
// 2. STATE ADMIN / DISTRICT ADMIN / BLOCK ADMIN DASHBOARDS
// ==========================================
export { AdminDashboard } from './dashboards/AdminDashboard';


// ==========================================
// 3. SCHOOL PRINCIPAL DASHBOARD
// ==========================================
export { SchoolDashboard } from './dashboards/SchoolDashboard';


/** Renders either a crisp level chip or an animated "Awaiting Diagnostic" badge */
export function LevelBadge({ level, subLevel, variant = 'compact' }: {
  level: number | null | undefined;
  subLevel?: number | null;
  variant?: 'compact' | 'full';
}) {
  if (level !== null && level !== undefined) {
    // Placed student — clean level chip
    if (variant === 'full') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-mono font-bold text-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          L{level}{subLevel !== null && subLevel !== undefined ? `.${subLevel}` : ''}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-mono font-bold text-xs">
        L{level}{subLevel !== null && subLevel !== undefined ? `.${subLevel}` : ''}
      </span>
    );
  }

  // Unplaced student — animated awaiting badge
  if (variant === 'full') {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-semibold text-sm select-none">
        {/* Pulsing radar dot */}
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
        </span>
        Awaiting Diagnostic
      </span>
    );
  }

  // compact table / list variant
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/50 dark:to-orange-900/50 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-[10px] font-bold font-mono select-none whitespace-nowrap">
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
      </span>
      Diagnostic Pending
    </span>
  );
}

// ==========================================
// 4. TEACHER DASHBOARD
// ==========================================
import { TeacherDashboard } from './dashboards/TeacherDashboard';
export { TeacherDashboard } from './dashboards/TeacherDashboard';


// ==========================================
// 5. VOLUNTEER DASHBOARD
// ==========================================
import { VolunteerDashboard } from './dashboards/VolunteerDashboard';
export { VolunteerDashboard } from './dashboards/VolunteerDashboard';

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  district_admin: 'District Admin',
  block_admin: 'Block Admin',
  school: 'School',
  teacher: 'Teacher',
  volunteer: 'Volunteer'
};

// Derived once at module scope; reused by TARGET_ROLES lookup inside the
// component. Keeping this at the top level avoids the prior TDZ-style bug
// where TARGET_ROLES was computed before ROLE_LABELS was defined.
const TARGET_ROLES = Object.keys(ROLE_LABELS);

export const AnnouncementComplianceView: React.FC<{ token?: string }> = ({ token }) => {
  // All data is sourced live from MongoDB via /api/announcements and
  // /api/announcements/:id/reads. No client-side mock fallback: the
  // dashboard reflects the real database state at all times.
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [stats, setStats] = useState<AnnouncementReadStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [showList, setShowList] = useState<'read' | 'unread'>('unread');

  // Post-announcement form state (live-demo helper).
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formIsUrgent, setFormIsUrgent] = useState(false);
  const [formRoles, setFormRoles] = useState<string[]>([]);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);


  
  const resetForm = () => {
    setFormTitle('');
    setFormMessage('');
    setFormIsUrgent(false);
    setFormRoles([]);
    setFormError(null);
  };

  const refreshAnnouncements = async (preferId?: string) => {
    try {
      const res = await fetch('/api/announcements/tracking', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json().catch(() => null);
      const remoteList: Announcement[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.announcements)
          ? data.announcements
          : [];
      setAnnouncements(remoteList);
      if (preferId && remoteList.some((a) => a.id === preferId)) {
        setSelectedId(preferId);
      } else if (remoteList.length > 0 && !remoteList.some((a) => a.id === selectedId)) {
        setSelectedId(remoteList[0].id);
      } else if (remoteList.length === 0) {
        // Database is empty: clear any stale selection so the empty-state
        // UI can take over.
        setSelectedId('');
        setStats(null);
      }
    } catch (e) {
      console.error('Failed to load announcements from /api/announcements/tracking', e);
      setAnnouncements([]);
      setSelectedId('');
      setStats(null);
    }
  };

  const handlePostAnnouncement = async () => {
    if (!token) {
      setFormError('You must be signed in to post an announcement.');
      return;
    }
    if (!formTitle.trim() || !formMessage.trim()) {
      setFormError('Title and message are required.');
      return;
    }
    setFormSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/announcements/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: formTitle.trim(),
          message: formMessage.trim(),
          isUrgent: formIsUrgent,
          targetRoles: formRoles.length === TARGET_ROLES.length || formRoles.length === 0 ? [] : formRoles
        })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const created: Announcement = await res.json();
      resetForm();
      setShowForm(false);
      // Re-fetch from the backend so the dropdown and stats reflect the
      // canonical MongoDB state right after the insert.
      await refreshAnnouncements(created.id);
    } catch (e: any) {
      setFormError(e?.message || 'Failed to post announcement.');
    } finally {
      setFormSubmitting(false);
    }
  };

  useEffect(() => {
    const fetchAnns = async () => {
      try {
        const res = await fetch('/api/announcements/tracking', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json().catch(() => null);
        const trackedAnnouncements: Announcement[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.announcements)
            ? data.announcements
            : [];

        setAnnouncements(trackedAnnouncements);
        if (trackedAnnouncements.length > 0 && !trackedAnnouncements.some((a) => a.id === selectedId)) {
          setSelectedId(trackedAnnouncements[0].id);
        } else if (trackedAnnouncements.length === 0) {
          setSelectedId('');
          setStats(null);
        }
      } catch (e) {
        console.error('Failed to load announcements from /api/announcements/tracking', e);
        setAnnouncements([]);
        setSelectedId('');
        setStats(null);
      }
    };
    fetchAnns();
    // We intentionally only re-run on token change; selectedId updates are
    // handled inside refreshAnnouncements to avoid an extra fetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!selectedId) {
      setStats(null);
      return;
    }
    const fetchStats = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/announcements/${selectedId}/reads`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const d = await res.json();
          setStats(d);
        } else {
          console.error(`Failed to load reads for ${selectedId}: HTTP ${res.status}`);
          setStats(null);
        }
      } catch (e) {
        console.error(`Failed to load reads for ${selectedId}:`, e);
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [selectedId, token]);

  // Live compliance re-sync: when ANY user marks an announcement as read
  // in the bell popover / notifications page, the SuperAdmin dashboard
  // should reflect that without a manual reload. We re-fetch stats on:
  //   1) window focus  (user returns to the tab)
  //   2) visibilitychange  (tab becomes visible again)
  //   3) every 30s while the panel is mounted and a selection is active
  // The polling is intentionally low-frequency so the server isn't
  // hammered during demos.
  useEffect(() => {
    if (!selectedId) return;
    const refetch = () => {
      // Re-run only when the current selectedId is unchanged; otherwise
      // the primary useEffect above handles it.
      if (!selectedId) return;
      const fetchStatsQuiet = async () => {
        try {
          const res = await fetch(`/api/announcements/${selectedId}/reads`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const d = await res.json();
            setStats(d);
          }
        } catch {
          /* silent: background poll failures are non-fatal */
        }
      };
      fetchStatsQuiet();
    };
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', refetch);
    const interval = window.setInterval(refetch, 30_000);
    return () => {
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', refetch);
      window.clearInterval(interval);
    };
  }, [selectedId, token]);

  const byRoleEntries = Object.entries((stats?.byRole as Record<string, any>) ?? {}) as Array<
    [string, { read?: number; total?: number }]
  >;
  const byDistrictEntries = Object.entries((stats?.byDistrict as Record<string, any>) ?? {}) as Array<
    [string, { read?: number; total?: number }]
  >;
  const unreadUsers = Array.isArray(stats?.unreadUsers) ? stats.unreadUsers : [];
  const readUsers = Array.isArray(stats?.readUsers) ? stats.readUsers : [];
  const activeUsers = showList === 'unread' ? unreadUsers : readUsers;

  // Live calculated metrics. Prefer the server-provided totals when
  // available so the cards stay consistent with the per-role breakdown,
  // but fall back to deriving from the read/unread lists which is the
  // canonical source for mock stats.
  const readCount = stats?.readCount ?? readUsers.length;
  const unreadCount = stats?.unreadCount ?? unreadUsers.length;
  const totalRecipients = stats?.totalRecipients ?? readCount + unreadCount;
  // Use the server-provided fractional percent when present (e.g. 1.6),
  // otherwise compute one-decimal precision ourselves.
  const readPercent =
    typeof stats?.readPercent === 'number'
      ? stats.readPercent
      : totalRecipients > 0
        ? Math.round((readCount / totalRecipients) * 1000) / 10
        : 0;
  const readPercentDisplay = Number(readPercent).toFixed(1);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 border border-zinc-200 rounded-xl shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-display font-medium text-zinc-900">Announcements</h3>
          <button
            type="button"
            onClick={() => { setShowForm((v) => !v); setFormError(null); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
            aria-expanded={showForm}
          >
            {showForm ? 'Close' : '+ Post Announcement'}
          </button>
        </div>

        {showForm && (
          <div className="border border-zinc-200 rounded-lg p-4 bg-zinc-50 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold uppercase text-zinc-500 tracking-widest">Title</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Announcement title"
                  className="w-full text-sm border border-zinc-200 rounded-lg p-2.5 outline-none focus:border-zinc-500 bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold uppercase text-zinc-500 tracking-widest">Urgency</label>
                <label className="flex items-center gap-2 text-sm text-zinc-700 bg-white border border-zinc-200 rounded-lg p-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsUrgent}
                    onChange={(e) => setFormIsUrgent(e.target.checked)}
                    className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Mark as urgent / critical alert</span>
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold uppercase text-zinc-500 tracking-widest">Message</label>
              <textarea
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                placeholder="What do you want to communicate?"
                rows={4}
                className="w-full text-sm border border-zinc-200 rounded-lg p-2.5 outline-none focus:border-zinc-500 bg-white resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold uppercase text-zinc-500 tracking-widest">Target Roles</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFormRoles(formRoles.length === TARGET_ROLES.length ? [] : [...TARGET_ROLES])}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    formRoles.length === TARGET_ROLES.length || formRoles.length === 0
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                  }`}
                >
                  All Roles
                </button>
                {TARGET_ROLES.map((role) => {
                  const active = formRoles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setFormRoles(active ? formRoles.filter((r) => r !== role) : [...formRoles, role])}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                        active
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                      }`}
                    >
                      {ROLE_LABELS[role] ?? role}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-zinc-400 font-mono">Leave empty or select &ldquo;All Roles&rdquo; to broadcast to everyone.</p>
            </div>

            {formError && (
              <div className="p-3 text-xs font-mono text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {formError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { resetForm(); setShowForm(false); }}
                disabled={formSubmitting}
                className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePostAnnouncement}
                disabled={formSubmitting || !formTitle.trim() || !formMessage.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {formSubmitting ? 'Sending…' : 'Send Announcement'}
              </button>
            </div>
          </div>
        )}
        {(announcements?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8 bg-zinc-50 border border-dashed border-zinc-200 rounded-lg text-center">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-zinc-900">No announcements found in MongoDB</div>
              <div className="text-xs text-zinc-500 font-mono">
                Publish your first announcement to start tracking compliance across roles and districts.
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setShowForm(true); setFormError(null); }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              + Post Announcement
            </button>
          </div>
        ) : (
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full md:w-96 text-sm border border-zinc-200 rounded-lg p-2.5 outline-none focus:border-zinc-500"
          >
            {(announcements ?? []).map(a => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
        )}
      </div>

      {loading && (
        <div className="p-8 text-center text-zinc-400 font-mono text-xs">Loading compliance data...</div>
      )}

      {!loading && stats && (
        <>
          {/* Summary cards + progress bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard title="Total Recipients" value={totalRecipients} />
            <MetricCard
              title="Read"
              value={readCount}
              subtext={`${readPercentDisplay}% of recipients`}
            />
            <MetricCard title="Unread" value={unreadCount} />
            <MetricCard
              title="Last Viewed"
              value={
                stats.lastViewedAt
                  ? new Date(stats.lastViewedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : '—'
              }
              subtext={
                stats.firstViewedAt
                  ? `First: ${new Date(stats.firstViewedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}`
                  : undefined
              }
            />
          </div>

          <div className="bg-white p-6 border border-zinc-200 rounded-xl shadow-sm space-y-2">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-zinc-600">Overall Read Rate</span>
              <span className="font-semibold text-zinc-900">{readPercentDisplay}%</span>
            </div>
            <div className="w-full bg-zinc-100 rounded-full h-3">
              <div
                className="bg-emerald-500 h-3 rounded-full transition-all"
                style={{ width: `${Math.max(0, Math.min(100, Number(readPercent) || 0))}%` }}
              />
            </div>
          </div>

          {/* Role + District breakdowns side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 border border-zinc-200 rounded-xl shadow-sm space-y-3">
              <h4 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest">By Role</h4>
              {byRoleEntries.length === 0 ? (
                <div className="p-4 text-center text-zinc-400 text-xs font-mono">
                  No role breakdown available.
                </div>
              ) : (
                byRoleEntries.map(([role, s]) => {
                  const roleRead = Number(s?.read ?? 0);
                  const roleTotal = Number(s?.total ?? 0);
                  const rolePercent = roleTotal > 0 ? (roleRead / roleTotal) * 100 : 0;

                  return (
                    <div key={role} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-zinc-600">
                          {ROLE_LABELS[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                        <span className="font-semibold text-zinc-900">
                          {roleRead}/{roleTotal}
                        </span>
                      </div>
                      <div className="w-full bg-zinc-100 rounded-full h-1.5">
                        <div
                          className="bg-indigo-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${rolePercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="bg-white p-6 border border-zinc-200 rounded-xl shadow-sm space-y-3">
              <h4 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest">By District</h4>
              {byDistrictEntries.length === 0 ? (
                <div className="p-4 text-center text-zinc-400 text-xs font-mono">
                  No district breakdown available.
                </div>
              ) : (
                byDistrictEntries.map(([district, s]) => {
                  const districtRead = Number(s?.read ?? 0);
                  const districtTotal = Number(s?.total ?? 0);
                  const districtPercent = districtTotal > 0 ? (districtRead / districtTotal) * 100 : 0;

                  return (
                    <div key={district} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-zinc-600">{district}</span>
                        <span className="font-semibold text-zinc-900">
                          {districtRead}/{districtTotal}
                        </span>
                      </div>
                      <div className="w-full bg-zinc-100 rounded-full h-1.5">
                        <div
                          className="bg-amber-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${districtPercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Toggleable recipient list */}
          <div className="bg-white p-6 border border-zinc-200 rounded-xl shadow-sm space-y-4">
            <div className="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200 w-fit">
              <button
                onClick={() => setShowList('unread')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  showList === 'unread' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                ○ Unread ({unreadUsers.length})
              </button>
              <button
                onClick={() => setShowList('read')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  showList === 'read' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                ✓ Read ({readUsers.length})
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {activeUsers.length === 0 ? (
                <div className="p-4 text-center text-zinc-400 text-xs font-mono">No {showList} recipients.</div>
              ) : (
                activeUsers.map((u: any) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-2.5 bg-zinc-50 rounded-lg border border-zinc-100"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-zinc-900">
                        {showList === 'unread' ? '○ ' : '✓ '}
                        {u.name}{' '}
                        <span className="text-zinc-500 font-normal">
                          ({ROLE_LABELS[u.role] ?? (u.role ? String(u.role).replace(/_/g, ' ') : 'Unknown')})
                        </span>
                      </span>
                      <span className="block text-[10px] text-zinc-400 font-mono truncate">
                        {u.email}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono font-bold uppercase text-zinc-400 whitespace-nowrap ml-3">
                      {u.role ? String(u.role).replace('_', ' ') : 'Unknown'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
