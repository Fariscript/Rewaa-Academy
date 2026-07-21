import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { NotFoundError } from "@/lib/errors";

// Admin reads for the question-bank UI (slice 16). Reads only — every
// mutation stays in manage.ts / approve.ts / revisions.ts with its
// audit trail.

export async function listQuizQuestions(session: Session | null, quizId: string) {
  requireRole(session, ["ADMIN"]);

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true,
      title: true,
      lesson: { select: { title: true, unit: { select: { name: true, subSector: { select: { name: true } } } } } },
      questions: {
        orderBy: { createdAt: "asc" },
        include: {
          createdBy: { select: { name: true, email: true } },
          approvedBy: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!quiz) throw new NotFoundError("Quiz not found");
  return quiz;
}

export async function getQuestionForAdmin(session: Session | null, questionId: string) {
  requireRole(session, ["ADMIN"]);

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { quiz: { select: { id: true, title: true } } },
  });
  if (!question) throw new NotFoundError("Question not found");
  return question;
}
