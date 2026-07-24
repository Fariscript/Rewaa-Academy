import { signIn } from "@/auth";
import { redirect } from "next/navigation";
import { forgeDevSession } from "@/lib/dev/forge-session";
import { isStagingQuickLoginEnabled } from "@/lib/dev/staging-quick-login";

// Netlify staging only — see isStagingQuickLoginEnabled for the
// STAGING_QUICK_LOGIN_ENABLED gate and its production-context fail-safe.
//
// force-dynamic is required, not decorative: this page has no other
// dynamic data dependency, so Next.js would otherwise statically prerender
// it ONCE at build time — baking in whichever env value happened to be set
// during that build and never re-checking it again on a live request. That
// would silently defeat both the flag and the Netlify-production-context
// fail-safe the moment a deploy's env changes without a full rebuild.
export const dynamic = "force-dynamic";

const SEED_USER_EMAILS = {
  admin: "admin@example.com",
  trainee: "trainee@example.com",
} as const;

export default function LoginPage() {
  const quickLoginEnabled = isStagingQuickLoginEnabled();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-bold">أكاديمية رِواء للمبيعات</h1>
      <p className="text-neutral-500">سجّل الدخول باستخدام حساب جوجل الخاص بالشركة</p>

      {quickLoginEnabled ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <form
              action={async () => {
                "use server";
                await forgeDevSession(SEED_USER_EMAILS.admin);
                redirect("/");
              }}
            >
              <button
                type="submit"
                className="rounded-md bg-neutral-700 px-6 py-3 font-medium text-white hover:bg-neutral-600"
              >
                دخول سريع كمسؤول (Admin)
              </button>
            </form>
            <form
              action={async () => {
                "use server";
                await forgeDevSession(SEED_USER_EMAILS.trainee);
                redirect("/");
              }}
            >
              <button
                type="submit"
                className="rounded-md bg-neutral-700 px-6 py-3 font-medium text-white hover:bg-neutral-600"
              >
                دخول سريع كمتدرّب (Trainee)
              </button>
            </form>
          </div>
          <p className="text-xs text-neutral-400">لبيئة التجربة (staging) فقط</p>
          <div className="h-px w-24 bg-neutral-200 dark:bg-neutral-800" />
        </>
      ) : null}

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-6 py-3 font-medium text-white hover:bg-neutral-700"
        >
          الدخول عبر جوجل
        </button>
      </form>
    </main>
  );
}
