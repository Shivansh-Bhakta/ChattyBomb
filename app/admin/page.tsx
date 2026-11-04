import { notFound, redirect } from "next/navigation";
import { authUser, getMember } from "@/lib/auth";

// shortcut: placeholder until the platform owner console (M10).
export default async function AdminPage() {
  const u = await authUser();
  if (!u) redirect("/login");
  if ((await getMember(u.id))?.role !== "platform_admin") notFound();
  return <main className="p-8">Platform owner console arrives in M10.</main>;
}
