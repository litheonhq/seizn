"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

const STORAGE_KEY = "seizn_tour_completed";

interface TourStep {
  target: string; // CSS selector
  titleKey: string;
  descriptionKey: string;
  placement?: "top" | "bottom" | "left" | "right";
  spotlightPadding?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  steps?: TourStep[];
}

const defaultSteps: TourStep[] = [
  {
    target: "[data-tour='welcome']",
    titleKey: "dashboard.onboarding.tour.welcome.title",
    descriptionKey: "dashboard.onboarding.tour.welcome.description",
    placement: "bottom",
  },
  {
    target: "[data-tour='sidebar']",
    titleKey: "dashboard.onboarding.tour.sidebar.title",
    descriptionKey: "dashboard.onboarding.tour.sidebar.description",
    placement: "right",
  },
  {
    target: "[data-tour='stats']",
    titleKey: "dashboard.onboarding.tour.stats.title",
    descriptionKey: "dashboard.onboarding.tour.stats.description",
    placement: "bottom",
  },
  {
    target: "[data-tour='quickstart']",
    titleKey: "dashboard.onboarding.tour.quickStart.title",
    descriptionKey: "dashboard.onboarding.tour.quickStart.description",
    placement: "top",
  },
];

export function GuidedTour({ isOpen, onClose, steps = defaultSteps }: Props) {
  const { t } = useDashboardTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateTargetRect = useCallback(() => {
    if (!isOpen || currentStep >= steps.length) return;

    const step = steps[currentStep];
    const element = document.querySelector(step.target);

    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [isOpen, currentStep, steps]);

  useEffect(() => {
    updateTargetRect();

    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, true);

    return () => {
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect, true);
    };
  }, [updateTargetRect]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    onClose();
    setCurrentStep(0);
  };

  const handleFinish = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    onClose();
    setCurrentStep(0);
  };

  if (!mounted || !isOpen || steps.length === 0) {
    return null;
  }

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  // Calculate tooltip position
  const getTooltipPosition = () => {
    if (!targetRect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

    const padding = step.spotlightPadding || 8;
    const tooltipWidth = 320;
    const tooltipHeight = 180;
    const offset = 16;

    switch (step.placement) {
      case "top":
        return {
          top: `${targetRect.top - tooltipHeight - offset}px`,
          left: `${targetRect.left + targetRect.width / 2 - tooltipWidth / 2}px`,
        };
      case "bottom":
        return {
          top: `${targetRect.bottom + offset}px`,
          left: `${targetRect.left + targetRect.width / 2 - tooltipWidth / 2}px`,
        };
      case "left":
        return {
          top: `${targetRect.top + targetRect.height / 2 - tooltipHeight / 2}px`,
          left: `${targetRect.left - tooltipWidth - offset}px`,
        };
      case "right":
        return {
          top: `${targetRect.top + targetRect.height / 2 - tooltipHeight / 2}px`,
          left: `${targetRect.right + offset}px`,
        };
      default:
        return {
          top: `${targetRect.bottom + offset}px`,
          left: `${targetRect.left + targetRect.width / 2 - tooltipWidth / 2}px`,
        };
    }
  };

  const tooltipPosition = getTooltipPosition();

  const tourContent = (
    <div className="fixed inset-0 z-[9999]">
      {/* Overlay with spotlight cutout */}
      <svg className="fixed inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - (step.spotlightPadding || 8)}
                y={targetRect.top - (step.spotlightPadding || 8)}
                width={targetRect.width + (step.spotlightPadding || 8) * 2}
                height={targetRect.height + (step.spotlightPadding || 8) * 2}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.6)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Spotlight border */}
      {targetRect && (
        <div
          className="fixed border-2 border-emerald-500 rounded-lg pointer-events-none animate-pulse"
          style={{
            top: targetRect.top - (step.spotlightPadding || 8),
            left: targetRect.left - (step.spotlightPadding || 8),
            width: targetRect.width + (step.spotlightPadding || 8) * 2,
            height: targetRect.height + (step.spotlightPadding || 8) * 2,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="fixed bg-white rounded-xl shadow-2xl w-80 p-4 z-[10000]"
        style={tooltipPosition}
      >
        {/* Arrow indicator */}
        <div className="mb-3">
          <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
            {t("dashboard.onboarding.tour.stepOf", { current: currentStep + 1, total: steps.length })}
          </span>
        </div>

        {/* Content */}
        <h4 className="text-lg font-semibold text-gray-900 mb-2">
          {t(step.titleKey)}
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          {t(step.descriptionKey)}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            {t("dashboard.onboarding.tour.skip")}
          </button>
          <button
            onClick={handleNext}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            {isLastStep ? t("dashboard.onboarding.tour.finish") : t("dashboard.onboarding.tour.next")}
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mt-4">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentStep ? "bg-emerald-500" : "bg-gray-200"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(tourContent, document.body);
}

// Hook to check if tour should be shown
export function useTourStatus() {
  const [shouldShowTour, setShouldShowTour] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    setShouldShowTour(completed !== "true");
  }, []);

  const resetTour = () => {
    localStorage.removeItem(STORAGE_KEY);
    setShouldShowTour(true);
  };

  return { shouldShowTour, resetTour };
}
