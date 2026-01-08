import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UsageClient } from "./client";

export default async function UsagePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <UsageClient />;
}
