import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Test-only helper: each quiz-engine test file gets its own throwaway
// subSector/unit/lesson/quiz/questions under the shared الخدمات fixture
// sector, so the 2-attempt cap in one test file can never collide with
// another file's attempts against the same quiz (vitest runs test files
// concurrently). Each call gets its OWN unit (not a shared one) — this
// matters beyond attempt isolation since open item #1's chain-ordering
// unlock check (CLAUDE.md, RESOLVED 2026-07-22) treats sibling lessons
// within the same Unit as a prerequisite chain; sharing one unit across
// every test file would make concurrently-created ephemeral lessons
// accidentally block each other. The unit keeps the name "أول مكالمة"
// (several tests assert on that exact string) — it's just no longer THE
// one shared seeded unit, each call gets a same-named unit of its own
// under a freshly created subSector.
async function createEphemeralUnit() {
  const sector = await prisma.sector.findFirstOrThrow({ where: { name: "الخدمات" } });
  const subSector = await prisma.subSector.create({
    data: { name: `فرع اختبار ${randomUUID()}`, sectorId: sector.id },
  });
  return prisma.unit.create({
    data: { name: "أول مكالمة", skillType: "SOFT", subSectorId: subSector.id },
  });
}

async function createLessonQuizPair(
  unitId: string,
  lessonTitle: string,
  timeLimitSeconds: number,
  adminId: string,
) {
  const lesson = await prisma.lesson.create({ data: { title: lessonTitle, unitId } });
  const quiz = await prisma.quiz.create({
    data: { lessonId: lesson.id, title: `اختبار: ${lessonTitle}`, timeLimitSeconds },
  });
  // APPROVED: slice 4's attempt-lifecycle tests need real usable content —
  // start-attempt.ts (slice 5e) only ever serves APPROVED questions.
  await prisma.question.createMany({
    data: [
      {
        quizId: quiz.id,
        type: "MCQ",
        prompt: "سؤال تجريبي (اختيار من متعدد)",
        options: [
          { id: "a", text: "الإجابة الصحيحة" },
          { id: "b", text: "إجابة خاطئة" },
        ],
        correctOption: "a",
        status: "APPROVED",
        approvedById: adminId,
        approvedAt: new Date(),
      },
      {
        quizId: quiz.id,
        type: "TRUE_FALSE",
        prompt: "سؤال تجريبي (صح أو خطأ)",
        options: [
          { id: "true", text: "صحيح" },
          { id: "false", text: "خطأ" },
        ],
        correctOption: "true",
        status: "APPROVED",
        approvedById: adminId,
        approvedAt: new Date(),
      },
    ],
  });
  return { lesson, quiz };
}

export async function createEphemeralQuiz(lessonTitle: string, timeLimitSeconds = 600) {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
  const unit = await createEphemeralUnit();
  return createLessonQuizPair(unit.id, lessonTitle, timeLimitSeconds, admin.id);
}

// Open item #1 chain-ordering (CLAUDE.md, RESOLVED 2026-07-22): several
// lessons, each with its own quiz, created IN ORDER within one shared
// ephemeral unit — createdAt ordering within a unit is the chain sequence
// isQuizUnlocked now enforces (a real ordering field is Ibrahim's
// content-model territory, not modeled here yet — see CLAUDE.md's
// "Handoff to Ibrahim's track"). Returns the pairs in creation order;
// clean up with deleteEphemeralQuiz(pairs[0].lesson.id) — any lesson in
// the chain works, since they all share one subSector.
export async function createEphemeralChain(lessonTitles: string[], timeLimitSeconds = 600) {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
  const unit = await createEphemeralUnit();
  const pairs: Awaited<ReturnType<typeof createLessonQuizPair>>[] = [];
  for (const title of lessonTitles) {
    // Sequential, not Promise.all: createdAt ordering IS the chain order.
    pairs.push(await createLessonQuizPair(unit.id, title, timeLimitSeconds, admin.id));
  }
  return { unit, pairs };
}

// Deleting the lesson's unit's subSector cascades through unit -> lesson
// -> quiz -> questions and lesson -> lessonCompletions -> attempts ->
// attemptAnswers, cleaning up everything createEphemeralQuiz or
// createEphemeralChain created (each call gets its own subSector).
export async function deleteEphemeralQuiz(lessonId: string) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { unitId: true } });
  if (!lesson) return;
  const unit = await prisma.unit.findUnique({ where: { id: lesson.unitId }, select: { subSectorId: true } });
  if (!unit) return;
  await prisma.subSector.delete({ where: { id: unit.subSectorId } }).catch(() => {});
}
