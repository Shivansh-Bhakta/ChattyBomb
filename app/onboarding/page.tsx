import { redirect } from "next/navigation";
import { onboard } from "@/app/actions/auth";
import { authUser, getMember } from "@/lib/auth";

export default async function OnboardingPage() {
  const u = await authUser();
  if (!u) redirect("/login");
  if (await getMember(u.id)) redirect("/");
  return (
    <main className="mx-auto mt-24 max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">Tell us about your business</h1>
      <form action={onboard} className="card space-y-3">
        <input name="businessName" required minLength={2} maxLength={200} placeholder="Business name (e.g. Sunrise Clinic)" className="input" />
        <input name="ownerName" required maxLength={200} placeholder="Your name" className="input" />
        <button className="btn w-full">Create workspace</button>
      </form>
    </main>
  );
}
