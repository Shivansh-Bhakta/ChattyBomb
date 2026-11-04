import { signup } from "@/app/actions/auth";

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <main className="mx-auto mt-24 max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">Start your 14-day free pilot</h1>
      <p className="text-sm text-slate-500">No card needed.</p>
      {sp.deleted && <p className="text-sm text-emerald-700">Your business and all its data were deleted.</p>}
      {sp.error && <p className="text-sm text-red-600">{sp.error === "exists" ? "That email already has an account." : "Could not sign up."}</p>}
      <form action={signup} className="card space-y-3">
        <input name="email" type="email" required placeholder="Work email" className="input" />
        <input name="password" type="password" required minLength={8} placeholder="Password (8+ characters)" className="input" />
        <button className="btn w-full">Create account</button>
      </form>
    </main>
  );
}
