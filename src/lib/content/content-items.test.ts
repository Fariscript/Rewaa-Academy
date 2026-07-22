import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { createEphemeralLesson, deleteEphemeralLesson } from "./content-test-fixtures";
import {
  createContentItem,
  editContentItem,
  moveContentItem,
  publishContentItem,
  unpublishContentItem,
} from "./content-items";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

const article = { type: "ARTICLE", body: "نص المقال الأول" };

describe("createContentItem / editContentItem / publishContentItem / unpublishContentItem / moveContentItem", () => {
  let lesson: { id: string };
  let admin: { id: string };

  beforeAll(async () => {
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    lesson = await createEphemeralLesson("درس 22 يوليو: إدارة المحتوى");
  });

  afterAll(async () => {
    await deleteEphemeralLesson(lesson.id);
  });

  describe("createContentItem", () => {
    it("rejects non-admin callers", async () => {
      await expect(createContentItem(sessionFor("caller", "TRAINEE"), lesson.id, article)).rejects.toThrow(
        ForbiddenError,
      );
    });

    it("404s on an unknown lesson", async () => {
      await expect(createContentItem(sessionFor(admin.id, "ADMIN"), "does-not-exist", article)).rejects.toThrow(
        NotFoundError,
      );
    });

    it("rejects invalid content without persisting anything", async () => {
      const before = await prisma.contentItem.count({ where: { lessonId: lesson.id } });
      await expect(
        createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, { type: "ARTICLE", body: "" }),
      ).rejects.toThrow(ForbiddenError);
      const after = await prisma.contentItem.count({ where: { lessonId: lesson.id } });
      expect(after).toBe(before);
    });

    it("404s when assetId references a video/pdf/image item to a non-existent asset", async () => {
      await expect(
        createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, { type: "VIDEO", assetId: "does-not-exist" }),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects when the referenced asset's type doesn't match the item type", async () => {
      const asset = await prisma.contentAsset.create({
        data: { type: "PDF", url: "/x.pdf", mimeType: "application/pdf", sizeBytes: 10, originalName: "x.pdf" },
      });
      await expect(
        createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, { type: "VIDEO", assetId: asset.id }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("creates a DRAFT item with createdById set, auto-appending order", async () => {
      const first = await createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, article);
      expect(first.status).toBe("DRAFT");
      expect(first.createdById).toBe(admin.id);
      expect(first.order).toBe(1);

      const second = await createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, {
        ...article,
        body: "المقال الثاني",
      });
      expect(second.order).toBe(2);
    });

    it("audits content_item_created with the right actor and target (NFR-05)", async () => {
      const item = await createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, article);
      const audit = await prisma.auditLog.findFirst({
        where: { action: "content_item_created", targetId: item.id },
      });
      expect(audit).toBeDefined();
      expect(audit?.actorId).toBe(admin.id);
      expect(audit?.targetType).toBe("ContentItem");
    });
  });

  describe("editContentItem", () => {
    it("rejects non-admin callers", async () => {
      const item = await createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, article);
      await expect(editContentItem(sessionFor("caller", "TRAINEE"), item.id, article)).rejects.toThrow(
        ForbiddenError,
      );
    });

    it("404s on an unknown content item", async () => {
      await expect(editContentItem(sessionFor(admin.id, "ADMIN"), "does-not-exist", article)).rejects.toThrow(
        NotFoundError,
      );
    });

    it("resets a PUBLISHED item to DRAFT and archives the prior content as a revision", async () => {
      const item = await createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, article);
      const published = await publishContentItem(sessionFor(admin.id, "ADMIN"), item.id);
      expect(published.status).toBe("PUBLISHED");

      const edited = await editContentItem(sessionFor(admin.id, "ADMIN"), item.id, {
        type: "ARTICLE",
        body: "نص معدّل",
      });
      expect(edited.status).toBe("DRAFT");
      expect(edited.body).toBe("نص معدّل");

      const revisions = await prisma.contentItemRevision.findMany({ where: { contentItemId: item.id } });
      expect(revisions).toHaveLength(1);
      expect(revisions[0].body).toBe(article.body); // the pre-edit content
      expect(revisions[0].status).toBe("PUBLISHED"); // status at the time of the edit
      expect(revisions[0].editedById).toBe(admin.id);
    });

    it("rejects invalid content without mutating the item or writing a revision", async () => {
      const item = await createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, article);
      await expect(
        editContentItem(sessionFor(admin.id, "ADMIN"), item.id, { type: "ARTICLE", body: "" }),
      ).rejects.toThrow(ForbiddenError);

      const unchanged = await prisma.contentItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(unchanged.body).toBe(article.body);
      const revisions = await prisma.contentItemRevision.count({ where: { contentItemId: item.id } });
      expect(revisions).toBe(0);
    });

    it("clears assetId/body appropriately when switching an ARTICLE into a VIDEO", async () => {
      const asset = await prisma.contentAsset.create({
        data: { type: "VIDEO", url: "/x.mp4", mimeType: "video/mp4", sizeBytes: 10, originalName: "x.mp4" },
      });
      const item = await createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, article);
      const edited = await editContentItem(sessionFor(admin.id, "ADMIN"), item.id, {
        type: "VIDEO",
        assetId: asset.id,
      });
      expect(edited.type).toBe("VIDEO");
      expect(edited.body).toBeNull();
      expect(edited.assetId).toBe(asset.id);
    });
  });

  describe("publishContentItem / unpublishContentItem", () => {
    it("rejects non-admin callers for both actions", async () => {
      const item = await createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, article);
      await expect(publishContentItem(sessionFor("caller", "TRAINEE"), item.id)).rejects.toThrow(ForbiddenError);
      await expect(unpublishContentItem(sessionFor("caller", "TRAINEE"), item.id)).rejects.toThrow(ForbiddenError);
    });

    it("publishes a DRAFT item and audits it", async () => {
      const item = await createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, article);
      const published = await publishContentItem(sessionFor(admin.id, "ADMIN"), item.id);
      expect(published.status).toBe("PUBLISHED");

      const audit = await prisma.auditLog.findFirst({
        where: { action: "content_item_published", targetId: item.id },
      });
      expect(audit).toBeDefined();
    });

    it("refuses to publish an already-PUBLISHED item", async () => {
      const item = await createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, article);
      await publishContentItem(sessionFor(admin.id, "ADMIN"), item.id);
      await expect(publishContentItem(sessionFor(admin.id, "ADMIN"), item.id)).rejects.toThrow(ForbiddenError);
    });

    it("unpublishes a PUBLISHED item back to DRAFT without touching its content, and audits it", async () => {
      const item = await createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, article);
      await publishContentItem(sessionFor(admin.id, "ADMIN"), item.id);
      const unpublished = await unpublishContentItem(sessionFor(admin.id, "ADMIN"), item.id);
      expect(unpublished.status).toBe("DRAFT");
      expect(unpublished.body).toBe(article.body);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "content_item_unpublished", targetId: item.id },
      });
      expect(audit).toBeDefined();
    });

    it("refuses to unpublish a DRAFT item", async () => {
      const item = await createContentItem(sessionFor(admin.id, "ADMIN"), lesson.id, article);
      await expect(unpublishContentItem(sessionFor(admin.id, "ADMIN"), item.id)).rejects.toThrow(ForbiddenError);
    });
  });

  describe("moveContentItem", () => {
    it("swaps order with the neighbor above/below and is a no-op at the edges", async () => {
      const localLesson = await createEphemeralLesson("درس 22 يوليو: إعادة الترتيب");
      const a = await createContentItem(sessionFor(admin.id, "ADMIN"), localLesson.id, {
        ...article,
        body: "أ",
      });
      const b = await createContentItem(sessionFor(admin.id, "ADMIN"), localLesson.id, {
        ...article,
        body: "ب",
      });
      const c = await createContentItem(sessionFor(admin.id, "ADMIN"), localLesson.id, {
        ...article,
        body: "ج",
      });
      expect([a.order, b.order, c.order]).toEqual([1, 2, 3]);

      // no-op at the top edge
      const stillA = await moveContentItem(sessionFor(admin.id, "ADMIN"), a.id, "up");
      expect(stillA.order).toBe(1);

      // swap b up past a
      await moveContentItem(sessionFor(admin.id, "ADMIN"), b.id, "up");
      const [reA, reB, reC] = await Promise.all(
        [a.id, b.id, c.id].map((id) => prisma.contentItem.findUniqueOrThrow({ where: { id } })),
      );
      expect(reB.order).toBe(1);
      expect(reA.order).toBe(2);
      expect(reC.order).toBe(3);

      // no-op at the bottom edge
      const stillC = await moveContentItem(sessionFor(admin.id, "ADMIN"), c.id, "down");
      expect(stillC.order).toBe(3);

      await deleteEphemeralLesson(localLesson.id);
    });
  });
});
