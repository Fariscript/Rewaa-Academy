import type { Session } from "next-auth";
import type { SkillType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { getAllowedAttempts } from "@/lib/admin/attempt-override";
import { syncExpiry } from "@/lib/quiz/attempt-lifecycle";
import { computeQuizOutcome, type QuizOutcome } from "@/lib/quiz/outcome";
import { getMySectorContent } from "./taxonomy";

export interface LearningHomeQuiz {
  quizId: string;
  title: string;
  // Shown before starting (NFR-12): the trainee should know the timer
  // length before tapping Start.
  timeLimitSeconds: number;
  // T-7: computed on read — the lesson has a completion row for this
  // trainee. Single-lesson unlock only; sector-wide sequential ordering is
  // open item #3b (see src/lib/content/quiz-unlock.ts).
  unlocked: boolean;
  outcome: QuizOutcome;
  // Set when an attempt is currently open, so the UI can offer "resume"
  // instead of a Start button (T-33: starting is always an explicit act).
  inProgressAttemptId: string | null;
}

export interface LearningHomeLesson {
  lessonId: string;
  title: string;
  completed: boolean;
  quiz: LearningHomeQuiz | null;
}

export interface LearningHomeUnit {
  unitId: string;
  name: string;
  skillType: SkillType;
  lessons: LearningHomeLesson[];
}

export interface LearningHomeSubSector {
  subSectorId: string;
  name: string;
  units: LearningHomeUnit[];
}

export interface LearningHome {
  sector: { id: string; name: string };
  subSectors: LearningHomeSubSector[];
}

// Everything the trainee home page renders, in one sector-scoped read:
// the FR-13 content tree + per-lesson completion + per-quiz unlock state
// and outcome. Returns null when no sector is assigned yet (FR-07).
// Batched — one query each for quizzes, completions, attempts, and cap
// overrides across the whole sector, with syncExpiry (T-32 lazy expiry)
// run only on attempts that are actually IN_PROGRESS.
export async function getMyLearningHome(session: Session | null): Promise<LearningHome | null> {
  if (!session?.user) throw new UnauthenticatedError();

  const sector = await getMySectorContent(session);
  if (!sector) return null;

  const lessonIds = sector.subSectors.flatMap((s) => s.units.flatMap((u) => u.lessons.map((l) => l.id)));

  const [quizzes, completions] = await Promise.all([
    prisma.quiz.findMany({ where: { lessonId: { in: lessonIds } } }),
    prisma.lessonCompletion.findMany({ where: { userId: session.user.id, lessonId: { in: lessonIds } } }),
  ]);
  const quizIds = quizzes.map((q) => q.id);

  const [attempts, overrides] = await Promise.all([
    prisma.attempt.findMany({ where: { userId: session.user.id, quizId: { in: quizIds } } }),
    prisma.attemptCapOverride.findMany({ where: { userId: session.user.id, quizId: { in: quizIds } } }),
  ]);

  const synced = await Promise.all(
    attempts.map((a) => (a.status === "IN_PROGRESS" ? syncExpiry(a.id) : Promise.resolve(a))),
  );

  const completedLessonIds = new Set(completions.map((c) => c.lessonId));
  const quizByLessonId = new Map(quizzes.map((q) => [q.lessonId, q]));
  const extraAttemptsByQuizId = new Map<string, number>();
  for (const grant of overrides) {
    extraAttemptsByQuizId.set(grant.quizId, (extraAttemptsByQuizId.get(grant.quizId) ?? 0) + grant.extraAttempts);
  }

  const toQuizView = (lessonId: string): LearningHomeQuiz | null => {
    const quiz = quizByLessonId.get(lessonId);
    if (!quiz) return null;
    const quizAttempts = synced.filter((a) => a.quizId === quiz.id);
    const outcome = computeQuizOutcome(quizAttempts, 2 + (extraAttemptsByQuizId.get(quiz.id) ?? 0));
    return {
      quizId: quiz.id,
      title: quiz.title,
      timeLimitSeconds: quiz.timeLimitSeconds,
      unlocked: completedLessonIds.has(lessonId),
      outcome,
      inProgressAttemptId: quizAttempts.find((a) => a.status === "IN_PROGRESS")?.id ?? null,
    };
  };

  return {
    sector: { id: sector.id, name: sector.name },
    subSectors: sector.subSectors.map((subSector) => ({
      subSectorId: subSector.id,
      name: subSector.name,
      units: subSector.units.map((unit) => ({
        unitId: unit.id,
        name: unit.name,
        skillType: unit.skillType,
        lessons: unit.lessons.map((lesson) => ({
          lessonId: lesson.id,
          title: lesson.title,
          completed: completedLessonIds.has(lesson.id),
          quiz: toQuizView(lesson.id),
        })),
      })),
    })),
  };
}

export interface TraineeLessonView {
  lessonId: string;
  title: string;
  unitName: string;
  subSectorName: string;
  completed: boolean;
  quiz: LearningHomeQuiz | null;
}

// One lesson for the lesson page, with the same sector scoping as every
// other trainee read (NFR-02) and the same quiz/outcome view as the home.
export async function getMyLesson(session: Session | null, lessonId: string): Promise<TraineeLessonView> {
  if (!session?.user) throw new UnauthenticatedError();

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { unit: { include: { subSector: true } }, quiz: true },
  });
  if (!lesson) throw new NotFoundError("Lesson not found");

  const caller = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { sectorId: true },
  });
  if (!caller.sectorId || caller.sectorId !== lesson.unit.subSector.sectorId) {
    throw new ForbiddenError("Lesson is outside your assigned sector");
  }

  const completion = await prisma.lessonCompletion.findUnique({
    where: { userId_lessonId: { userId: session.user.id, lessonId } },
  });

  let quiz: LearningHomeQuiz | null = null;
  if (lesson.quiz) {
    const attempts = await prisma.attempt.findMany({
      where: { userId: session.user.id, quizId: lesson.quiz.id },
    });
    const synced = await Promise.all(
      attempts.map((a) => (a.status === "IN_PROGRESS" ? syncExpiry(a.id) : Promise.resolve(a))),
    );
    const attemptsAllowed = await getAllowedAttempts(session.user.id, lesson.quiz.id);
    quiz = {
      quizId: lesson.quiz.id,
      title: lesson.quiz.title,
      timeLimitSeconds: lesson.quiz.timeLimitSeconds,
      unlocked: completion !== null,
      outcome: computeQuizOutcome(synced, attemptsAllowed),
      inProgressAttemptId: synced.find((a) => a.status === "IN_PROGRESS")?.id ?? null,
    };
  }

  return {
    lessonId: lesson.id,
    title: lesson.title,
    unitName: lesson.unit.name,
    subSectorName: lesson.unit.subSector.name,
    completed: completion !== null,
    quiz,
  };
}
