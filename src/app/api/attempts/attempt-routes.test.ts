import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { markLessonComplete } from "@/lib/content/lesson-completion";
import { startAttempt } from "@/lib/quiz/start-attempt";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "@/lib/quiz/attempt-test-fixtures";
import { auth } from "@/auth";
import { GET as getAttemptRoute } from "./[id]/route";
import { PATCH as patchAnswersRoute } from "./[id]/answers/route";
import { POST as submitRoute } from "./[id]/submit/route";

// The redaction boundary is the ROUTE serialization, not just the lib
// mapper — these tests invoke the actual Next.js handlers (with auth()
// mocked) and assert on the JSON they would ship to a client. This is the
// test that goes red if a future route change serializes raw AttemptAnswer
// rows again (the slice-9 bug).
vi.mock("@/auth", () => ({ auth: vi.fn() }));
// NextAuth's `auth` is overloaded (middleware + session getter); pin the
// mock to the session-getter shape the route handlers actually use.
const authMock = auth as unknown as Mock<() => Promise<Session | null>>;

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("attempt route handlers: auth mapping + answer-key redaction at the JSON boundary", () => {
  let trainee: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let session: Session;
  let attemptId: string;
  let mcqQuestionId: string;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    session = sessionFor(trainee.id, "TRAINEE");
    const fixture = await createEphemeralQuiz("سؤال 16: مسارات المحاولة", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
    await markLessonComplete(session, lesson.id);
    const attempt = await startAttempt(session, quiz.id);
    attemptId = attempt.id;
    const rows = await prisma.attemptAnswer.findMany({ where: { attemptId } });
    mcqQuestionId = rows.find((r) => r.questionType === "MCQ")!.questionId!;
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
    vi.restoreAllMocks();
  });

  it("maps auth failures: 401 unauthenticated, 403 non-owner, 404 unknown attempt", async () => {
    authMock.mockResolvedValue(null);
    const unauthenticated = await getAttemptRoute(new NextRequest("http://localhost/api/attempts/x"), routeParams(attemptId));
    expect(unauthenticated.status).toBe(401);

    authMock.mockResolvedValue(sessionFor("someone-else", "TRAINEE"));
    const forbidden = await getAttemptRoute(new NextRequest("http://localhost/api/attempts/x"), routeParams(attemptId));
    expect(forbidden.status).toBe(403);

    authMock.mockResolvedValue(session);
    const missing = await getAttemptRoute(new NextRequest("http://localhost/api/attempts/x"), routeParams("no-such-id"));
    expect(missing.status).toBe(404);
  });

  it("PATCH answers: saves through the real handler and ships no correctOption", async () => {
    authMock.mockResolvedValue(session);
    const request = new NextRequest(`http://localhost/api/attempts/${attemptId}/answers`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers: [{ questionId: mcqQuestionId, selectedOption: "a" }] }),
    });
    const response = await patchAnswersRoute(request, routeParams(attemptId));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("correctOption");
    const body = JSON.parse(text);
    const saved = body.attempt.answers.find((a: { questionId: string }) => a.questionId === mcqQuestionId);
    expect(saved.selectedOption).toBe("a");
    expect(saved.isCorrect).toBeNull();
  });

  it("GET mid-attempt: redacted view with countdown fields", async () => {
    authMock.mockResolvedValue(session);
    const response = await getAttemptRoute(new NextRequest("http://localhost/api/attempts/x"), routeParams(attemptId));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("correctOption");
    const body = JSON.parse(text);
    expect(body.attempt.status).toBe("IN_PROGRESS");
    expect(new Date(body.attempt.expiresAt).getTime()).toBe(new Date(body.attempt.startedAt).getTime() + 600_000);
    expect(body.attempt.serverNow).toBeDefined();
  });

  it("POST submit: finalizes a failing attempt but keeps isCorrect hidden while a retry remains", async () => {
    authMock.mockResolvedValue(session);
    const response = await submitRoute(new NextRequest("http://localhost/api/attempts/x", { method: "POST" }), routeParams(attemptId));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("correctOption");
    const body = JSON.parse(text);
    expect(body.attempt.status).toBe("SUBMITTED");
    expect(body.attempt.score).toBe(50); // MCQ right, TRUE_FALSE unanswered
    expect(body.attempt.passed).toBe(false);
    // Attempt 1 of 2 failed — correctness must stay hidden (answer-key
    // reconstruction guard), including through this route's response.
    expect(body.attempt.answers.every((a: { isCorrect: boolean | null }) => a.isCorrect === null)).toBe(true);
  });
});
