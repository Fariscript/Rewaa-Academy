/**
 * Perf sanity for NFR-08 / NFR-16 — first real numbers, not a load test.
 *
 *   npx tsx scripts/perf-sanity.ts [cohortSize]   (default 300)
 *
 * Seeds a throwaway cohort into the DEV database (users + finalized
 * attempts, all id-prefixed "perf-"), measures the hot read paths over
 * HTTP through a real dev server with forged sessions, prints median
 * latencies, then deletes everything it created. Needs `npm run dev`
 * running (SMOKE_BASE_URL, default http://localhost:3000).
 *
 * Why these paths: the admin per-quiz dashboard does per-trainee queries
 * (attempts + lazy-expiry sync + cap-override aggregate), so it's the
 * first thing expected to hurt as the cohort grows; the trainee home is
 * batched and should stay flat. Recorded in HANDOFF.md — re-run after
 * anything touches src/lib/dashboard/ or src/lib/content/trainee-progress.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import "dotenv/config";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const COHORT = Number(process.argv[2] ?? 300);

async function median(label: string, runs: number, fn: () => Promise<void>) {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const mid = times[Math.floor(times.length / 2)];
  console.log(`${label.padEnd(46)} median ${mid.toFixed(0).padStart(6)} ms  (n=${runs}, max ${times[times.length - 1].toFixed(0)} ms)`);
  return mid;
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const sector = await db.query("SELECT id FROM sectors WHERE name='الخدمات'");
  const sectorId = sector.rows[0].id;
  const quiz = await db.query(
    `SELECT q.id FROM quizzes q JOIN lessons l ON q."lessonId"=l.id
     JOIN units u ON l."unitId"=u.id JOIN sub_sectors ss ON u."subSectorId"=ss.id
     WHERE ss."sectorId"=$1 LIMIT 1`,
    [sectorId],
  );
  const quizId = quiz.rows[0].id;

  console.log(`Seeding throwaway cohort: ${COHORT} trainees × 2 finalized attempts on quiz ${quizId} ...`);
  const userValues: string[] = [];
  const attemptValues: string[] = [];
  for (let i = 0; i < COHORT; i++) {
    const uid = `perf-u-${i}-${randomUUID().slice(0, 8)}`;
    userValues.push(`('${uid}', 'perf-${i}@example.com', 'متدرب أداء ${i}', 'TRAINEE', '${sectorId}', now(), now())`);
    for (let n = 1; n <= 2; n++) {
      const aid = `perf-a-${i}-${n}-${randomUUID().slice(0, 8)}`;
      const score = n === 2 && i % 3 === 0 ? 100 : 50;
      attemptValues.push(
        `('${aid}', '${uid}', '${quizId}', ${n}, 'SUBMITTED', now() - interval '1 hour', now() - interval '50 minutes', ${score}, ${score >= 95}, now(), now())`,
      );
    }
  }
  await db.query(
    `INSERT INTO users (id, email, name, role, "sectorId", "createdAt", "updatedAt") VALUES ${userValues.join(",")}`,
  );
  await db.query(
    `INSERT INTO attempts (id, "userId", "quizId", "attemptNumber", status, "startedAt", "submittedAt", score, passed, "createdAt", "updatedAt") VALUES ${attemptValues.join(",")}`,
  );

  // Forged sessions for HTTP measurement.
  const admin = await db.query("SELECT id FROM users WHERE email='admin@example.com'");
  const trainee = await db.query("SELECT id FROM users WHERE email='trainee@example.com'");
  const mkSession = async (userId: string) => {
    const token = randomBytes(32).toString("hex");
    await db.query('INSERT INTO sessions (id, "sessionToken", "userId", expires) VALUES ($1,$2,$3,$4)', [
      `perf-s-${token.slice(0, 10)}`,
      token,
      userId,
      new Date(Date.now() + 3600_000),
    ]);
    return { cookie: `authjs.session-token=${token}` };
  };
  const adminCookie = await mkSession(admin.rows[0].id);
  const traineeCookie = await mkSession(trainee.rows[0].id);

  try {
    const expectOk = async (path: string, headers: Record<string, string>) => {
      const response = await fetch(`${BASE}${path}`, { headers });
      if (!response.ok) throw new Error(`${path} → ${response.status}`);
      await response.arrayBuffer();
    };

    // Warm each path once (route compilation in dev), then measure.
    await expectOk(`/api/admin/dashboard/quizzes/${quizId}`, adminCookie.cookie ? adminCookie : {});
    await expectOk(`/api/admin/quizzes`, adminCookie);
    await expectOk(`/api/content`, traineeCookie);
    await expectOk(`/`, traineeCookie);

    console.log(`\nCohort on dashboard quiz: ${COHORT + 1} trainees (${COHORT * 2} finalized attempts)\n`);
    await median(`admin dashboard (per-quiz, ${COHORT + 1} trainees)`, 5, () =>
      expectOk(`/api/admin/dashboard/quizzes/${quizId}`, adminCookie),
    );
    await median("admin quiz catalog", 5, () => expectOk("/api/admin/quizzes", adminCookie));
    await median("trainee content API (batched sector read)", 5, () => expectOk("/api/content", traineeCookie));
    await median("trainee home page (SSR sector tree)", 5, () => expectOk("/", traineeCookie));
  } finally {
    console.log("\nCleaning throwaway rows ...");
    await db.query(`DELETE FROM attempts WHERE id LIKE 'perf-a-%'`);
    await db.query(`DELETE FROM users WHERE id LIKE 'perf-u-%'`);
    await db.query(`DELETE FROM sessions WHERE id LIKE 'perf-s-%'`);
    await db.end();
  }
  console.log("PERF SANITY DONE");
}

main().catch((error) => {
  console.error("PERF SANITY CRASHED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
