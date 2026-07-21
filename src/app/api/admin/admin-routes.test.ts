import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { markLessonComplete } from "@/lib/content/lesson-completion";
import { startAttempt } from "@/lib/quiz/start-attempt";
import { saveAnswers } from "@/lib/quiz/save-answers";
import { submitAttempt } from "@/lib/quiz/submit-attempt";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "@/lib/quiz/attempt-test-fixtures";
import { auth } from "@/auth";
import { GET as listQuizzesRoute } from "./quizzes/route";
import { POST as grantOverrideRoute } from "./attempt-overrides/route";
import { GET as pendingGradingRoute } from "./grading/pending/route";

// Role-gate and validation behavior at the actual route boundary — the
// admin counterpart of src/app/api/attempts/attempt-routes.test.ts.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
const authMock = auth as unknown as Mock<() => Promise<Session | null>>;

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

function overrideRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/attempt-overrides", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin route handlers: role gates, validation, and happy paths", () => {
  let trainee: { id: string };
  let admin: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let adminSession: Session;
  let traineeSession: Session;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    adminSession = sessionFor(admin.id, "ADMIN");
    traineeSession = sessionFor(trainee.id, "TRAINEE");
    const fixture = await createEphemeralQuiz("سؤال 17: مسارات الإدارة", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
    vi.restoreAllMocks();
  });

  it("GET /api/admin/quizzes: 401 unauthenticated, 403 trainee, 200 catalog for admin", async () => {
    authMock.mockResolvedValue(null);
    expect((await listQuizzesRoute()).status).toBe(401);

    authMock.mockResolvedValue(traineeSession);
    expect((await listQuizzesRoute()).status).toBe(403);

    authMock.mockResolvedValue(adminSession);
    const response = await listQuizzesRoute();
    expect(response.status).toBe(200);
    const body = await response.json();
    const row = body.quizzes.find((q: { quizId: string }) => q.quizId === quiz.id);
    expect(row).toBeDefined();
    expect(row.approvedQuestionCount).toBe(2);
    expect(row.sector.name).toBe("الخدمات");
  });

  it("GET /api/admin/grading/pending: 403 for a trainee", async () => {
    authMock.mockResolvedValue(traineeSession);
    expect((await pendingGradingRoute()).status).toBe(403);
  });

  it("POST /api/admin/attempt-overrides: 400 on missing fields, 403 for a trainee caller", async () => {
    authMock.mockResolvedValue(adminSession);
    expect((await grantOverrideRoute(overrideRequest({ quizId: quiz.id, reason: "سبب" }))).status).toBe(400);
    expect((await grantOverrideRoute(overrideRequest({ traineeId: trainee.id, quizId: quiz.id }))).status).toBe(400);
    expect(
      (await grantOverrideRoute(overrideRequest({ traineeId: trainee.id, quizId: quiz.id, reason: "  " }))).status,
    ).toBe(400);

    authMock.mockResolvedValue(traineeSession);
    expect(
      (await grantOverrideRoute(overrideRequest({ traineeId: trainee.id, quizId: quiz.id, reason: "سبب" }))).status,
    ).toBe(403);
  });

  it("POST /api/admin/attempt-overrides: grants attempt 3 to a both-failed trainee end-to-end", async () => {
    // Exhaust both attempts with failing scores, through the real lib flow.
    await markLessonComplete(traineeSession, lesson.id);
    for (let n = 0; n < 2; n++) {
      const attempt = await startAttempt(traineeSession, quiz.id);
      const rows = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
      const mcq = rows.find((r) => r.questionType === "MCQ")!;
      await saveAnswers(traineeSession, attempt.id, [{ questionId: mcq.questionId!, selectedOption: "b" }]);
      await submitAttempt(traineeSession, attempt.id);
    }
    await expect(startAttempt(traineeSession, quiz.id)).rejects.toThrow("Maximum attempts reached");

    authMock.mockResolvedValue(adminSession);
    const response = await grantOverrideRoute(
      overrideRequest({ traineeId: trainee.id, quizId: quiz.id, reason: "أداء قريب من النجاح" }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).allowedAttempts).toBe(3);

    const attempt3 = await startAttempt(traineeSession, quiz.id);
    expect(attempt3.attemptNumber).toBe(3);
  });
});
