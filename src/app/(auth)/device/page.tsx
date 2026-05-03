import { Suspense } from "react";
import { SeiznLockup } from "@/components/landing/brand-marks";
import DeviceForm from "./device-form";

function DeviceLoading() {
  return (
    <div className="text-center">
      <SeiznLockup variant="graph" tone="dark" size="md" />
      <p className="mt-4 text-sm" style={{ color: "var(--ink-600)" }}>Loading...</p>
    </div>
  );
}

export default function DeviceAuthPage() {
  return (
    <Suspense fallback={<DeviceLoading />}>
      <DeviceForm />
    </Suspense>
  );
}
