import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdmin();
  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-6 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <Link href="/admin" className="font-semibold text-emerald-700">ChattyBomb · Platform owner</Link>
        <a href="/admin/export" className="underline">Export tenants CSV</a>
        <span className="ml-auto text-slate-500">{me.name}</span>
        <form action={logout}><button className="text-slate-500 underline">Log out</button></form>
      </header>
      {children}
    </div>
  );
}
