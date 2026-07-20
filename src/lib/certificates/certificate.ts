import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { syncExpiry } from "@/lib/quiz/attempt-lifecycle";
import { computeQuizOutcome } from "@/lib/quiz/outcome";
import { signCertificate } from "./signing";
import type { Certificate } from "@/generated/prisma/client";

async function getRequiredQuizIds(sectorId: string): Promise<string[]> {
  const quizzes = await prisma.quiz.findMany({
    where: { lesson: { unit: { subSector: { sectorId } } } },
    select: { id: true },
  });
  return quizzes.map((q) => q.id);
}

async function getPassingSubmittedAt(userId: string, quizId: string): Promise<Date | null> {
  const attempts = await prisma.attempt.findMany({ where: { userId, quizId } });
  const synced = await Promise.all(attempts.map((a) => syncExpiry(a.id)));
  const outcome = computeQuizOutcome(synced);
  if (outcome.status !== "PASSED") return null;
  const passingDates = synced.filter((a) => a.passed === true && a.submittedAt).map((a) => a.submittedAt as Date);
  return passingDates.length > 0 ? new Date(Math.max(...passingDates.map((d) => d.getTime()))) : null;
}

export interface CertificateStatus {
  eligible: boolean;
  totalQuizzes: number;
  passedQuizzes: number;
  certificate: Certificate | null;
}

// T-4: "all required quizzes in a trainee's sector" — every quiz reachable
// from the trainee's CURRENTLY assigned sector, evaluated fresh each call.
// A sector with zero quizzes is never eligible (nothing to have completed).
export async function getCertificateStatus(session: Session | null): Promise<CertificateStatus> {
  if (!session?.user) throw new UnauthenticatedError();

  const caller = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { sectorId: true },
  });
  if (!caller.sectorId) {
    return { eligible: false, totalQuizzes: 0, passedQuizzes: 0, certificate: null };
  }

  const existing = await prisma.certificate.findUnique({
    where: { userId_sectorId: { userId: session.user.id, sectorId: caller.sectorId } },
  });
  if (existing) {
    return { eligible: true, totalQuizzes: 0, passedQuizzes: 0, certificate: existing };
  }

  const quizIds = await getRequiredQuizIds(caller.sectorId);
  let passedCount = 0;
  for (const quizId of quizIds) {
    if (await getPassingSubmittedAt(session.user.id, quizId)) passedCount++;
  }

  return {
    eligible: quizIds.length > 0 && passedCount === quizIds.length,
    totalQuizzes: quizIds.length,
    passedQuizzes: passedCount,
    certificate: null,
  };
}

// T-4/T-28: "auto-generates" is implemented the same way T-32's auto-submit
// is (no background scheduler) — computed lazily on access rather than
// eagerly triggered the moment the last quiz is passed. The trainee still
// does nothing beyond visiting the endpoint; there's no manual request-a-
// certificate step for them or an Admin to perform.
//
// Idempotent: once issued, returns the existing row. A Certificate is a
// point-in-time achievement record — re-checking eligibility later (e.g.
// after a sector reassignment, open item #2) never mutates or reissues it.
export async function issueOrGetCertificate(session: Session | null): Promise<Certificate> {
  if (!session?.user) throw new UnauthenticatedError();

  const caller = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { sectorId: true, name: true, email: true },
  });
  if (!caller.sectorId) throw new ForbiddenError("No sector assigned");

  const existing = await prisma.certificate.findUnique({
    where: { userId_sectorId: { userId: session.user.id, sectorId: caller.sectorId } },
  });
  if (existing) return existing;

  const quizIds = await getRequiredQuizIds(caller.sectorId);
  if (quizIds.length === 0) throw new ForbiddenError("No quizzes in your sector yet");

  let completionDate: Date | null = null;
  for (const quizId of quizIds) {
    const passedAt = await getPassingSubmittedAt(session.user.id, quizId);
    if (!passedAt) throw new ForbiddenError("Not all required quizzes are passed yet");
    if (!completionDate || passedAt > completionDate) completionDate = passedAt;
  }
  // quizIds.length > 0 and every iteration above either threw or set
  // completionDate, so this is always set by the time we get here.
  const finalCompletionDate = completionDate as Date;

  const traineeName = caller.name ?? caller.email; // T-28: sourced from the SSO identity profile (User.name, set at login)

  return prisma.$transaction(async (tx) => {
    const created = await tx.certificate.create({
      data: {
        userId: session.user.id,
        sectorId: caller.sectorId as string,
        traineeName,
        completionDate: finalCompletionDate,
        signature: "", // placeholder — the signature covers the row's own id, so it's computed after creation
      },
    });

    const signature = signCertificate({
      id: created.id,
      userId: created.userId,
      sectorId: created.sectorId,
      traineeName: created.traineeName,
      completionDate: created.completionDate,
      issuedAt: created.issuedAt,
    });

    return tx.certificate.update({ where: { id: created.id }, data: { signature } });
  });
}

export async function getCertificateById(certificateId: string): Promise<Certificate> {
  const certificate = await prisma.certificate.findUnique({ where: { id: certificateId } });
  if (!certificate) throw new NotFoundError("Certificate not found");
  return certificate;
}
