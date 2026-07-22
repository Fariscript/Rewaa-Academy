"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUTTON_CLASSES } from "@/components/ui/button";

export function MoveContentItemButtons({
  contentItemId,
  disableUp,
  disableDown,
}: {
  contentItemId: string;
  disableUp: boolean;
  disableDown: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"up" | "down" | null>(null);

  async function move(direction: "up" | "down") {
    setPending(direction);
    try {
      await fetch(`/api/admin/content-items/${contentItemId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => move("up")}
        disabled={pending !== null || disableUp}
        className={BUTTON_CLASSES.subtle}
        aria-label="نقل لأعلى"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={() => move("down")}
        disabled={pending !== null || disableDown}
        className={BUTTON_CLASSES.subtle}
        aria-label="نقل لأسفل"
      >
        ↓
      </button>
    </div>
  );
}
