import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { markLessonComplete } from "@/lib/content/lesson-completion";
import { startAttempt } from "@/lib/quiz/start-attempt";
import { saveAnswers } from "@/lib/quiz/save-answers";
import { submitAttempt } from "@/lib/quiz/submit-attempt";
import { getCertificateStatus, issueOrGetCertificate } from "./certificate";
import { verifyCertificateSignature } from "./signing";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

async function passQuizForLesson(session: Session, lessonTitle: string) {
  const lesson = await prisma.lesson.findFirstOrThrow({ where: { title: lessonTitle } });
  await markLessonComplete(session, lesson.id);
  const quiz = await prisma.quiz.findUniqueOrThrow({ where: { lessonId: lesson.id } });
  const attempt = await startAttempt(session, quiz.id);
  const answers = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
  // Seed fixture correctOptions vary by lesson — MCQ is always "a"; the
  // TRUE_FALSE statements for both these lessons are false statements, so
  // "false" is the correct answer for both.
  await saveAnswers(session, attempt.id, [
    { questionId: answers.find((a) => a.questionType === "MCQ")!.questionId!, selectedOption: "a" },
    { questionId: answers.find((a) => a.questionType === "TRUE_FALSE")!.questionId!, selectedOption: "false" },
  ]);
  return submitAttempt(session, attempt.id);
}

describe("getCertificateStatus / issueOrGetCertificate (T-4, T-28, NFR-18)", () => {
  let trainee: { id: string };
  let sectorId: string;
  let expectedTotalQuizzes: number;
  let session: Session;
  const email = "cert-trainee@example.com";

  beforeAll(async () => {
    const sector = await prisma.sector.findUniqueOrThrow({ where: { name: "الخدمات" } });
    sectorId = sector.id;
    trainee = await prisma.user.upsert({
      where: { email },
      update: { sectorId, role: "TRAINEE" },
      create: { email, name: "Certificate Test Trainee", role: "TRAINEE", sectorId },
    });
    session = sessionFor(trainee.id, "TRAINEE");

    expectedTotalQuizzes = await prisma.quiz.count({
      where: { lesson: { unit: { subSector: { sectorId } } } },
    });
  });

  afterAll(async () => {
    await prisma.certificate.deleteMany({ where: { userId: trainee.id } });
    await prisma.attempt.deleteMany({ where: { userId: trainee.id } });
    await prisma.lessonCompletion.deleteMany({ where: { userId: trainee.id } });
    await prisma.user.delete({ where: { id: trainee.id } });
  });

  it("rejects unauthenticated callers for both status and issuance", async () => {
    await expect(getCertificateStatus(null)).rejects.toThrow(UnauthenticatedError);
    await expect(issueOrGetCertificate(null)).rejects.toThrow(UnauthenticatedError);
  });

  it("reports not eligible, and refuses to issue, before any quiz is passed", async () => {
    const status = await getCertificateStatus(session);
    expect(status.eligible).toBe(false);
    expect(status.totalQuizzes).toBe(expectedTotalQuizzes);
    expect(status.passedQuizzes).toBe(0);
    expect(status.certificate).toBeNull();

    await expect(issueOrGetCertificate(session)).rejects.toThrow(ForbiddenError);
  });

  it("stays not eligible after passing only some of the required quizzes", async () => {
    await passQuizForLesson(session, "استقبال العميل");
    const status = await getCertificateStatus(session);
    expect(status.eligible).toBe(false);
    expect(status.passedQuizzes).toBe(1);
  });

  it("becomes eligible and issues a signed certificate once every quiz is passed, idempotently", async () => {
    await passQuizForLesson(session, "حساب التكلفة");

    const status = await getCertificateStatus(session);
    expect(status.eligible).toBe(true);
    expect(status.passedQuizzes).toBe(expectedTotalQuizzes);

    const certificate = await issueOrGetCertificate(session);
    expect(certificate.userId).toBe(trainee.id);
    expect(certificate.sectorId).toBe(sectorId);
    expect(certificate.traineeName).toBe("Certificate Test Trainee"); // T-28
    expect(certificate.signature).toBeTruthy();

    const valid = verifyCertificateSignature(
      {
        id: certificate.id,
        userId: certificate.userId,
        sectorId: certificate.sectorId,
        traineeName: certificate.traineeName,
        completionDate: certificate.completionDate,
        issuedAt: certificate.issuedAt,
      },
      certificate.signature,
    );
    expect(valid).toBe(true);

    // Idempotent: re-checking / re-issuing returns the SAME row.
    const statusAfter = await getCertificateStatus(session);
    expect(statusAfter.certificate?.id).toBe(certificate.id);
    const reissued = await issueOrGetCertificate(session);
    expect(reissued.id).toBe(certificate.id);

    const count = await prisma.certificate.count({ where: { userId: trainee.id, sectorId } });
    expect(count).toBe(1);
  });
});
