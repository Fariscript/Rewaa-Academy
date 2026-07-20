import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { markLessonComplete } from "@/lib/content/lesson-completion";
import { editQuestion } from "@/lib/questions/manage";
import { startAttempt } from "./start-attempt";
import { saveAnswers } from "./save-answers";
import { submitAttempt } from "./submit-attempt";
import { getAttemptForTrainee } from "./attempt-view";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "./attempt-test-fixtures";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

// NFR-13: editing a question must not retroactively change the scores — or
// the displayed content — of attempts that were already completed. The
// guarantee comes from AttemptAnswer snapshotting question content at
// attempt-start (see prisma/schema.prisma, AttemptAnswer); this is the
// named regression test for it.
describe("NFR-13: question edits do not touch completed attempts", () => {
  let trainee: { id: string };
  let admin: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let session: Session;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    session = sessionFor(trainee.id, "TRAINEE");
    const fixture = await createEphemeralQuiz("سؤال NFR-13: عزل تعديل الأسئلة", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
    await markLessonComplete(session, lesson.id);
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("keeps a finalized attempt's score and snapshot intact after the question is edited", async () => {
    // Trainee passes: both fixture questions answered correctly → 100%.
    const attempt = await startAttempt(session, quiz.id);
    const rows = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
    const mcq = rows.find((r) => r.questionType === "MCQ")!;
    const trueFalse = rows.find((r) => r.questionType === "TRUE_FALSE")!;
    await saveAnswers(session, attempt.id, [
      { questionId: mcq.questionId!, selectedOption: "a" },
      { questionId: trueFalse.questionId!, selectedOption: "true" },
    ]);
    const submitted = await submitAttempt(session, attempt.id);
    expect(submitted.score).toBe(100);
    expect(submitted.passed).toBe(true);

    // Admin then rewrites the MCQ entirely — new prompt, new options, and
    // the correct answer moves from "a" to "b".
    const adminSession = sessionFor(admin.id, "ADMIN");
    await editQuestion(adminSession, mcq.questionId!, {
      type: "MCQ",
      prompt: "سؤال معدل بالكامل بعد التسليم",
      options: [
        { id: "a", text: "أصبحت خاطئة الآن" },
        { id: "b", text: "الإجابة الصحيحة الجديدة" },
      ],
      correctOption: "b",
    });

    // The completed attempt is untouched: same score/outcome...
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.score).toBe(100);
    expect(after.passed).toBe(true);
    expect(after.status).toBe(submitted.status);

    // ...same snapshot the scoring ran against...
    const snapshot = await prisma.attemptAnswer.findFirstOrThrow({
      where: { attemptId: attempt.id, questionId: mcq.questionId },
    });
    expect(snapshot.questionPrompt).toBe(mcq.questionPrompt);
    expect(snapshot.correctOption).toBe("a");
    expect(snapshot.options).toEqual(mcq.options);
    expect(snapshot.isCorrect).toBe(true);

    // ...and the trainee still sees the content they actually answered.
    const view = await getAttemptForTrainee(session, attempt.id);
    const displayed = view.answers.find((a) => a.questionId === mcq.questionId);
    expect(displayed?.questionPrompt).toBe(mcq.questionPrompt);
    expect(displayed?.questionPrompt).not.toBe("سؤال معدل بالكامل بعد التسليم");
  });
});
