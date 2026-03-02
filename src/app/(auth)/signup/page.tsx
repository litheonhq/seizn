import { Suspense } from "react";
import SignupForm from "./signup-form";

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupLoading />}>
      <SignupForm />
    </Suspense>
  );
}

function SignupLoading() {
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
