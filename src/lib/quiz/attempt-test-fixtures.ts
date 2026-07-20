import { prisma } from "@/lib/prisma";

// Test-only helper: each quiz-engine test file gets its own throwaway
// lesson/quiz/questions under the shared الخدمات fixture sector, so the
// 2-attempt cap in one test file can never collide with another file's
// attempts against the same quiz (vitest runs test files concurrently).
export async function createEphemeralQuiz(lessonTitle: string, timeLimitSeconds = 600) {
  const unit = await prisma.unit.findFirstOrThrow({ where: { name: "أول مكالمة" } });
  const lesson = await prisma.lesson.create({ data: { title: lessonTitle, unitId: unit.id } });
  const quiz = await prisma.quiz.create({
    data: { lessonId: lesson.id, title: `اختبار: ${lessonTitle}`, timeLimitSeconds },
  });
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
      },
    ],
  });
  return { lesson, quiz };
}

// Deleting the lesson cascades through quiz -> questions and
// lessonCompletions -> attempts -> attemptAnswers.
export async function deleteEphemeralQuiz(lessonId: string) {
  await prisma.lesson.delete({ where: { id: lessonId } }).catch(() => {});
}
