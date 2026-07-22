import { prisma } from "@/lib/prisma";

// Test-only helper: each content-management test file gets its own
// throwaway lesson under the shared الخدمات fixture sector, so content
// items in one test file can never collide with another (vitest runs test
// files concurrently). Mirrors src/lib/quiz/attempt-test-fixtures.ts but
// without a quiz — content items don't need one.
export async function createEphemeralLesson(title: string) {
  const unit = await prisma.unit.findFirstOrThrow({ where: { name: "أول مكالمة" } });
  return prisma.lesson.create({ data: { title, unitId: unit.id } });
}

// Deleting the lesson cascades through contentItems -> contentItemRevisions.
export async function deleteEphemeralLesson(lessonId: string) {
  await prisma.lesson.delete({ where: { id: lessonId } }).catch(() => {});
}
