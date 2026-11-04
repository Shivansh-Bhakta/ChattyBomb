import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { requireMember } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember();
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-6 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <span className="font-semibold text-emerald-700">ChattyBomb</span>
        <Link href="/inbox">Inbox</Link>
        <Link href="/leads">Leads</Link>
        <Link href="/reminders">Reminders</Link>
        <Link href="/documents">Documents</Link>
        <Link href="/settings/channels">Channels</Link>
        <span className="ml-auto text-slate-500">{me.name} · {me.role}</span>
        <form action={logout}><button className="text-slate-500 underline">Log out</button></form>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
