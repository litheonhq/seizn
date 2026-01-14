"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme, type Theme } from "@/contexts/ThemeContext";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

interface ThemeToggleProps {
  className?: string;
  variant?: "dropdown" | "button" | "icon";
}

export function ThemeToggle({ className = "", variant = "dropdown" }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { t } = useDashboardTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const themes: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: t("theme.light"), icon: <SunIcon className="w-4 h-4" /> },
    { value: "dark", label: t("theme.dark"), icon: <MoonIcon className="w-4 h-4" /> },
    { value: "system", label: t("theme.system"), icon: <SystemIcon className="w-4 h-4" /> },
  ];

  const currentTheme = themes.find((t) => t.value === theme) || themes[2];

  // Icon-only toggle (cycles through themes)
  if (variant === "icon") {
    const cycleTheme = () => {
      const currentIndex = themes.findIndex((t) => t.value === theme);
      const nextIndex = (currentIndex + 1) % themes.length;
      setTheme(themes[nextIndex].value);
    };

    return (
      <button
        onClick={cycleTheme}
        className={`p-2 rounded-xl hover:bg-white/60 dark:hover:bg-gray-800/60 transition-colors ${className}`}
        aria-label={t("theme.toggle")}
        title={`${t("theme.toggle")}: ${currentTheme.label}`}
      >
        {resolvedTheme === "dark" ? (
          <MoonIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        ) : (
          <SunIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        )}
      </button>
    );
  }

  // Button toggle (switches between light and dark)
  if (variant === "button") {
    const toggleTheme = () => {
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    };

    return (
      <button
        onClick={toggleTheme}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-700/80 border border-gray-200 dark:border-gray-700 transition-colors ${className}`}
        aria-label={t("theme.toggle")}
      >
        {resolvedTheme === "dark" ? (
          <MoonIcon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        ) : (
          <SunIcon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        )}
        <span className="text-sm text-gray-700 dark:text-gray-200">{currentTheme.label}</span>
      </button>
    );
  }

  // Dropdown (default)
  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-700/80 border border-gray-200 dark:border-gray-700 transition-colors"
        aria-label={t("theme.toggle")}
        aria-expanded={isOpen}
      >
        {resolvedTheme === "dark" ? (
          <MoonIcon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        ) : (
          <SunIcon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        )}
        <span className="text-sm text-gray-700 dark:text-gray-200">{currentTheme.label}</span>
        <ChevronDownIcon
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 py-1 z-50 animate-fade-in">
          {themes.map((item) => (
            <button
              key={item.value}
              onClick={() => {
                setTheme(item.value);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                theme === item.value
                  ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
                  : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Compact version for sidebar
export function ThemeToggleSidebar({ expanded = false }: { expanded?: boolean }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { t } = useDashboardTranslation();

  const cycleTheme = () => {
    const themes: Theme[] = ["light", "dark", "system"];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const getThemeLabel = () => {
    switch (theme) {
      case "light":
        return t("theme.light");
      case "dark":
        return t("theme.dark");
      case "system":
        return t("theme.system");
    }
  };

  return (
    <button
      onClick={cycleTheme}
      title={`${t("theme.toggle")}: ${getThemeLabel()}`}
      className={`group flex items-center rounded-2xl text-sm font-medium transition-all duration-300 ease-out overflow-hidden ${
        expanded ? "gap-3 px-4 py-3" : "justify-center p-3"
      } text-gray-600 hover:bg-white/60 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-gray-100 hover:shadow-md`}
    >
      {resolvedTheme === "dark" ? (
        <MoonIcon className="w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
      ) : (
        <SunIcon className="w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
      )}
      <span
        className={`truncate whitespace-nowrap transition-all duration-300 ease-out ${
          expanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 w-0"
        }`}
      >
        {getThemeLabel()}
      </span>
    </button>
  );
}

// Icons
function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
      />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
      />
    </svg>
  );
}

function SystemIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25"
      />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}
