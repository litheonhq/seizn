import { Suspense } from "react";
import { SeiznLockup } from "@/components/landing/brand-marks";
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
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--ink-50)", fontFamily: "var(--font-sans)" }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <SeiznLockup variant="graph" tone="dark" size="md" />
          <p className="mt-2 text-sm" style={{ color: "var(--ink-600)" }}>Loading...</p>
        </div>
      </div>
    </div>
  );
}
