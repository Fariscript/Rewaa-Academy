import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { BUTTON_CLASSES } from "@/components/ui/button";

// Admin shell. The layout gate only routes non-admins away for UX — the
// actual enforcement stays server-side in each lib function via
// requireRole() (NFR-02), so nothing here is load-bearing for security.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/");

  return (
    <>
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/admin/quizzes" className="font-bold">
              أكاديمية رِواء — الإدارة
            </Link>
            <nav className="flex items-center gap-3 text-sm">
              <Link href="/admin/quizzes" className="text-neutral-600 hover:underline dark:text-neutral-300">
                الاختبارات
              </Link>
              <Link href="/admin/trainees" className="text-neutral-600 hover:underline dark:text-neutral-300">
                المتدربون
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">{session.user.name}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button type="submit" className={BUTTON_CLASSES.subtle}>
                تسجيل الخروج
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
