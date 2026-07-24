/**
 * End-to-end smoke of the trainee + admin flows against a LOCAL DEV server.
 *
 *   npm run smoke
 *
 * Prerequisites:
 *   - `npm run dev` running on SMOKE_BASE_URL (default http://localhost:3000)
 *   - the dev database from .env, migrated and seeded (`npm run db:seed`)
 *   - optional: SMOKE_CHROMIUM=/path/to/chromium for the browser stages
 *     (without it the browser stages are skipped; API stages still run)
 *
 * NOT run by CI or `npm test`: it needs a live server + browser, forges DB
 * session rows for the seeded fixture users (honest under the database
 * session strategy — no Google round-trip needed), and RESETS the seeded
 * trainee's attempts/completions/certificates in the dev DB so every run is
 * deterministic. Never point it at anything but a disposable dev database.
 *
 * Stages:
 *   1. auth: unauthenticated redirects; home renders the sector tree (RTL)
 *   2. quiz flow (browser): complete lesson → Start → ticking countdown →
 *      autosave → mid-attempt refresh resumes → submit → 100% result
 *   3. redaction: zero `correctOption` bytes in ANY observed response, and
 *      per-question isCorrect hidden while a retry remains
 *   4. expiry: backdated attempt lazily auto-submits on read (T-32)
 *   5. certificate: pass all sector quizzes via APIs → lazy issue on page
 *      visit → PDF magic bytes → public verify with no session
 *   6. grading: FREE_TEXT question → attempt parks PENDING_MANUAL_GRADE →
 *      grade via API → attempt honestly STAYS pending (T-26 gated)
 *   7. admin dashboard (browser): quiz catalog → per-quiz dashboard →
 *      failed-both flag → grant-extra-attempt click-through with reason →
 *      flag clears, audit row written, trainee can start attempt 3
 *   8. grading UI (browser): pending answer visible → grade via the form →
 *      queue empties, attempt honestly stays pending
 *   9. sector select (browser): optimistic value during the PATCH
 *      round-trip, persisted assignment, then restored
 *  10. question bank (browser): create a manual question via the form
 *      (lands DRAFT — no approval bypass), approve it, edit it (resets to
 *      DRAFT with a revision), re-approve, retire; audit rows asserted
 */
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import "dotenv/config";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const CHROMIUM = process.env.SMOKE_CHROMIUM;
const SMOKE_FREE_TEXT_PROMPT = "سؤال دخاني: صف تعاملك مع اعتراض العميل.";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set — copy .env.example to .env first.");
  process.exit(1);
}

let failures = 0;
function pass(stage: string, detail = "") {
  console.log(`PASS ${stage}${detail ? ` — ${detail}` : ""}`);
}
function fail(stage: string, detail: string) {
  failures += 1;
  console.error(`FAIL ${stage} — ${detail}`);
}

interface Ctx {
  db: Client;
  traineeCookie: { cookie: string };
  adminCookie: { cookie: string };
  traineeId: string;
}

async function forgeSession(db: Client, email: string): Promise<string> {
  const user = await db.query("SELECT id FROM users WHERE email=$1", [email]);
  if (user.rows.length === 0) throw new Error(`seed user ${email} missing — run npm run db:seed`);
  const token = randomBytes(32).toString("hex");
  await db.query('INSERT INTO sessions (id, "sessionToken", "userId", expires) VALUES ($1,$2,$3,$4)', [
    `smoke-${token.slice(0, 12)}`,
    token,
    user.rows[0].id,
    new Date(Date.now() + 3600_000),
  ]);
  return token;
}

async function resetTraineeState(db: Client) {
  const trainee = await db.query("SELECT id FROM users WHERE email='trainee@example.com'");
  const id = trainee.rows[0].id;
  await db.query('DELETE FROM attempts WHERE "userId"=$1', [id]);
  await db.query('DELETE FROM lesson_completions WHERE "userId"=$1', [id]);
  await db.query('DELETE FROM attempt_cap_overrides WHERE "userId"=$1', [id]);
  await db.query('DELETE FROM certificates WHERE "userId"=$1', [id]);
  await db.query("DELETE FROM questions WHERE prompt=$1", [SMOKE_FREE_TEXT_PROMPT]);
  await db.query(`DELETE FROM sessions WHERE id LIKE 'smoke-%'`);
  return id as string;
}

async function sectorLessons(ctx: Ctx): Promise<{ id: string; quizId: string }[]> {
  const content = await (await fetch(`${BASE}/api/content`, { headers: ctx.traineeCookie })).json();
  const lessons: { id: string }[] = content.sector.subSectors
    .flatMap((s: { units: { lessons: { id: string }[] }[] }) => s.units)
    .flatMap((u: { lessons: { id: string }[] }) => u.lessons);
  const out: { id: string; quizId: string }[] = [];
  for (const lesson of lessons) {
    const quiz = await ctx.db.query('SELECT id FROM quizzes WHERE "lessonId"=$1', [lesson.id]);
    if (quiz.rows.length > 0) out.push({ id: lesson.id, quizId: quiz.rows[0].id });
  }
  return out;
}

// Answers every question of an attempt correctly, straight through the API,
// reading the key from the DB snapshot (the API never exposes it).
async function passAttempt(ctx: Ctx, quizId: string): Promise<{ attemptId: string; passed: boolean }> {
  const start = await fetch(`${BASE}/api/quizzes/${quizId}/attempts`, { method: "POST", headers: ctx.traineeCookie });
  const startBody = await start.json();
  if (!start.ok) throw new Error(`startAttempt: ${JSON.stringify(startBody)}`);
  const attemptId: string = startBody.attempt.id;

  const rows = await ctx.db.query(
    'SELECT "questionId", "questionType", "correctOption" FROM attempt_answers WHERE "attemptId"=$1',
    [attemptId],
  );
  const payload = rows.rows.map((a) =>
    a.questionType === "FREE_TEXT" || a.questionType === "SCENARIO" || a.questionType === "MOCK_CALL"
      ? { questionId: a.questionId, textAnswer: "إجابة دخانية كاملة." }
      : { questionId: a.questionId, selectedOption: a.correctOption },
  );
  await fetch(`${BASE}/api/attempts/${attemptId}/answers`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...ctx.traineeCookie },
    body: JSON.stringify({ answers: payload }),
  });
  const submit = await (
    await fetch(`${BASE}/api/attempts/${attemptId}/submit`, { method: "POST", headers: ctx.traineeCookie })
  ).json();
  return { attemptId, passed: submit.attempt.passed === true };
}

// Fails an attempt on purpose: every auto-graded answer gets a wrong option.
async function failAttempt(ctx: Ctx, quizId: string): Promise<string> {
  const start = await fetch(`${BASE}/api/quizzes/${quizId}/attempts`, { method: "POST", headers: ctx.traineeCookie });
  const startBody = await start.json();
  if (!start.ok) throw new Error(`startAttempt (fail path): ${JSON.stringify(startBody)}`);
  const attemptId: string = startBody.attempt.id;
  const rows = await ctx.db.query(
    'SELECT "questionId", "questionType", options, "correctOption" FROM attempt_answers WHERE "attemptId"=$1',
    [attemptId],
  );
  const payload = rows.rows
    .filter((a) => a.questionType === "MCQ" || a.questionType === "TRUE_FALSE")
    .map((a) => ({
      questionId: a.questionId,
      selectedOption: a.options.find((o: { id: string }) => o.id !== a.correctOption).id,
    }));
  await fetch(`${BASE}/api/attempts/${attemptId}/answers`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...ctx.traineeCookie },
    body: JSON.stringify({ answers: payload }),
  });
  await fetch(`${BASE}/api/attempts/${attemptId}/submit`, { method: "POST", headers: ctx.traineeCookie });
  return attemptId;
}

type Browser = Awaited<ReturnType<(typeof import("playwright-core"))["chromium"]["launch"]>>;

async function adminPage(ctx: Ctx, browser: Browser) {
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: ctx.adminCookie.cookie.split("=")[1],
      domain: new URL(BASE).hostname,
      path: "/",
    },
  ]);
  return context.newPage();
}

async function stageAuthAndHome(ctx: Ctx) {
  const anon = await fetch(`${BASE}/`, { redirect: "manual" });
  const location = anon.headers.get("location") ?? "";
  if (anon.status === 307 && location.includes("/login")) pass("auth", "unauthenticated → /login");
  else fail("auth", `expected 307 → /login, got ${anon.status} → ${location}`);

  const home = await (await fetch(`${BASE}/`, { headers: ctx.traineeCookie })).text();
  if (home.includes("قطاع الخدمات") && home.includes("تسجيل الخروج")) pass("home", "sector tree renders");
  else fail("home", "sector tree markers missing from home HTML");
}

async function stageQuizFlowBrowser(ctx: Ctx, lesson: { id: string; quizId: string }) {
  if (!CHROMIUM) {
    console.log("SKIP quiz-flow-browser — SMOKE_CHROMIUM not set");
    return;
  }
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const leaks: string[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([
      {
        name: "authjs.session-token",
        value: ctx.traineeCookie.cookie.split("=")[1],
        domain: new URL(BASE).hostname,
        path: "/",
      },
    ]);
    const page = await context.newPage();
    page.on("response", async (response) => {
      try {
        const type = response.headers()["content-type"] ?? "";
        if (/json|text|javascript|x-component/.test(type)) {
          if ((await response.text()).includes("correctOption")) leaks.push(response.url());
        }
      } catch {
        /* body not always readable; the API-level redaction stage still covers it */
      }
    });

    await page.goto(`${BASE}/lessons/${lesson.id}`);
    await page.getByRole("button", { name: "أكملت الدرس" }).click();
    await page.waitForSelector("text=ابدأ الاختبار");
    await page.getByRole("button", { name: "ابدأ الاختبار" }).click();
    await page.waitForURL(/\/attempts\//);
    await page.waitForSelector("[role='timer']");
    const t1 = await page.locator("[role='timer']").innerText();
    await page.waitForTimeout(2200);
    const t2 = await page.locator("[role='timer']").innerText();
    if (t1 !== t2) pass("countdown", `${t1} → ${t2}`);
    else fail("countdown", `not ticking (${t1})`);

    const attemptId = page.url().split("/attempts/")[1];
    const rows = await ctx.db.query(
      'SELECT "questionPrompt", options, "correctOption" FROM attempt_answers WHERE "attemptId"=$1',
      [attemptId],
    );
    for (const row of rows.rows) {
      const correct = row.options.find((o: { id: string }) => o.id === row.correctOption);
      await page.locator("li", { hasText: row.questionPrompt }).locator("label", { hasText: correct.text }).first().click();
    }
    await page.waitForSelector("text=تم حفظ الإجابات", { timeout: 5000 });
    pass("autosave", `${rows.rows.length} answers`);

    await page.reload();
    await page.waitForSelector("[role='timer']");
    const checked = await page.locator("input[type=radio]:checked").count();
    if (checked === rows.rows.length) pass("resume", "answers intact after refresh");
    else fail("resume", `expected ${rows.rows.length} checked, got ${checked}`);

    await page.getByRole("button", { name: "تسليم الاختبار" }).click();
    await page.waitForURL(/\/quizzes\/.*\/result/);
    const body = await page.locator("body").innerText();
    if (body.includes("100%") && body.includes("ناجح")) pass("submit-result", "100% + ناجح");
    else fail("submit-result", "result page missing 100%/ناجح");

    if (leaks.length === 0) pass("browser-leak-audit", "no correctOption in any observed response");
    else fail("browser-leak-audit", `correctOption seen in: ${leaks.join(", ")}`);
  } finally {
    await browser.close();
  }
}

async function stageRedactionAndExpiry(ctx: Ctx, lesson: { id: string; quizId: string }) {
  // Fail attempt 1 deliberately (answer nothing), leaving a retry open.
  await fetch(`${BASE}/api/lessons/${lesson.id}/complete`, { method: "POST", headers: ctx.traineeCookie });
  const start = await (
    await fetch(`${BASE}/api/quizzes/${lesson.quizId}/attempts`, { method: "POST", headers: ctx.traineeCookie })
  ).json();
  const attemptId = start.attempt.id;
  // Backdate past the deadline → the GET below must lazily auto-submit.
  // "startedAt" is a naive TIMESTAMP(3) (no timezone). Plain NOW() - INTERVAL
  // stores this Postgres session's local wall-clock (e.g. Asia/Riyadh, +03)
  // into that naive column, which Prisma then reads back as if it were UTC —
  // a 3-hour misinterpretation. Converting through UTC first stores the true
  // UTC instant regardless of session timezone.
  await ctx.db.query(
    `UPDATE attempts SET "startedAt"=(NOW() AT TIME ZONE 'UTC') - INTERVAL '700 seconds' WHERE id=$1`,
    [attemptId],
  );

  const viewText = await (await fetch(`${BASE}/api/attempts/${attemptId}`, { headers: ctx.traineeCookie })).text();
  const view = JSON.parse(viewText);
  if (view.attempt.status === "AUTO_SUBMITTED") pass("expiry", "lazily auto-submitted on read");
  else fail("expiry", `expected AUTO_SUBMITTED, got ${view.attempt.status}`);

  if (!viewText.includes("correctOption")) pass("api-redaction", "no correctOption in attempt view");
  else fail("api-redaction", "correctOption present in GET /api/attempts/[id]");

  const hidden = view.attempt.answers.every((a: { isCorrect: boolean | null }) => a.isCorrect === null);
  if (hidden) pass("correctness-gating", "isCorrect hidden while a retry remains");
  else fail("correctness-gating", "isCorrect visible on failed attempt with retry available");
}

async function stageCertificate(ctx: Ctx, lessons: { id: string; quizId: string }[]) {
  for (const lesson of lessons) {
    await fetch(`${BASE}/api/lessons/${lesson.id}/complete`, { method: "POST", headers: ctx.traineeCookie });
    const outcome = await (
      await fetch(`${BASE}/api/quizzes/${lesson.quizId}/outcome`, { headers: ctx.traineeCookie })
    ).json();
    if (outcome.status === "PASSED") continue;
    const { passed } = await passAttempt(ctx, lesson.quizId);
    if (!passed) {
      fail("certificate", `could not pass quiz ${lesson.quizId}`);
      return;
    }
  }

  const pageHtml = await (await fetch(`${BASE}/certificate`, { headers: ctx.traineeCookie })).text();
  if (pageHtml.includes("شهادة إتمام التدريب")) pass("certificate-issue", "lazy issuance on page visit");
  else {
    fail("certificate-issue", "issued state not shown");
    return;
  }

  const pdf = await fetch(`${BASE}/api/certificate/pdf`, { headers: ctx.traineeCookie });
  const bytes = Buffer.from(await pdf.arrayBuffer());
  if (pdf.status === 200 && bytes.subarray(0, 4).toString() === "%PDF") pass("certificate-pdf", `${bytes.length} bytes`);
  else fail("certificate-pdf", `status ${pdf.status}`);

  const cert = await ctx.db.query('SELECT id FROM certificates WHERE "userId"=$1', [ctx.traineeId]);
  const verify = await (await fetch(`${BASE}/api/certificates/${cert.rows[0].id}/verify`)).json();
  if (verify.valid === true) pass("certificate-verify", "public endpoint, no session");
  else fail("certificate-verify", JSON.stringify(verify));
}

async function stageGrading(ctx: Ctx, lesson: { id: string; quizId: string }) {
  const created = await (
    await fetch(`${BASE}/api/admin/quizzes/${lesson.quizId}/questions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...ctx.adminCookie },
      body: JSON.stringify({ type: "FREE_TEXT", prompt: SMOKE_FREE_TEXT_PROMPT }),
    })
  ).json();
  await fetch(`${BASE}/api/admin/questions/${created.question.id}/approve`, {
    method: "POST",
    headers: ctx.adminCookie,
  });

  // The trainee has passed this quiz already but has an attempt slot left.
  const start = await fetch(`${BASE}/api/quizzes/${lesson.quizId}/attempts`, {
    method: "POST",
    headers: ctx.traineeCookie,
  });
  const startBody = await start.json();
  if (!start.ok) {
    fail("grading", `could not start manual-grade attempt: ${JSON.stringify(startBody)}`);
    return;
  }
  const attemptId = startBody.attempt.id;
  const rows = await ctx.db.query(
    'SELECT "questionId", "questionType", "correctOption" FROM attempt_answers WHERE "attemptId"=$1',
    [attemptId],
  );
  const payload = rows.rows.map((a) =>
    a.questionType === "FREE_TEXT"
      ? { questionId: a.questionId, textAnswer: "أستمع للاعتراض ثم أوضح القيمة." }
      : { questionId: a.questionId, selectedOption: a.correctOption },
  );
  await fetch(`${BASE}/api/attempts/${attemptId}/answers`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...ctx.traineeCookie },
    body: JSON.stringify({ answers: payload }),
  });
  const submit = await (
    await fetch(`${BASE}/api/attempts/${attemptId}/submit`, { method: "POST", headers: ctx.traineeCookie })
  ).json();
  if (submit.attempt.status === "PENDING_MANUAL_GRADE") pass("grading-route", "attempt parked for manual grading");
  else {
    fail("grading-route", `expected PENDING_MANUAL_GRADE, got ${submit.attempt.status}`);
    return;
  }

  const queue = await (await fetch(`${BASE}/api/admin/grading/pending`, { headers: ctx.adminCookie })).json();
  const pendingAnswer = queue.answers?.find(
    (a: { attempt: { id: string } }) => a.attempt.id === attemptId,
  );
  if (pendingAnswer) pass("grading-queue", "answer visible in pending queue");
  else {
    fail("grading-queue", "submitted answer not in queue");
    return;
  }

  await fetch(`${BASE}/api/admin/grading/answers/${pendingAnswer.id}/grade`, {
    method: "POST",
    headers: { "content-type": "application/json", ...ctx.adminCookie },
    body: JSON.stringify({ isCorrect: true, feedback: "إجابة ممتازة." }),
  });
  const after = await ctx.db.query("SELECT status, score FROM attempts WHERE id=$1", [attemptId]);
  if (after.rows[0].status === "PENDING_MANUAL_GRADE" && after.rows[0].score === null) {
    pass("grading-honesty", "fully-graded attempt still pending (T-26 gated on open item #4)");
  } else {
    fail("grading-honesty", `expected still-pending, got ${JSON.stringify(after.rows[0])}`);
  }
}

async function stageAdminDashboardBrowser(ctx: Ctx, browser: Browser, lesson: { id: string; quizId: string }) {
  // Fresh scenario: trainee fails both attempts → FAILED_FINAL_ATTEMPT.
  await resetTraineeState(ctx.db);
  ctx.traineeCookie = { cookie: `authjs.session-token=${await forgeSession(ctx.db, "trainee@example.com")}` };
  ctx.adminCookie = { cookie: `authjs.session-token=${await forgeSession(ctx.db, "admin@example.com")}` };
  await fetch(`${BASE}/api/lessons/${lesson.id}/complete`, { method: "POST", headers: ctx.traineeCookie });
  await failAttempt(ctx, lesson.quizId);
  await failAttempt(ctx, lesson.quizId);

  const page = await adminPage(ctx, browser);
  await page.goto(`${BASE}/admin/quizzes`);
  await page.waitForSelector("text=الأسئلة المعتمدة");
  await page.locator(`a[href='/admin/quizzes/${lesson.quizId}']`).click();
  await page.waitForSelector("text=أخفقوا في المحاولتين");

  const flagTile = page.locator("div", { hasText: /^1أخفقوا في المحاولتين$/ });
  if ((await flagTile.count()) > 0) pass("dashboard-flag", "failed-both tile shows 1");
  else fail("dashboard-flag", "failed-both tile not showing 1");

  await page.getByRole("button", { name: "منح محاولة إضافية" }).click();
  await page.locator("input[placeholder='السبب (إلزامي)']").fill("سماح دخاني بمحاولة ثالثة");
  await page.getByRole("button", { name: "تأكيد" }).click();
  // Success closes the form (the reason input disappears) and
  // router.refresh() re-renders the row without the grant button.
  await page.waitForSelector("input[placeholder='السبب (إلزامي)']", { state: "detached", timeout: 10000 });
  await page.waitForSelector("text=منح محاولة إضافية", { state: "detached", timeout: 10000 });
  pass("override-clickthrough", "grant confirmed and flag cleared");

  const audit = await ctx.db.query(
    `SELECT id FROM audit_logs WHERE action='attempt_cap_override_granted' ORDER BY "createdAt" DESC LIMIT 1`,
  );
  if (audit.rows.length > 0) pass("override-audit", "audit row written");
  else fail("override-audit", "no attempt_cap_override_granted audit row");

  const third = await fetch(`${BASE}/api/quizzes/${lesson.quizId}/attempts`, {
    method: "POST",
    headers: ctx.traineeCookie,
  });
  const thirdBody = await third.json();
  if (third.ok && thirdBody.attempt.attemptNumber === 3) pass("override-attempt3", "trainee started attempt 3");
  else fail("override-attempt3", JSON.stringify(thirdBody));
  await page.close();
}

async function stageGradingBrowser(ctx: Ctx, browser: Browser, lesson: { id: string; quizId: string }) {
  // A pending manual answer on the other quiz.
  const created = await (
    await fetch(`${BASE}/api/admin/quizzes/${lesson.quizId}/questions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...ctx.adminCookie },
      body: JSON.stringify({ type: "FREE_TEXT", prompt: SMOKE_FREE_TEXT_PROMPT }),
    })
  ).json();
  await fetch(`${BASE}/api/admin/questions/${created.question.id}/approve`, { method: "POST", headers: ctx.adminCookie });
  await fetch(`${BASE}/api/lessons/${lesson.id}/complete`, { method: "POST", headers: ctx.traineeCookie });
  const attemptId = await failAttempt(ctx, lesson.quizId); // wrong MCQ answers + unanswered FREE_TEXT → pending
  await fetch(`${BASE}/api/attempts/${attemptId}/answers`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...ctx.traineeCookie },
    body: JSON.stringify({ answers: [] }),
  }).catch(() => {});

  const page = await adminPage(ctx, browser);
  await page.goto(`${BASE}/admin/grading`);
  await page.waitForSelector(`text=${SMOKE_FREE_TEXT_PROMPT}`);
  pass("grading-ui-queue", "pending answer visible");

  await page.locator("label", { hasText: "إجابة صحيحة" }).first().click();
  await page.locator("textarea").first().fill("تقييم دخاني عبر الواجهة.");
  await page.getByRole("button", { name: "اعتماد التقييم" }).click();
  await page.waitForSelector("text=لا توجد إجابات بانتظار التصحيح", { timeout: 10000 });
  pass("grading-ui-form", "graded through the form; queue emptied");

  const after = await ctx.db.query("SELECT status, score FROM attempts WHERE id=$1", [attemptId]);
  if (after.rows[0].status === "PENDING_MANUAL_GRADE" && after.rows[0].score === null) {
    pass("grading-ui-honesty", "attempt still pending after full grading (T-26 gated)");
  } else {
    fail("grading-ui-honesty", JSON.stringify(after.rows[0]));
  }
  await page.close();
}

async function stageSectorSelectBrowser(ctx: Ctx, browser: Browser) {
  const sectors = await ctx.db.query("SELECT id, name FROM sectors ORDER BY name");
  const original = sectors.rows.find((s) => s.name === "الخدمات");
  const target = sectors.rows.find((s) => s.name !== "الخدمات");

  const page = await adminPage(ctx, browser);
  await page.goto(`${BASE}/admin/trainees`);
  const select = page.locator("select").first();
  if ((await select.inputValue()) !== original.id) {
    fail("sector-select", "trainee not starting in الخدمات");
    await page.close();
    return;
  }
  await select.selectOption(target.id);
  if ((await select.inputValue()) === target.id) pass("sector-select-optimistic", "picked value shown during PATCH");
  else fail("sector-select-optimistic", "select snapped back during PATCH");

  await page.waitForTimeout(2500);
  const persisted = await ctx.db.query("SELECT \"sectorId\" FROM users WHERE email='trainee@example.com'");
  if (persisted.rows[0].sectorId === target.id) pass("sector-select-persist", "assignment persisted");
  else fail("sector-select-persist", "assignment did not persist");

  await select.selectOption(original.id);
  await page.waitForTimeout(2500);
  const restored = await ctx.db.query("SELECT \"sectorId\" FROM users WHERE email='trainee@example.com'");
  if (restored.rows[0].sectorId === original.id) pass("sector-select-restore", "trainee back in الخدمات");
  else fail("sector-select-restore", "restore failed — fix manually: trainee should be in الخدمات");
  await page.close();
}

const SMOKE_MCQ_PROMPT = "سؤال دخاني يدوي: ما أفضل رد على تردد العميل؟";
const SMOKE_MCQ_PROMPT_EDITED = "سؤال دخاني معدل: ما أفضل رد على تردد العميل؟";

async function stageQuestionBankBrowser(ctx: Ctx, browser: Browser, lesson: { id: string; quizId: string }) {
  await ctx.db.query("DELETE FROM questions WHERE prompt IN ($1, $2)", [SMOKE_MCQ_PROMPT, SMOKE_MCQ_PROMPT_EDITED]);

  const page = await adminPage(ctx, browser);

  // Create via the form → lands in the DRAFT group (no approval bypass).
  await page.goto(`${BASE}/admin/quizzes/${lesson.quizId}/questions/new`);
  await page.locator("#q-prompt").fill(SMOKE_MCQ_PROMPT);
  await page.locator("input[placeholder='الخيار 1']").fill("أستمع وأعالج سبب التردد");
  await page.locator("input[placeholder='الخيار 2']").fill("أضغط عليه ليشتري فوراً");
  await page.locator("input[name='mcq-correct']").first().check();
  await page.getByRole("button", { name: "حفظ السؤال" }).click();
  await page.waitForURL(/\/questions$/);
  await page.waitForSelector(`text=${SMOKE_MCQ_PROMPT}`);
  const { rows: created } = await ctx.db.query("SELECT id, status, source FROM questions WHERE prompt=$1", [
    SMOKE_MCQ_PROMPT,
  ]);
  if (created[0]?.status === "DRAFT" && created[0]?.source === "MANUAL") {
    pass("qbank-create", "manual question created as DRAFT");
  } else {
    fail("qbank-create", JSON.stringify(created[0]));
    await page.close();
    return;
  }
  const questionId = created[0].id;

  // Approve via the button (ours is the only DRAFT — seeded questions are APPROVED).
  await page.getByRole("button", { name: "اعتماد" }).first().click();
  await page.waitForTimeout(1500);
  const { rows: approved } = await ctx.db.query("SELECT status FROM questions WHERE id=$1", [questionId]);
  if (approved[0].status === "APPROVED") pass("qbank-approve", "hard gate exercised through the UI");
  else fail("qbank-approve", `status ${approved[0].status}`);

  // Edit → resets to DRAFT and archives a revision.
  await page.goto(`${BASE}/admin/questions/${questionId}`);
  await page.waitForSelector("text=تعديل سؤال معتمد يعيده إلى مسودة");
  await page.locator("#q-prompt").fill(SMOKE_MCQ_PROMPT_EDITED);
  await page.getByRole("button", { name: "حفظ السؤال" }).click();
  await page.waitForURL(/\/questions$/);
  const { rows: edited } = await ctx.db.query(
    `SELECT q.status, (SELECT count(*) FROM question_revisions r WHERE r."questionId"=q.id) AS revisions
     FROM questions q WHERE q.id=$1`,
    [questionId],
  );
  if (edited[0].status === "DRAFT" && Number(edited[0].revisions) === 1) {
    pass("qbank-edit", "edit reset APPROVED → DRAFT and archived a revision");
  } else {
    fail("qbank-edit", JSON.stringify(edited[0]));
  }

  // Re-approve, then retire — scoped to OUR question's card (several other
  // APPROVED questions exist on the page).
  await page.reload();
  await page.getByRole("button", { name: "اعتماد" }).first().click();
  await page.waitForTimeout(1500);
  await page
    .locator("div.rounded-lg", { hasText: SMOKE_MCQ_PROMPT_EDITED })
    .getByRole("button", { name: "سحب من التداول" })
    .click();
  await page.waitForTimeout(1500);
  const { rows: retired } = await ctx.db.query("SELECT status FROM questions WHERE id=$1", [questionId]);
  if (retired[0].status === "RETIRED") pass("qbank-retire", "approved question withdrawn");
  else fail("qbank-retire", `status ${retired[0].status}`);

  const { rows: audits } = await ctx.db.query(
    `SELECT action, count(*) FROM audit_logs WHERE "targetId"=$1 GROUP BY action`,
    [questionId],
  );
  const actions = new Set(audits.map((a) => a.action));
  if (["question_created", "question_approved", "question_edited", "question_retired"].every((a) => actions.has(a))) {
    pass("qbank-audit", "created/approved/edited/retired all audit-logged");
  } else {
    fail("qbank-audit", `actions seen: ${[...actions].join(", ")}`);
  }

  await ctx.db.query("DELETE FROM questions WHERE id=$1", [questionId]);
  await page.close();
}

async function main() {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    const traineeId = await resetTraineeState(db);
    const ctx: Ctx = {
      db,
      traineeId,
      traineeCookie: { cookie: `authjs.session-token=${await forgeSession(db, "trainee@example.com")}` },
      adminCookie: { cookie: `authjs.session-token=${await forgeSession(db, "admin@example.com")}` },
    };

    const lessons = await sectorLessons(ctx);
    if (lessons.length < 2) throw new Error("expected at least 2 seeded lessons with quizzes in the trainee's sector");

    await stageAuthAndHome(ctx);
    await stageQuizFlowBrowser(ctx, lessons[0]);
    await stageRedactionAndExpiry(ctx, lessons[1]);
    await stageCertificate(ctx, lessons);
    // lessons[0] has an attempt slot left (browser stage passed on attempt 1);
    // lessons[1] used both slots across the expiry + certificate stages.
    await stageGrading(ctx, lessons[0]);

    if (CHROMIUM) {
      const { chromium } = await import("playwright-core");
      const browser = await chromium.launch({ executablePath: CHROMIUM });
      try {
        // Resets trainee state internally for the failed-both scenario.
        await stageAdminDashboardBrowser(ctx, browser, lessons[0]);
        await stageGradingBrowser(ctx, browser, lessons[1]);
        await stageSectorSelectBrowser(ctx, browser);
        await stageQuestionBankBrowser(ctx, browser, lessons[0]);
      } finally {
        await browser.close();
      }
    } else {
      console.log("SKIP admin-browser stages — SMOKE_CHROMIUM not set");
    }

    // Leave the dev DB tidy for the next run/session.
    await db.query("DELETE FROM questions WHERE prompt=$1", [SMOKE_FREE_TEXT_PROMPT]);
    await db.query(`DELETE FROM sessions WHERE id LIKE 'smoke-%'`);
  } finally {
    await db.end();
  }

  if (failures > 0) {
    console.error(`\nSMOKE FAILED — ${failures} stage(s) failed`);
    process.exit(1);
  }
  console.log("\nSMOKE PASS — all stages green");
}

main().catch((error) => {
  console.error("SMOKE CRASHED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
