import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { markLessonComplete } from "@/lib/content/lesson-completion";
import { startAttempt } from "@/lib/quiz/start-attempt";
import { saveAnswers } from "@/lib/quiz/save-answers";
import { submitAttempt } from "@/lib/quiz/submit-attempt";
import { issueOrGetCertificate } from "./certificate";
import { verifyCertificateById } from "./verify";

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
  await saveAnswers(session, attempt.id, [
    { questionId: answers.find((a) => a.questionType === "MCQ")!.questionId!, selectedOption: "a" },
    { questionId: answers.find((a) => a.questionType === "TRUE_FALSE")!.questionId!, selectedOption: "false" },
  ]);
  return submitAttempt(session, attempt.id);
}

describe("verifyCertificateById (public, NFR-18)", () => {
  let trainee: { id: string };
  let session: Session;
  let certificateId: string;
  const email = "cert-verify-trainee@example.com";

  beforeAll(async () => {
    const sector = await prisma.sector.findUniqueOrThrow({ where: { name: "الخدمات" } });
    trainee = await prisma.user.upsert({
      where: { email },
      update: { sectorId: sector.id, role: "TRAINEE" },
      create: { email, name: "Verify Test Trainee", role: "TRAINEE", sectorId: sector.id },
    });
    session = sessionFor(trainee.id, "TRAINEE");

    await passQuizForLesson(session, "استقبال العميل");
    await passQuizForLesson(session, "حساب التكلفة");
    const certificate = await issueOrGetCertificate(session);
    certificateId = certificate.id;
  });

  afterAll(async () => {
    await prisma.certificate.deleteMany({ where: { userId: trainee.id } });
    await prisma.attempt.deleteMany({ where: { userId: trainee.id } });
    await prisma.lessonCompletion.deleteMany({ where: { userId: trainee.id } });
    await prisma.user.delete({ where: { id: trainee.id } });
  });

  it("reports invalid (not found) for an unknown id, without throwing", async () => {
    const result = await verifyCertificateById("does-not-exist");
    expect(result.valid).toBe(false);
    expect(result.traineeName).toBeNull();
  });

  it("reports valid with the trainee/sector/date details for a genuine certificate", async () => {
    const result = await verifyCertificateById(certificateId);
    expect(result.valid).toBe(true);
    expect(result.traineeName).toBe("Verify Test Trainee");
    expect(result.sectorName).toBe("الخدمات");
    expect(result.completionDate).not.toBeNull();
  });

  it("reports invalid if the stored row is tampered with directly", async () => {
    await prisma.certificate.update({ where: { id: certificateId }, data: { traineeName: "اسم مزوّر" } });
    const result = await verifyCertificateById(certificateId);
    expect(result.valid).toBe(false);
    // Restore for the afterAll cleanup / in case of re-run ordering assumptions elsewhere.
    await prisma.certificate.update({ where: { id: certificateId }, data: { traineeName: "Verify Test Trainee" } });
  });
});
