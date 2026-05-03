import { Suspense } from "react";
import { AuthLoadingShell } from "@/components/auth/auth-shell";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginLoading() {
  return <AuthLoadingShell />;
}
