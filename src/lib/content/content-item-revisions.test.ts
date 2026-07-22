import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { createEphemeralLesson, deleteEphemeralLesson } from "./content-test-fixtures";
import { createContentItem, editContentItem } from "./content-items";
import { listContentItemRevisions, restoreContentItemRevision } from "./content-item-revisions";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

const v1 = { type: "ARTICLE", body: "النسخة الأولى" };

describe("listContentItemRevisions / restoreContentItemRevision", () => {
  let lesson: { id: string };
  let admin: { id: string };

  beforeAll(async () => {
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    lesson = await createEphemeralLesson("درس 22 يوليو: سجل النسخ");
  });

  afterAll(async () => {
    await deleteEphemeralLesson(lesson.id);
  });

  it("rejects non-admin callers for both actions", async () => {
    const item = await createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, v1);
    await expect(listContentItemRevisions(sessionFor("caller", "TRAINEE"), item.id)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(
      restoreContentItemRevision(sessionFor("caller", "TRAINEE"), item.id, "whatever"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("404s when a revision doesn't belong to the given content item", async () => {
    const itemA = await createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, v1);
    const itemB = await createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, { ...v1, body: "عنصر ب" });
    await editContentItem(sessionFor(admin.id, "ADMIN"), itemA.id, { ...v1, body: "معدّل" });
    const [revisionOfA] = await listContentItemRevisions(sessionFor(admin.id, "ADMIN"), itemA.id);

    await expect(
      restoreContentItemRevision(sessionFor(admin.id, "ADMIN"), itemB.id, revisionOfA.id),
    ).rejects.toThrow(NotFoundError);
  });

  it("lists revisions newest-first and restore re-enters the edit path (archives current, applies old, resets to DRAFT)", async () => {
    const item = await createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, v1);
    await editContentItem(sessionFor(admin.id, "ADMIN"), item.id, { ...v1, body: "النسخة الثانية" });
    await editContentItem(sessionFor(admin.id, "ADMIN"), item.id, { ...v1, body: "النسخة الثالثة" });

    const revisions = await listContentItemRevisions(sessionFor(admin.id, "ADMIN"), item.id);
    expect(revisions).toHaveLength(2);
    expect(revisions[0].body).toBe("النسخة الثانية"); // most recent edit's prior content, first
    expect(revisions[1].body).toBe(v1.body);

    const targetRevision = revisions.find((r) => r.body === v1.body)!;
    const restored = await restoreContentItemRevision(sessionFor(admin.id, "ADMIN"), item.id, targetRevision.id);
    expect(restored.body).toBe(v1.body);
    expect(restored.status).toBe("DRAFT");

    // Restoring is itself an edit: it archived "النسخة الثالثة" as a new revision.
    const revisionsAfterRestore = await listContentItemRevisions(sessionFor(admin.id, "ADMIN"), item.id);
    expect(revisionsAfterRestore).toHaveLength(3);
    expect(revisionsAfterRestore[0].body).toBe("النسخة الثالثة");
  });
});
