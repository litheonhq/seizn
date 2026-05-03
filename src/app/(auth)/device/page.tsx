import { Suspense } from "react";
import { AuthLoadingShell } from "@/components/auth/auth-shell";
import DeviceForm from "./device-form";

function DeviceLoading() {
  return <AuthLoadingShell />;
}

export default function DeviceAuthPage() {
  return (
    <Suspense fallback={<DeviceLoading />}>
      <DeviceForm />
    </Suspense>
  );
}
