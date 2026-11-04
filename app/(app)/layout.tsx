import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { requireMember } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { usageSummary } from "@/lib/usage";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember();
  const usage = await asUser(me.id, (db) => usageSummary(db, me.tenantId));
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-6 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <span className="font-semibold text-emerald-700">ChattyBomb</span>
        <Link href="/inbox">Inbox</Link>
        <Link href="/leads">Leads</Link>
        <Link href="/reminders">Reminders</Link>
        <Link href="/documents">Documents</Link>
        <Link href="/settings">Settings</Link>
        <span className="ml-auto text-slate-500">{me.name} · {me.role}</span>
        <form action={logout}><button className="text-slate-500 underline">Log out</button></form>
      </header>
      {usage.warn && (
        <p className={`px-4 py-1.5 text-sm ${usage.over ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
          {usage.used} of {usage.limit} conversations used this month ({usage.pct}%).{" "}
          {usage.aiPaused ? "AI replies are paused until next month or a plan upgrade." : usage.over ? "Extra conversations are billed as overage." : "You are close to your plan limit."}{" "}
          <Link href="/settings" className="underline">Details</Link>
        </p>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
