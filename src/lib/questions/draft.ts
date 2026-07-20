import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { AiProviderError, NotFoundError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit/log";
import { anthropicDrafter, type AiQuestionDrafter, type DraftedQuestionCandidate } from "@/lib/ai/drafter";
import type { Question, QuestionType } from "@/generated/prisma/client";

const SUPPORTED_TYPES: QuestionType[] = ["MCQ", "TRUE_FALSE"];

interface ValidCandidate {
  type: QuestionType;
  prompt: string;
  options: { id: string; text: string }[];
  correctOption: string;
}

interface RejectedCandidate {
  input: unknown;
  reason: string;
}

export interface DraftQuestionsResult {
  created: Question[];
  rejected: RejectedCandidate[];
}

// CLAUDE.md "Slice 5 decisions": validated before persisting, not after —
// a malformed candidate is never written to the DB at all.
function validateCandidate(candidate: DraftedQuestionCandidate): { ok: true; value: ValidCandidate } | { ok: false; reason: string } {
  const { type, prompt, options, correctOption } = candidate;

  if (typeof type !== "string" || !SUPPORTED_TYPES.includes(type as QuestionType)) {
    return { ok: false, reason: `unsupported question type: ${String(type)}` };
  }
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return { ok: false, reason: "empty or missing prompt" };
  }
  if (!Array.isArray(options) || options.length === 0) {
    return { ok: false, reason: "empty or missing options" };
  }
  for (const option of options) {
    if (
      typeof option !== "object" ||
      option === null ||
      typeof (option as Record<string, unknown>).id !== "string" ||
      ((option as Record<string, unknown>).id as string).trim().length === 0 ||
      typeof (option as Record<string, unknown>).text !== "string" ||
      ((option as Record<string, unknown>).text as string).trim().length === 0
    ) {
      return { ok: false, reason: "an option is missing a non-empty id or text" };
    }
  }
  if (typeof correctOption !== "string" || correctOption.trim().length === 0) {
    return { ok: false, reason: "empty or missing correctOption" };
  }
  const optionIds = (options as { id: string; text: string }[]).map((o) => o.id);
  if (!optionIds.includes(correctOption)) {
    return { ok: false, reason: "correctOption does not match any option id" };
  }

  return {
    ok: true,
    value: {
      type: type as QuestionType,
      prompt: prompt.trim(),
      options: options as { id: string; text: string }[],
      correctOption,
    },
  };
}

// T-10/T-11/T-12/NFR-06: AI drafts candidates; every created row lands as
// DRAFT/AI_DRAFT — no code path here creates one pre-approved. Partial
// success, not all-or-nothing (CLAUDE.md "Slice 5 decisions"): malformed
// candidates are skipped and never persisted; a provider failure (timeout,
// rate-limit, unparseable response) surfaces as AiProviderError and creates
// zero rows.
export async function draftQuestions(
  session: Session | null,
  quizId: string,
  count: number,
  drafter: AiQuestionDrafter = anthropicDrafter,
): Promise<DraftQuestionsResult> {
  requireRole(session, ["ADMIN"]);

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: {
      lesson: { select: { title: true, unit: { select: { name: true, skillType: true } } } },
    },
  });
  if (!quiz) throw new NotFoundError("Quiz not found");

  let candidates: DraftedQuestionCandidate[];
  try {
    candidates = await drafter({
      lessonTitle: quiz.lesson.title,
      unitName: quiz.lesson.unit.name,
      skillType: quiz.lesson.unit.skillType,
      count,
    });
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    throw new AiProviderError(
      `AI provider request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const created: Question[] = [];
  const rejected: RejectedCandidate[] = [];

  for (const candidate of candidates) {
    const result = validateCandidate(candidate);
    if (!result.ok) {
      rejected.push({ input: candidate, reason: result.reason });
      continue;
    }
    const question = await prisma.question.create({
      data: {
        quizId,
        type: result.value.type,
        prompt: result.value.prompt,
        options: result.value.options,
        correctOption: result.value.correctOption,
        source: "AI_DRAFT",
        status: "DRAFT",
        createdById: session.user.id,
      },
    });
    created.push(question);
  }

  if (rejected.length > 0) {
    // TODO: surface these in the question-bank UI once it exists (a later
    // slice). For now this AuditLog entry is the only durable record of
    // what the AI drafted but couldn't be used, and why — there's no
    // question-bank dashboard yet for a human to see it live.
    await recordAudit(session.user.id, "ai_draft_rejected", "Quiz", quizId, {
      countRequested: count,
      countCreated: created.length,
      rejected: rejected as unknown as object,
    });
  }

  return { created, rejected };
}
