import { Suspense } from "react";
import { AuthLoadingShell } from "@/components/auth/auth-shell";
import SignupForm from "./signup-form";

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupLoading />}>
      <SignupForm />
    </Suspense>
  );
}

function SignupLoading() {
  return <AuthLoadingShell />;
}
