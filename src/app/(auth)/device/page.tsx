import { Suspense } from "react";
import Link from "next/link";
import DeviceForm from "./device-form";

function DeviceLoading() {
  return (
    <div className="text-center">
      <div className="w-10 h-10 bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg mx-auto">
        <span className="text-white font-bold text-lg">S</span>
      </div>
      <p className="text-gray-400 mt-4">Loading...</p>
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
