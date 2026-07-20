import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit/log";
import { validateQuestionContent, type QuestionContentInput } from "./validate-content";

// T-13: manually-authored questions start DRAFT too — no bypass for manual
// authorship by an Admin (CLAUDE.md "Slice 5 decisions"), same as AI-drafted.
export async function createQuestion(session: Session | null, quizId: string, input: QuestionContentInput) {
  requireRole(session, ["ADMIN"]);

  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw new NotFoundError("Quiz not found");

  const result = validateQuestionContent(input);
  if (!result.ok) throw new ForbiddenError(`Invalid question content: ${result.reason}`);

  return prisma.question.create({
    data: {
      quizId,
      type: result.value.type,
      prompt: result.value.prompt,
      options: result.value.options,
      correctOption: result.value.correctOption,
      source: "MANUAL",
      status: "DRAFT",
      createdById: session.user.id,
    },
  });
}

// T-15/NFR-13: archives the pre-edit content as a QuestionRevision, then
// applies the new content and resets status to DRAFT — an edit to an
// already-approved question re-clears the same gate as a fresh draft
// (CLAUDE.md "Slice 5 decisions"). Only DRAFT/APPROVED questions are
// editable; RETIRED/REJECTED are terminal.
export async function editQuestion(session: Session | null, questionId: string, input: QuestionContentInput) {
  requireRole(session, ["ADMIN"]);

  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) throw new NotFoundError("Question not found");
  if (question.status === "RETIRED" || question.status === "REJECTED") {
    throw new ForbiddenError(`Cannot edit a question with status ${question.status}`);
  }

  const result = validateQuestionContent(input);
  if (!result.ok) throw new ForbiddenError(`Invalid question content: ${result.reason}`);

  return prisma.$transaction(async (tx) => {
    await tx.questionRevision.create({
      data: {
        questionId,
        type: question.type,
        prompt: question.prompt,
        options: question.options as object,
        correctOption: question.correctOption,
        status: question.status,
        editedById: session.user.id,
      },
    });

    return tx.question.update({
      where: { id: questionId },
      data: {
        type: result.value.type,
        prompt: result.value.prompt,
        options: result.value.options,
        correctOption: result.value.correctOption,
        status: "DRAFT",
        approvedById: null,
        approvedAt: null,
      },
    });
  });
}

// T-13: retire — withdraws a question that was DRAFT or APPROVED. Distinct
// from reject (which only applies to a DRAFT that never went live).
// Historical attempts are unaffected either way (NFR-13's snapshot design).
export async function retireQuestion(session: Session | null, questionId: string) {
  requireRole(session, ["ADMIN"]);

  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) throw new NotFoundError("Question not found");
  if (question.status === "RETIRED" || question.status === "REJECTED") {
    throw new ForbiddenError(`Cannot retire a question with status ${question.status}`);
  }

  const updated = await prisma.question.update({
    where: { id: questionId },
    data: { status: "RETIRED" },
  });

  await recordAudit(session.user.id, "question_retired", "Question", questionId, {
    quizId: question.quizId,
  });

  return updated;
}
