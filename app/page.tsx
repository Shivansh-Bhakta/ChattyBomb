import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";

export default async function Home() {
  await requireMember();
  redirect("/inbox");
}
