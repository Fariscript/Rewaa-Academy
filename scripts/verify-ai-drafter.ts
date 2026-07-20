// Manual live-verification script for slice 5b (CLAUDE.md "Blocked" section)
// — not run by the test suite or CI, deliberately, since it needs a real
// ANTHROPIC_API_KEY and writes real rows to your local dev database.
//
// Not reachable in any production build: it lives outside src/app, nothing
// under src/app imports it, and Next.js only bundles files actually
// imported from the app's route tree — confirmed by grepping .next/server
// after a build (only .next/cache/.tsbuildinfo, a TS incremental-compile
// artifact, ever references this file — never the served output).
//
// Run from the Academy project root, with a real key:
//   ANTHROPIC_API_KEY=sk-ant-... \
//   DATABASE_URL="postgresql://engineer@localhost:5432/rewaa_academy_dev?schema=public" \
//   npx tsx scripts/verify-ai-drafter.ts
//
// DATABASE_URL is passed explicitly rather than relying on .env auto-load —
// tsx doesn't load it the way `prisma db seed` does.
//
// Exercises the FULL path end to end, not just the raw API call:
//   real Anthropic call -> JSON-array parsing (inside anthropicDrafter)
//   -> per-candidate validation (inside draftQuestions)
//   -> partial-success DB writes (valid ones persisted as DRAFT/AI_DRAFT)
//   -> AuditLog entry if anything gets rejected
import { prisma } from "@/lib/prisma";
import { draftQuestions } from "@/lib/questions/draft";
import type { Session } from "next-auth";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set explicitly — see the run instructions in this file's header.");
}

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
  const lesson = await prisma.lesson.findFirstOrThrow({ where: { title: "استقبال العميل" } });
  const quiz = await prisma.quiz.findUniqueOrThrow({ where: { lessonId: lesson.id } });

  const session: Session = {
    user: { id: admin.id, role: "ADMIN", email: admin.email, name: admin.name },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };

  const before = await prisma.question.count({ where: { quizId: quiz.id } });
  const result = await draftQuestions(session, quiz.id, 3);
  const after = await prisma.question.count({ where: { quizId: quiz.id } });

  console.log(`Requested 3, got ${result.created.length} created, ${result.rejected.length} rejected.`);
  console.log(`Question rows for this quiz: ${before} -> ${after} (should equal ${before} + created.length).`);
  console.log("\nCreated (persisted as DRAFT/AI_DRAFT):");
  console.log(JSON.stringify(result.created, null, 2));

  if (result.rejected.length > 0) {
    console.log("\nRejected (validated and skipped, never persisted):");
    console.log(JSON.stringify(result.rejected, null, 2));
    const audit = await prisma.auditLog.findFirst({
      where: { action: "ai_draft_rejected", targetId: quiz.id },
      orderBy: { createdAt: "desc" },
    });
    console.log("\nAuditLog entry for the rejections:");
    console.log(JSON.stringify(audit, null, 2));
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
