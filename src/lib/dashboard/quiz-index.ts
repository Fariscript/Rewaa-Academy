import type { Session } from "next-auth";
import type { SkillType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";

export interface AdminQuizIndexRow {
  quizId: string;
  quizTitle: string;
  lessonTitle: string;
  timeLimitSeconds: number;
  sector: { id: string; name: string };
  subSectorName: string;
  unitName: string;
  skillType: SkillType;
  approvedQuestionCount: number;
}

// The admin dashboard's entry point: a flat catalog of every quiz so the
// per-quiz dashboard (T-21/T-22/T-23) has something to enumerate from.
// Deliberately no aggregates here — CLAUDE.md keeps the Phase 1 dashboard
// basic on purpose; per-quiz numbers load on selection, trends are T-24
// (Phase 2).
export async function listQuizzesForAdmin(session: Session | null): Promise<AdminQuizIndexRow[]> {
  requireRole(session, ["ADMIN"]);

  const quizzes = await prisma.quiz.findMany({
    include: {
      lesson: { include: { unit: { include: { subSector: { include: { sector: true } } } } } },
      _count: { select: { questions: { where: { status: "APPROVED" } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  return quizzes.map((quiz) => ({
    quizId: quiz.id,
    quizTitle: quiz.title,
    lessonTitle: quiz.lesson.title,
    timeLimitSeconds: quiz.timeLimitSeconds,
    sector: { id: quiz.lesson.unit.subSector.sector.id, name: quiz.lesson.unit.subSector.sector.name },
    subSectorName: quiz.lesson.unit.subSector.name,
    unitName: quiz.lesson.unit.name,
    skillType: quiz.lesson.unit.skillType,
    approvedQuestionCount: quiz._count.questions,
  }));
}
