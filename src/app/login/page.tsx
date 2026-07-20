import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-bold">أكاديمية رِواء للمبيعات</h1>
      <p className="text-neutral-500">سجّل الدخول باستخدام حساب جوجل الخاص بالشركة</p>
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
