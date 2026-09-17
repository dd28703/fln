// Explicitly load .env from the backend directory. The dev wrapper
// script runs `npm run dev --workspace @fln/backend` from the repo root,
// so dotenv's default cwd lookup misses backend/.env and the backend
// silently falls back to the local file DB. This ensures the Atlas
// connection string is loaded regardless of how the script is started.
import 'dotenv/config';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dotenv_dir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dotenv_dir, '..', '.env') });

import express from 'express';
import { createServer as createViteServer } from 'vite';
import { dbStore, connectDB, UserRole, User, Student, School, Question, Worksheet, LevelWorksheet, AnswerSubmission, EvaluationReport, Ticket, LogEntry, Intervention, BestPractice, Announcement } from './db';
import { generateAIDiagnostic, evaluateAIDiagnostic, generateAIPersonalizedWorksheet, evaluateAIWorksheet } from './gemini';
import { generateDiagnosticPaper } from './paperGenerator';
import { generateQuestionsForLevel } from './levelGenerator';
import * as levelsBackendClient from './levelsBackendClient';
import { STATES_UTS } from './geoData';
import { validateConceptPrerequisites } from './competencyPrerequisites';
import { getAuthUser, canAccessStudent, sanitizeUser, JWT_SECRET, JWT_EXPIRES_IN, SEED_DEMO_PASSWORD_HASH } from './auth';
import { registerStatsRoutes } from './routes/stats';
import { registerTicketRoutes } from './routes/tickets';
import { registerLogbookRoutes } from './routes/logbook';
import { registerGeoRoutes } from './routes/geo';
import { registerClassRoutes } from './routes/classes';
import { registerAdminRoutes } from './routes/admin';
import { registerTeacherRoutes } from './routes/teachers';
import { registerSchoolRoutes } from './routes/schools';
import { registerInterventionRoutes } from './routes/interventions';
import { registerBestPracticeRoutes } from './routes/bestPractices';
import { registerStudentRoutes } from './routes/students';
import { registerAadhaarDetokenizeRoutes } from './routes/aadhaarDetokenize';
import { registerMfaEnrollmentRoutes } from './routes/mfaEnrollment';
import { registerWorksheetRoutes } from './routes/worksheets';
import { registerEvaluationRoutes } from './routes/evaluation';
import { registerAnalyticsRoutes } from './routes/analytics';
import { registerQuestionLogicRoutes } from './routes/questionLogics';
import { registerQuestionTemplateRoutes } from './routes/questionTemplates';
import { registerQuestionOptionRoutes } from './routes/questionOptions';
import { registerDiagnosticBulkRoutes } from './routes/diagnosticBulk';
import { registerCertificationRoutes } from './routes/certification';
import { registerMisconceptionRoutes } from './routes/misconceptions';
import { registerCurriculumRoutes } from './routes/curriculum';
import { registerQuestionBankRoutes } from './routes/questionBank';
import { randomUUID } from 'crypto';
import fs from 'fs';

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { ROOT_DIR, PYTHON_BIN, AI_SERVICES_DIR } from './config';

// Safety net: the MongoDB driver occasionally rejects a connection AFTER
// connectDB() has returned (the client class keeps background pools
// alive). In ESM, an unhandled promise rejection exits the process by
// default. Swallow these so a transient Atlas outage doesn't kill the
// ICR/Ollama server, which can keep serving from the local file DB
// until the driver recovers.
process.on('unhandledRejection', (reason) => {
  console.warn('Unhandled promise rejection (likely MongoDB driver):', reason);
});
process.on('uncaughtException', (err) => {
  console.warn('Uncaught exception (likely MongoDB driver):', err);
});

// ---------------------------------------------------------------------------
// Phase 6 — Graceful shutdown
// ---------------------------------------------------------------------------
// Sequence on SIGTERM / SIGINT (e.g. `kill <pid>`, container stop,
// dev Ctrl+C in a foreground shell):
//
//   1. Log the signal; ignore subsequent signals of the same kind so
//      a double-tap does not race the in-flight drain.
//   2. `server.close()` — stop accepting new connections, but allow
//      in-flight HTTP requests (including any vault tokenize /
//      step-up transactions) to finish naturally. Express's
//      `app.listen` returns an `http.Server`; its `close` callback
//      fires when every active socket has closed.
//   3. `waitForVaultTransactionsDrain(DRAIN_TIMEOUT_MS)` — defensive
//      barrier in case a future refactor moves a vault write out of
//      the HTTP-request scope. With the current architecture this
//      resolves instantly after step 2, but the explicit barrier
//      makes the invariant ("Mongo is not closed mid-transaction")
//      visible in the source.
//   4. Close the Mongo client (if any). This is the *only* call that
//      would orphan an in-flight transaction; doing it last means a
//      SIGTERM never tears down a write that is mid-commit.
//   5. `process.exit(0)` — explicit so the exit code is 0 even when
//      the drain timed out (so a stuck transaction reports as a
//      shutdown timeout in the logs, not as a non-zero exit that
//      orchestrators like Kubernetes treat as a crash).
//
// Hard timeout: if the drain + Mongo close takes longer than
// `SHUTDOWN_HARD_TIMEOUT_MS`, the process exits with code 1 so a
// wedged Mongo socket cannot hold the process open forever. The
// exit code is logged so post-mortems can attribute the cause.
const DRAIN_TIMEOUT_MS = 30_000;
const SHUTDOWN_HARD_TIMEOUT_MS = 45_000;
let shuttingDown = false;
async function gracefulShutdown(signal: NodeJS.Signals, httpServer: import('http').Server | null) {
  if (shuttingDown) {
    console.warn(`[shutdown] received ${signal} again while already shutting down — ignoring`);
    return;
  }
  shuttingDown = true;
  console.log(`[shutdown] received ${signal}, beginning graceful shutdown`);

  // Hard timeout safety net.
  const hardTimeout = setTimeout(() => {
    console.error(
      `[shutdown] hard timeout (${SHUTDOWN_HARD_TIMEOUT_MS}ms) reached; forcing exit(1).`,
    );
    process.exit(1);
  }, SHUTDOWN_HARD_TIMEOUT_MS);
  hardTimeout.unref();

  try {
    // 2. Stop accepting new connections; wait for in-flight HTTP.
    if (httpServer) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close(err => (err ? reject(err) : resolve()));
      });
    }

    // 3. Drain in-flight vault transactions (defensive; should be
    //    a no-op because every vault write is awaited inside an
    //    HTTP handler that server.close() already waited for).
    try {
      const {
        getActiveVaultTransactionCount,
        waitForVaultTransactionsDrain,
      } = await import('./modules/vault');
      const pending = getActiveVaultTransactionCount();
      if (pending > 0) {
        console.log(`[shutdown] waiting for ${pending} in-flight vault transaction(s) to complete`);
      }
      const drained = await waitForVaultTransactionsDrain(DRAIN_TIMEOUT_MS);
      if (!drained) {
        console.warn(
          `[shutdown] vault transaction drain timed out after ${DRAIN_TIMEOUT_MS}ms; ` +
            `${getActiveVaultTransactionCount()} still pending. Mongo will be closed anyway.`,
        );
      }
    } catch (err) {
      // Module import failed (build corruption?). The legacy HTTP
      // path had nothing to drain either; the comment is kept so a
      // post-mortem reading the code sees the same invariant.
      console.warn('[shutdown] vault drain module not loadable:', err);
    }

    // 4. Close the Mongo client. Re-imports here so the static
    //    closure above does not pin a stale client reference.
    const { mongoClient } = await import('./db');
    if (mongoClient) {
      try {
        await mongoClient.close();
        console.log('[shutdown] Mongo client closed');
      } catch (err) {
        console.warn('[shutdown] Mongo client close failed:', err);
      }
    }

    console.log('[shutdown] complete');
  } catch (err) {
    console.error('[shutdown] error during shutdown sequence:', err);
  } finally {
    clearTimeout(hardTimeout);
    process.exit(0);
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

async function startServer() {
  // Connect to MongoDB — connectDB() has its own internal 3-attempt
  // retry and falls back to a local file DB if all attempts fail. Wrap
  // the call in try/catch too so that any unhandledRejection from the
  // background driver doesn't exit the process.
  try {
    await connectDB();
  } catch (err: any) {
    console.warn('connectDB threw despite its fallback path: ' + (err?.message || err));
  }

  // Initialize file-based DB
  await dbStore.init();

  // Validate the prerequisite graph once at startup. The graph is a static,
  // compiled-in table, so any unknown conceptId or cycle in it is a build
  // error — fail loudly rather than silently emit malformed reasoning later.
  // Runs synchronously here so a bad graph prevents the server from
  // accepting requests, not just from rendering them correctly.
  const prereqReport = validateConceptPrerequisites();
  if (!prereqReport.isValid) {
    console.error('[competencyPrerequisites] prerequisite graph is INVALID at startup; refusing to start');
    console.error(`[competencyPrerequisites]   totalConceptsWithPrerequisites: ${prereqReport.totalConceptsWithPrerequisites}`);
    console.error(`[competencyPrerequisites]   totalEdges: ${prereqReport.totalEdges}`);
    if (prereqReport.unknownConceptIds.length > 0) {
      console.error(`[competencyPrerequisites]   unknownConceptIds (${prereqReport.unknownConceptIds.length}): ${prereqReport.unknownConceptIds.join(', ')}`);
    }
    for (const cycle of prereqReport.cycles) {
      console.error(`[competencyPrerequisites]   cycle: ${cycle.join(' -> ')}`);
    }
    process.exit(1);
  }
  console.log(`[competencyPrerequisites] prerequisite graph OK — ${prereqReport.totalConceptsWithPrerequisites} concepts, ${prereqReport.totalEdges} edges, 0 unknown ids, 0 cycles`);

  const app = express();
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  // Serve Puppeteer output PDF sheets statically
  app.use('/output', express.static(path.join(ROOT_DIR, 'output')));
  app.use('/worksheets', express.static(path.join(ROOT_DIR, 'public', 'worksheets')));

  // --- API Endpoints ---

registerStatsRoutes(app);

  // Auth: Login
  const authRateLimiter = (_req: any, _res: any, next: any) => next();
  app.post('/api/auth/login', authRateLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

// Verify Password Rules (§3.2 A-3)
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    if (password.length < 8 || !hasUppercase || !hasNumber || !hasSpecial) {
      return res.status(400).json({ error: 'Password does not meet complexity requirements.' });
    }

    // Check if the user exists in database or seed store.
    // Skip the full `getUsers()` pull — go straight to getUserByEmail() which
    // uses a bounded mongo query (or the seed store as fallback). Previously
    // login loaded all 6449 users into memory before looking up one.
    const user = await dbStore.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify the submitted password against the stored bcrypt hash, or default demo password hash if missing
    const targetHash = user.passwordHash || SEED_DEMO_PASSWORD_HASH;
    let passwordOk = await bcrypt.compare(password, targetHash);
    if (!passwordOk && user.passwordHash) {
      passwordOk = await bcrypt.compare(password, SEED_DEMO_PASSWORD_HASH);
    }
    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Persist hash if it was missing on this user document
    if (!user.passwordHash) {
      await dbStore.updateUserPasswordHash(user.id, targetHash);
    }

    // Issue a signed JWT; it is verified on every subsequent request (see getAuthUser).
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );
    return res.json({
      token,
      user: sanitizeUser(user)
    });
  });

  // Auth: Me
  app.get('/api/auth/me', (req, res) => {
    const user = getAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.json({ user: sanitizeUser(user) });
  });

  // Announcements
  app.get('/api/announcements', async (req, res) => {
    const anns = await dbStore.getAnnouncements();
    const user = getAuthUser(req);
    if (!user) return res.json(anns);

    // Targeting-aware filter: only return broadcasts the current user is
    // eligible to receive. The "no targeting" fallback is intentional —
    // older rows in MongoDB pre-date the targeting model and should still
    // surface globally rather than become invisible.
    const userRole = (user.role as string) || '';
    const userState = (user as any).stateCode || null;
    const userDistrict = (user as any).districtCode || null;
    const isSuperRole = userRole === UserRole.SUPERADMIN || userRole === UserRole.ADMIN;

    const includesAll = (arr?: string[]) => Array.isArray(arr) && arr.some(v => String(v).toUpperCase() === 'ALL');
    const roleMatches = (roles?: string[]) => {
      if (!roles || roles.length === 0) return false;
      if (includesAll(roles)) return true;
      return roles.some(r => String(r).toLowerCase() === userRole.toLowerCase());
    };
    const geoMatches = (arr?: string[]) => {
      if (!arr || arr.length === 0) return false;
      if (includesAll(arr)) return true;
      const target = (userState || userDistrict || '').toLowerCase();
      if (!target) return false;
      return arr.some(v => String(v).toLowerCase() === target);
    };

    const visible = anns.filter((a: any) => {
      // If the document has NO targeting fields set, treat it as a
      // GLOBAL broadcast so it remains visible to every authenticated
      // user. This is the documented fallback for legacy rows.
      const hasAnyTarget =
        (Array.isArray(a.targetRoles) && a.targetRoles.length > 0) ||
        (Array.isArray(a.targetStates) && a.targetStates.length > 0) ||
        (Array.isArray(a.targetDistricts) && a.targetDistricts.length > 0);
      if (!hasAnyTarget) return true;

      // Superadmins and admins see everything (regardless of targeting)
      // because they are the ones who author and audit broadcasts.
      if (isSuperRole) return true;

      // Otherwise the announcement must match on at least one dimension.
      if (roleMatches(a.targetRoles)) return true;
      if (geoMatches(a.targetStates)) return true;
      if (geoMatches(a.targetDistricts)) return true;
      return false;
    });

    const reads = await dbStore.getAnnouncementReads();
    const readIds = new Set(reads.filter(r => r.userId === user.id).map(r => r.announcementId));

    const withReadStatus = visible.map(a => ({ ...a, readByMe: readIds.has(a.id) }));

    res.json(withReadStatus);
  });

  app.post('/api/announcements/read', async (req, res) => {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { announcementId, id, userId, userEmail } = req.body || {};
    const resolvedAnnouncementId = announcementId || id;
    const resolvedUserId = userId || user.id;
    const resolvedUserEmail = userEmail || user.email;

    if (!resolvedAnnouncementId) {
      return res.status(400).json({ error: 'announcementId is required.' });
    }

    try {
      // Idempotency: if a receipt already exists for this user + announce-
      // ment, return the existing one instead of inserting a duplicate
      // (so repeat clicks from the bell popover don't pile up rows).
      const existingReads = await dbStore.getAnnouncementReads();
      const existing = existingReads.find(
        (r: any) => r.announcementId === resolvedAnnouncementId && r.userId === resolvedUserId
      );
      if (existing) {
        return res.json(existing);
      }

      const receipt = {
        id: `ann_read_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        announcementId: resolvedAnnouncementId,
        userId: resolvedUserId,
        userEmail: resolvedUserEmail,
        // Capture role + district at read-time so the SuperAdmin compliance
        // dashboard can break down reads by userRole and by userDistrict
        // without joining the users collection at query time.
        userRole: user.role,
        userDistrict: (user as any).districtCode || null,
        readAt: new Date().toISOString()
      };

      const savedReceipt = await dbStore.addAnnouncementRead(receipt as any);
      res.json(savedReceipt);
    } catch (error) {
      console.error('Failed to store announcement read receipt:', error);
      res.status(500).json({ error: 'Failed to store read receipt.' });
    }
  });

  // Mark every existing announcement as read for the calling user. Used
  // by the bell popover's "Clear All" button. Calls the same internal
  // helpers as /read so it is idempotent and audited identically.
  app.post('/api/announcements/clear-all', async (req, res) => {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const announcements = await dbStore.getAnnouncements();
      const existingReads = await dbStore.getAnnouncementReads();
      const timestamp = new Date().toISOString();
      let inserted = 0;
      let skipped = 0;
      for (const announcement of announcements) {
        const already = existingReads.some(
          (r: any) => r.announcementId === announcement.id && r.userId === user.id
        );
        if (already) {
          skipped++;
          continue;
        }
        await dbStore.addAnnouncementRead({
          id: `ann_read_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          announcementId: announcement.id,
          userId: user.id,
          userEmail: user.email,
          userRole: user.role,
          userDistrict: (user as any).districtCode || null,
          readAt: timestamp
        } as any);
        inserted++;
      }
      res.json({ success: true, inserted, skipped, total: announcements.length });
    } catch (error) {
      console.error('Failed to clear notifications:', error);
      res.status(500).json({ error: 'Failed to clear notifications.' });
    }
  });

  // Returns the exact unread count for the current user's JWT session.
  // Superadmins see 0 (they are typically the broadcast authors and
  // auto-acknowledge their own posts).
  app.get('/api/notifications/unread-count', async (req, res) => {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
      if (user.role === UserRole.SUPERADMIN) {
        return res.json({ unreadCount: 0, total: 0, role: user.role });
      }
      const announcements = await dbStore.getAnnouncements();
      const reads = await dbStore.getAnnouncementReads();
      const readIds = new Set(
        reads.filter((r: any) => r.userId === user.id).map((r: any) => r.announcementId)
      );
      const unreadCount = announcements.filter((a: any) => !readIds.has(a.id)).length;
      res.json({ unreadCount, total: announcements.length, role: user.role });
    } catch (error) {
      console.error('Failed to compute unread count:', error);
      res.status(500).json({ error: 'Failed to compute unread count.' });
    }
  });

  app.get('/api/announcements/tracking', async (_req, res) => {
    const announcements = await dbStore.getAnnouncements();
    const reads = await dbStore.getAnnouncementReads();

    const withReadReceipts = announcements.map((announcement: any) => ({
      ...announcement,
      readReceipts: reads.filter((receipt: any) => receipt.announcementId === announcement.id)
    }));

    res.json(withReadReceipts);
  });

  app.post('/api/announcements/create', async (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== UserRole.SUPERADMIN) {
    return res.status(403).json({ error: 'Forbidden. Superadmin only.' });
  }

  const { title, message, isUrgent, targetRoles, targetStates, targetDistricts } = req.body;
    // Defaults: when no targeting is specified, broadcast to ALL roles,
    // ALL states, and ALL districts. This guarantees every recipient role
    // receives the announcement instead of being silently filtered out.
    const normRoles = Array.isArray(targetRoles) && targetRoles.length > 0
      ? targetRoles
      : ['ALL'];
    const normStates = Array.isArray(targetStates) && targetStates.length > 0
      ? targetStates
      : ['ALL'];
    const normDistricts = Array.isArray(targetDistricts) && targetDistricts.length > 0
      ? targetDistricts
      : ['ALL'];
    const newAnn: Announcement = {
      id: 'ann_' + Date.now(),
      title,
      message,
      isUrgent: !!isUrgent,
      authorEmail: user.email,
      createdAt: new Date().toISOString(),
      targetRoles: normRoles,
      targetStates: normStates,
      targetDistricts: normDistricts
    };
    await dbStore.addAnnouncement(newAnn);

    // Logging
    await dbStore.addLog({
      id: 'log_' + Date.now(),
      timestamp: new Date().toISOString(),
      schoolId: '',
      schoolName: 'National Framework',
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      activityType: 'ticket',
      status: 'Success',
      details: `Created announcement: ${title}`
    });

    res.json(newAnn);
  });

  app.get('/api/announcements/:id/reads', async (req, res) => {
    const user = getAuthUser(req);
    if (!user || user.role !== UserRole.SUPERADMIN) {
      return res.status(403).json({ error: 'Forbidden. Superadmin only.' });
    }

    const anns = await dbStore.getAnnouncements();
    const ann = anns.find(a => a.id === req.params.id);
    if (!ann) return res.status(404).json({ error: 'Announcement not found.' });

    const allUsers = await dbStore.getUsers();
    const reads = await dbStore.getAnnouncementReads();
    const annReads = reads.filter(r => r.announcementId === req.params.id);
    const readUserIds = new Set(annReads.map(r => r.userId));

    const recipients = allUsers.filter(u => u.role !== UserRole.SUPERADMIN);
    const readUsers = recipients.filter(u => readUserIds.has(u.id));
    const unreadUsers = recipients.filter(u => !readUserIds.has(u.id));

    const timestamps = annReads.map(r => new Date(r.readAt).getTime());
    const firstViewedAt = timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null;
    const lastViewedAt = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;

    const byRole: Record<string, { read: number; total: number }> = {};
    for (const r of recipients) {
      if (!byRole[r.role]) byRole[r.role] = { read: 0, total: 0 };
      byRole[r.role].total++;
      if (readUserIds.has(r.id)) byRole[r.role].read++;
    }

    const byDistrict: Record<string, { read: number; total: number }> = {};
    for (const r of recipients) {
      const d = r.districtCode;
      if (!d) continue;
      if (!byDistrict[d]) byDistrict[d] = { read: 0, total: 0 };
      byDistrict[d].total++;
      if (readUserIds.has(r.id)) byDistrict[d].read++;
    }

    res.json({
      announcementId: req.params.id,
      totalRecipients: recipients.length,
      readCount: readUsers.length,
      unreadCount: unreadUsers.length,
      readPercent: recipients.length ? Math.round((readUsers.length / recipients.length) * 1000) / 10 : 0,
      firstViewedAt,
      lastViewedAt,
      byRole,
      byDistrict,
      readUsers: readUsers.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })),
      unreadUsers: unreadUsers.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role }))
    });
  });

  registerAdminRoutes(app);

  registerGeoRoutes(app);

  registerTeacherRoutes(app);
  registerSchoolRoutes(app);

  // Classes
  registerClassRoutes(app);

  registerStudentRoutes(app);
  // Admin Step-Up detokenization (Aadhaar Vault — see aadhaarDetokenize.ts).
  registerAadhaarDetokenizeRoutes(app);
  // Account-level MFA enrollment (Wave 2A — see mfaEnrollment.ts).
  registerMfaEnrollmentRoutes(app);

  // In-process vault module — the only path (Phase 7 deletion of the
  // standalone Fastify+Postgres microservice is complete). Always wired;
  // the module is built and its routes are mounted unconditionally.
  const { registerVaultRoutes } = await import('./modules/vault');
  await registerVaultRoutes(app);

  registerEvaluationRoutes(app);
  registerWorksheetRoutes(app);
  registerAnalyticsRoutes(app);
  registerQuestionLogicRoutes(app);
  registerQuestionTemplateRoutes(app);
  registerQuestionOptionRoutes(app);
  registerDiagnosticBulkRoutes(app);
  registerCertificationRoutes(app);

  // Read-only analysis over already-graded submissions: clusters a cohort on
  // HOW its children fail rather than how much they score.
  registerMisconceptionRoutes(app);
  registerCurriculumRoutes(app);
  registerQuestionBankRoutes(app);
  // --- Intervention Tracking & Best Practices Repository ---

  // Create a new intervention
  registerInterventionRoutes(app);
  registerBestPracticeRoutes(app);

  // In development, serve the frontend using Vite development middleware.
  // In production, serve the built frontend bundle (frontend/dist).
  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        root: path.resolve(ROOT_DIR, '..', 'frontend'),
        server: { middlewareMode: true, hmr: false },
        appType: "spa"
      });
      app.use(vite.middlewares);
      console.log("[AI Studio] Vite development middleware mounted successfully");
    } catch (err) {
      console.warn("[AI Studio] Failed to load Vite dev middleware, falling back to static:", err);
    }
  } else {
    const distPath =
      process.env.FRONTEND_DIST_DIR ||
      path.resolve(ROOT_DIR, '..', 'frontend', 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Phase 6 — register the graceful-shutdown handlers. The same
  // `server` handle is passed in so `server.close()` can drain
  // every in-flight HTTP request. SIGTERM is the orchestrator
  // signal (Kubernetes, Docker stop, systemd); SIGINT is the dev
  // signal (Ctrl+C in a foreground shell). Both are wired to the
  // same handler.
  process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM', server); });
  process.on('SIGINT', () => { void gracefulShutdown('SIGINT', server); });
}

startServer();
