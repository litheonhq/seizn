import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthLoadingShell } from "@/components/auth/auth-shell";
import { auth } from "@/lib/auth";
import { sanitizeRelativeRedirect } from "@/lib/security/redirect";
import LoginForm from "./login-form";

type LoginPageProps = {
  searchParams?: Promise<{ callbackUrl?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const emptyParams: { callbackUrl?: string | string[] } = {};
  const [session, params] = await Promise.all([auth(), searchParams ?? Promise.resolve(emptyParams)]);
  const rawCallback = Array.isArray(params.callbackUrl) ? params.callbackUrl[0] : params.callbackUrl;
  const callbackUrl = sanitizeRelativeRedirect(rawCallback, "/dashboard/author");

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginLoading() {
  return <AuthLoadingShell />;
}
