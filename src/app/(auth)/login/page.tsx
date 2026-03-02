import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginLoading() {
  return (
    <div className="min-h-screen bg-szn-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-szn-text-1">
            Seizn<span className="text-szn-accent">.</span>
          </h1>
          <p className="text-szn-text-2 mt-2">Loading...</p>
        </div>
      </div>
    </div>
  );
}
