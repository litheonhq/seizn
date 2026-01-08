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
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">
            Seizn<span className="text-emerald-400">.</span>
          </h1>
          <p className="text-zinc-400 mt-2">Loading...</p>
        </div>
      </div>
    </div>
  );
}
