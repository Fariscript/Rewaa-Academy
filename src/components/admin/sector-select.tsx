"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// FR-07/FR-14: assign or reassign a trainee's sector. Server-side, the
// reassignment's effect on existing quiz progress is open item #2 — this
// control only performs the assignment the API already supports.
export function SectorSelect({
  traineeId,
  currentSectorId,
  sectors,
}: {
  traineeId: string;
  currentSectorId: string | null;
  sectors: { id: string; name: string }[];
}) {
  const router = useRouter();
  // Optimistic: show the picked sector during the PATCH round-trip instead
  // of snapping back to the server value until refresh completes; revert on
  // failure. The server prop remains the source of truth after refresh.
  const [selected, setSelected] = useState(currentSectorId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Adjust state when props change" (render-time reconciliation, per the
  // React docs) — after router.refresh() delivers the new server value,
  // it wins over the optimistic one.
  const [lastServerValue, setLastServerValue] = useState(currentSectorId ?? "");
  if ((currentSectorId ?? "") !== lastServerValue) {
    setLastServerValue(currentSectorId ?? "");
    setSelected(currentSectorId ?? "");
  }

  async function assign(sectorId: string) {
    if (!sectorId || sectorId === currentSectorId) return;
    setSelected(sectorId);
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/trainees/${traineeId}/sector`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorId }),
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setSelected(currentSectorId ?? "");
      setError("تعذّر تعيين القطاع.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={(event) => void assign(event.target.value)}
        disabled={pending}
        className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        <option value="" disabled>
          بدون قطاع
        </option>
        {sectors.map((sector) => (
          <option key={sector.id} value={sector.id}>
            {sector.name}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </div>
  );
}
