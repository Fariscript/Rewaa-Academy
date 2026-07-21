import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { BUTTON_CLASSES } from "@/components/ui/button";

// Shell for every trainee-facing page. Authentication only — role checks
// stay in the lib layer per requireRole() (NFR-02); a signed-in Admin can
// see the trainee shell (they just have no sector content).
export default async function TraineeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <>
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-bold">
              أكاديمية رِواء للمبيعات
            </Link>
            <Link href="/certificate" className="text-sm text-neutral-600 hover:underline dark:text-neutral-300">
              الشهادة
            </Link>
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
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
