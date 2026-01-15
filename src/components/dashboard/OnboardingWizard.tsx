"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ttfsEvents } from "@/lib/analytics";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

interface OnboardingStep {  id: StepId;  titleKey: string;  descriptionKey: string;  iconType: StepIconType;  action: { labelKey: string; href?: string };}type StepId = "create_org" | "api_key" | "install_sdk" | "first_query" | "view_trace";type StepIconType = "org" | "key" | "sdk" | "query" | "trace";
type SdkType = "npm" | "pip" | "curl";
const STORAGE_KEYS = {
  dismissed: (userId: string) => `seizn_onboarding_dismissed_${userId}`,
  traceViewed: "seizn_trace_viewed",
  sdkCopied: "seizn_sdk_copied",
  orgCreated: "seizn_org_created",
  firstQuery: "seizn_first_query",
};

const steps: OnboardingStep[] = [
  { id: "create_org", titleKey: "dashboard.onboarding.steps.createOrg.title", descriptionKey: "dashboard.onboarding.steps.createOrg.description", iconType: "org", action: { labelKey: "dashboard.onboarding.steps.createOrg.action", href: "/dashboard/organizations" } },
  { id: "api_key", titleKey: "dashboard.onboarding.steps.apiKey.title", descriptionKey: "dashboard.onboarding.steps.apiKey.description", iconType: "key", action: { labelKey: "dashboard.onboarding.steps.apiKey.action", href: "/dashboard/keys" } },
  { id: "install_sdk", titleKey: "dashboard.onboarding.steps.installSdk.title", descriptionKey: "dashboard.onboarding.steps.installSdk.description", iconType: "sdk", action: { labelKey: "dashboard.onboarding.steps.installSdk.action" } },
  { id: "first_query", titleKey: "dashboard.onboarding.steps.firstQuery.title", descriptionKey: "dashboard.onboarding.steps.firstQuery.description", iconType: "query", action: { labelKey: "dashboard.onboarding.steps.firstQuery.action", href: "/dashboard/playground" } },
  { id: "view_trace", titleKey: "dashboard.onboarding.steps.viewTrace.title", descriptionKey: "dashboard.onboarding.steps.viewTrace.description", iconType: "trace", action: { labelKey: "dashboard.onboarding.steps.viewTrace.action", href: "/dashboard/usage" } }
];

interface OnboardingWizardProps {
  userId: string;
  onStartTour?: () => void;
}

export function OnboardingWizard({ userId, onStartTour }: OnboardingWizardProps) {
  const { t, isLoading: translationLoading } = useDashboardTranslation();
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showSdkModal, setShowSdkModal] = useState(false);
  const [copiedSdk, setCopiedSdk] = useState<SdkType | null>(null);

  useEffect(() => {
    const checkSteps = async () => {
      const completed = new Set<string>();
      try {
        const res = await fetch("/api/organizations");
        const data = await res.json();
        if (data.success && data.organizations?.length > 0) completed.add("create_org");
      } catch { if (localStorage.getItem(STORAGE_KEYS.orgCreated) === "true") completed.add("create_org"); }
      try {
        const res = await fetch("/api/keys");
        const data = await res.json();
        if (data.success && data.keys?.length > 0) completed.add("api_key");
      } catch {}
      if (localStorage.getItem(STORAGE_KEYS.sdkCopied) === "true") completed.add("install_sdk");
      try {
        const res = await fetch("/api/dashboard/stats");
        const data = await res.json();
        if (data.success && data.stats?.apiCalls?.today > 0) completed.add("first_query");
      } catch { if (localStorage.getItem(STORAGE_KEYS.firstQuery) === "true") completed.add("first_query"); }
      if (localStorage.getItem(STORAGE_KEYS.traceViewed) === "true") completed.add("view_trace");
      setCompletedSteps(completed);
      setIsLoading(false);
      if (completed.size === steps.length) ttfsEvents.onboardingCompleted();
    };
    const dismissed = localStorage.getItem(STORAGE_KEYS.dismissed(userId));
    if (dismissed === "true") { setIsDismissed(true); setIsLoading(false); return; }
    checkSteps();
  }, [userId]);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEYS.dismissed(userId), "true");
    ttfsEvents.onboardingDismissed(completedSteps.size, steps.length);
    setIsDismissed(true);
  };

  const handleStepClick = (step: OnboardingStep, index: number) => {
    if (!completedSteps.has(step.id)) ttfsEvents.onboardingStepCompleted(step.id, index + 1);
  };

  const markStepComplete = useCallback((stepId: StepId) => {
    const keyMap: Record<string, string | undefined> = { view_trace: STORAGE_KEYS.traceViewed, install_sdk: STORAGE_KEYS.sdkCopied, create_org: STORAGE_KEYS.orgCreated, first_query: STORAGE_KEYS.firstQuery, api_key: undefined };
    if (keyMap[stepId]) localStorage.setItem(keyMap[stepId], "true");
    setCompletedSteps((prev) => new Set([...prev, stepId]));
  }, []);

  const handleCopySdk = async (sdk: SdkType, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedSdk(sdk);
      markStepComplete("install_sdk");
      ttfsEvents.sdkInstallCopy(sdk);
      setTimeout(() => setCopiedSdk(null), 2000);
    } catch (err) { console.error("Failed to copy:", err); }
  };

  if (typeof window !== "undefined") {
    (window as typeof window & { seiznOnboarding?: { markComplete: (stepId: StepId) => void } }).seiznOnboarding = { markComplete: markStepComplete };
  }

  if (isDismissed) return null;

  if (isLoading || translationLoading) {
    return (
      <div className="glass-card rounded-2xl overflow-hidden mb-6 border-2 border-emerald-500/20 animate-pulse">
        <div className="p-4 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-200" />
            <div className="space-y-2"><div className="h-4 w-40 bg-gray-200 rounded" /><div className="h-3 w-24 bg-gray-200 rounded" /></div>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {[1,2,3,4,5].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50">
              <div className="w-8 h-8 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2"><div className="h-4 w-32 bg-gray-200 rounded" /><div className="h-3 w-48 bg-gray-200 rounded" /></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const completionPercentage = Math.round((completedSteps.size / steps.length) * 100);
  if (completedSteps.size === steps.length) return null;
  const nextStepIndex = steps.findIndex((step) => !completedSteps.has(step.id));

  return (
    <>
      <div className="glass-card rounded-2xl overflow-hidden mb-6 border-2 border-emerald-500/20">
        <div className="p-4 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 cursor-pointer flex items-center justify-between" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center"><RocketIcon className="w-5 h-5 text-white" /></div>
            <div><h3 className="font-semibold text-gray-900">{t("dashboard.onboarding.title")}</h3><p className="text-sm text-gray-500">{t("dashboard.onboarding.progress", { completed: completedSteps.size, total: steps.length })}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12">
              <svg className="w-12 h-12 transform -rotate-90"><circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="none" className="text-gray-200" /><circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="none" strokeDasharray={`${2 * Math.PI * 20}`} strokeDashoffset={`${2 * Math.PI * 20 * (1 - completionPercentage / 100)}`} className="text-emerald-500 transition-all duration-500" strokeLinecap="round" /></svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">{completionPercentage}%</span>
            </div>
            {onStartTour && <button onClick={(e) => { e.stopPropagation(); onStartTour(); }} className="text-emerald-600 hover:text-emerald-700 p-1" title={t("dashboard.onboarding.takeTour")}><PlayIcon className="w-5 h-5" /></button>}
            <button onClick={(e) => { e.stopPropagation(); handleDismiss(); }} className="text-gray-400 hover:text-gray-600 p-1" title={t("dashboard.onboarding.dismiss")}><XIcon className="w-5 h-5" /></button>
          </div>
        </div>
        {isExpanded && (
          <div className="p-4 space-y-3">
            {steps.map((step, index) => {
              const isComplete = completedSteps.has(step.id);
              const isNext = index === nextStepIndex;
              const handleClick = step.id === "install_sdk" ? () => { handleStepClick(step, index); setShowSdkModal(true); } : null;
              return (
                <div key={step.id} className={`flex items-center gap-4 p-3 rounded-xl transition-all ${isComplete ? "bg-emerald-50" : isNext ? "bg-gradient-to-r from-emerald-50 to-cyan-50 ring-2 ring-emerald-500/30" : "bg-gray-50 hover:bg-gray-100"}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isComplete ? "bg-emerald-500 text-white" : isNext ? "bg-gradient-to-br from-emerald-400 to-cyan-500 text-white" : "bg-gray-200 text-gray-600"}`}>
                    {isComplete ? <CheckIcon className="w-5 h-5" /> : <StepIcon type={step.iconType} className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0"><p className={`font-medium ${isComplete ? "text-emerald-700" : isNext ? "text-emerald-800" : "text-gray-900"}`}>{t(step.titleKey)}</p><p className="text-sm text-gray-500 truncate">{t(step.descriptionKey)}</p></div>
                  {!isComplete && (handleClick ? <button onClick={handleClick} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex-shrink-0 ${isNext ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-gray-900 text-white hover:bg-gray-800"}`}>{t(step.action.labelKey)}</button> : <Link href={step.action.href || "#"} onClick={() => handleStepClick(step, index)} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex-shrink-0 ${isNext ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-gray-900 text-white hover:bg-gray-800"}`}>{t(step.action.labelKey)}</Link>)}
                </div>
              );
            })}
            <div className="text-center pt-2"><button onClick={handleDismiss} className="text-sm text-gray-400 hover:text-gray-600">{t("dashboard.onboarding.doLater")}</button></div>
          </div>
        )}
      </div>
      {showSdkModal && <SdkModal onClose={() => setShowSdkModal(false)} onCopy={handleCopySdk} copiedSdk={copiedSdk} t={t} />}
    </>
  );
}

function SdkModal({ onClose, onCopy, copiedSdk, t }: { onClose: () => void; onCopy: (sdk: SdkType, command: string) => void; copiedSdk: SdkType | null; t: (key: string) => string }) {
  const sdkOptions: { id: SdkType; name: string; command: string }[] = [
    { id: "npm", name: "JavaScript / TypeScript", command: "npm install @seizn/sdk" },
    { id: "pip", name: "Python", command: "pip install seizn" },
    { id: "curl", name: "REST API (cURL)", command: 'curl -X POST https://seizn.com/api/memories \\\n  -H "x-api-key: YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"content": "test memory"}\'' },
  ];
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl">
        <div className="flex items-center justify-between p-4 border-b"><h3 className="text-lg font-semibold text-gray-900">{t("dashboard.onboarding.sdkModal.title")}</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><XIcon className="w-5 h-5" /></button></div>
        <div className="p-4 space-y-4"><p className="text-sm text-gray-500">{t("dashboard.onboarding.sdkModal.description")}</p>
          {sdkOptions.map((sdk) => (
            <div key={sdk.id} className="border rounded-xl p-4 hover:border-emerald-300 transition-colors">
              <div className="flex items-center justify-between mb-2"><span className="font-medium text-gray-900">{sdk.name}</span><button onClick={() => onCopy(sdk.id, sdk.command)} className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${copiedSdk === sdk.id ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>{copiedSdk === sdk.id ? <span className="flex items-center gap-1"><CheckIcon className="w-4 h-4" />{t("dashboard.onboarding.sdkModal.copied")}</span> : t("dashboard.onboarding.sdkModal.copy")}</button></div>
              <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg text-sm overflow-x-auto"><code>{sdk.command}</code></pre>
            </div>
          ))}
        </div>
        <div className="p-4 border-t bg-gray-50 rounded-b-2xl"><div className="flex items-center justify-between"><Link href="/docs#sdks" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">{t("dashboard.onboarding.sdkModal.viewDocs")}</Link><button onClick={onClose} className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800">{t("dashboard.onboarding.sdkModal.done")}</button></div></div>
      </div>
    </div>
  );
}

function StepIcon({ type, className }: { type: StepIconType; className: string }) {
  const icons = {
    org: <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
    key: <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>,
    sdk: <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>,
    query: <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
    trace: <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  };
  return icons[type] || null;
}

function RocketIcon({ className }: { className: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>; }
function CheckIcon({ className }: { className: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>; }
function XIcon({ className }: { className: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>; }
function PlayIcon({ className }: { className: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }
