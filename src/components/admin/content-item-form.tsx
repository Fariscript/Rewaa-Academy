"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUTTON_CLASSES } from "@/components/ui/button";

const TYPE_OPTIONS = [
  { value: "VIDEO", label: "فيديو" },
  { value: "PDF", label: "ملف PDF" },
  { value: "ARTICLE", label: "مقال نصي" },
  { value: "IMAGE", label: "صورة" },
] as const;

type ContentItemTypeValue = (typeof TYPE_OPTIONS)[number]["value"];

export interface ContentItemFormInitial {
  type: ContentItemTypeValue;
  body: string | null;
  asset: { id: string; originalName: string } | null;
}

// Shared create/edit form. Server-side validation in validateContentItemInput
// stays the authority — this form only makes the happy path convenient.
// Editing already-published content resets it to DRAFT server-side (the
// same hard gate the question bank uses); the page shows that warning.
//
// VIDEO/PDF/IMAGE upload to local disk via /api/admin/content-assets — a
// dev-only placeholder until a real storage backend is decided (see
// src/lib/content/upload-asset.ts).
export function ContentItemForm({
  submitUrl,
  method,
  returnTo,
  initial,
}: {
  submitUrl: string;
  method: "POST" | "PATCH";
  returnTo: string;
  initial?: ContentItemFormInitial;
}) {
  const router = useRouter();
  const [type, setType] = useState<ContentItemTypeValue>(initial?.type ?? "ARTICLE");
  const [body, setBody] = useState(initial?.body ?? "");
  const [assetId, setAssetId] = useState<string | null>(initial?.asset?.id ?? null);
  const [assetLabel, setAssetLabel] = useState<string | null>(initial?.asset?.originalName ?? null);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isArticle = type === "ARTICLE";

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      const response = await fetch("/api/admin/content-assets", { method: "POST", body: formData });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        setError(responseBody?.error ?? "تعذّر رفع الملف.");
        return;
      }
      setAssetId(responseBody.asset.id);
      setAssetLabel(responseBody.asset.originalName);
    } catch {
      setError("تعذّر رفع الملف.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const payload = isArticle ? { type, body: body.trim() } : { type, assetId };
      const response = await fetch(submitUrl, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        setError(responseBody?.error ?? "تعذّر حفظ عنصر المحتوى.");
        return;
      }
      router.push(returnTo);
      router.refresh();
    } catch {
      setError("تعذّر حفظ عنصر المحتوى.");
    } finally {
      setPending(false);
    }
  }

  const canSubmit = isArticle ? body.trim().length > 0 : assetId !== null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="ci-type">
          نوع المحتوى
        </label>
        <select
          id="ci-type"
          value={type}
          onChange={(event) => {
            setType(event.target.value as ContentItemTypeValue);
            setAssetId(null);
            setAssetLabel(null);
          }}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {isArticle ? (
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="ci-body">
            نص المقال
          </label>
          <textarea
            id="ci-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={8}
            className="w-full rounded-md border border-neutral-300 p-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="ci-file">
            الملف
          </label>
          <input
            id="ci-file"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadFile(file);
            }}
            disabled={uploading}
            className="text-sm"
          />
          {uploading ? <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">جارٍ الرفع...</p> : null}
          {!uploading && assetLabel ? (
            <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">تم رفع: {assetLabel}</p>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || uploading || !canSubmit}
          className={BUTTON_CLASSES.primary}
        >
          {pending ? "جارٍ الحفظ..." : "حفظ عنصر المحتوى"}
        </button>
        {error ? <span className="text-sm text-red-600 dark:text-red-400">{error}</span> : null}
      </div>
    </div>
  );
}
