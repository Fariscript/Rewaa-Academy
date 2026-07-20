import { redirect } from "next/navigation";
import { auth } from "@/auth";

// FR-04: redirect to Knowledge Library home immediately after login. The
// sector-scoped content home itself is built in slice 2 — this is the
// landing stub that slice 2 will replace.
export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-xl font-bold">مرحباً {session.user.name}</h1>
      <p className="text-neutral-500">مكتبة المعرفة قيد الإنشاء</p>
    </main>
  );
}
