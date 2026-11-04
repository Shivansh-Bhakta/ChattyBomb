import Link from "next/link";
import { login, mockLogin } from "@/app/actions/auth";
import { asService } from "@/lib/db";
import { mockAuthAllowed } from "@/lib/env";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const mock = mockAuthAllowed();
  const users = mock
    ? (await asService((db) => db.query(`select u.id, u.name, u.role, t.name as tenant from users u left join tenants t on t.id = u.tenant_id order by t.name nulls first, u.role`))).rows
    : [];
  return (
    <main className="mx-auto mt-24 max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">Log in to ChattyBomb</h1>
      {sp.check_email && <p className="text-sm text-emerald-700">Check your email to confirm your account, then log in.</p>}
      {sp.error && <p className="text-sm text-red-600">Wrong email or password.</p>}
      {mock ? (
        <form action={mockLogin} className="card space-y-2">
          <p className="text-sm text-slate-500">Mock mode: pick a seeded user.</p>
          {users.map((u) => (
            <button key={u.id} name="userId" value={u.id} className="btn-ghost w-full text-left">
              {u.name} <span className="text-slate-500">· {u.role}{u.tenant ? ` · ${u.tenant}` : ""}</span>
            </button>
          ))}
        </form>
      ) : (
        <form action={login} className="card space-y-3">
          <input name="email" type="email" required placeholder="Email" className="input" />
          <input name="password" type="password" required minLength={8} placeholder="Password" className="input" />
          <button className="btn w-full">Log in</button>
        </form>
      )}
      <p className="text-sm">New here? <Link href="/signup" className="text-emerald-700 underline">Start free pilot</Link></p>
    </main>
  );
}
