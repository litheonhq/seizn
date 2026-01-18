"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface SearchItem {
  id: string;
  title: string;
  section: string;
  content: string;
  url: string;
  keywords: string[];
}

interface SearchIndex {
  items: SearchItem[];
}

interface SearchTranslations {
  placeholder?: string;
  buttonText?: string;
  noResults?: string;
  hint?: string;
  navigate?: string;
  select?: string;
}

interface Props {
  locale?: string;
  translations?: SearchTranslations;
}

const defaultTranslations: SearchTranslations = {
  placeholder: "Search documentation...",
  buttonText: "Search docs...",
  noResults: "No results found for",
  hint: "Quick searches:",
  navigate: "to navigate",
  select: "to select",
};

export function DocsSearch({ locale = "en", translations = {} }: Props) {
  const t = { ...defaultTranslations, ...translations };
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searchIndex, setSearchIndex] = useState<SearchIndex | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Load search index
  useEffect(() => {
    fetch("/docs-search-index.json")
      .then((res) => res.json())
      .then((data) => setSearchIndex(data))
      .catch(console.error);
  }, []);

  // Keyboard shortcut (⌘K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Search logic with fuzzy matching
  const search = useCallback(
    (q: string) => {
      if (!searchIndex || !q.trim()) {
        setResults([]);
        return;
      }

      const queryLower = q.toLowerCase();
      const queryWords = queryLower.split(/\s+/);

      const scored = searchIndex.items.map((item) => {
        let score = 0;

        // Exact title match
        if (item.title.toLowerCase().includes(queryLower)) {
          score += 100;
        }

        // Keyword matches
        for (const keyword of item.keywords) {
          if (keyword.includes(queryLower)) {
            score += 50;
          }
          for (const word of queryWords) {
            if (keyword.includes(word)) {
              score += 20;
            }
          }
        }

        // Content matches
        if (item.content.toLowerCase().includes(queryLower)) {
          score += 30;
        }
        for (const word of queryWords) {
          if (item.content.toLowerCase().includes(word)) {
            score += 10;
          }
        }

        // Section match
        if (item.section.toLowerCase().includes(queryLower)) {
          score += 15;
        }

        return { item, score };
      });

      const filtered = scored
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(({ item }) => item);

      setResults(filtered);
      setSelectedIndex(0);
    },
    [searchIndex]
  );

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => search(query), 150);
    return () => clearTimeout(timer);
  }, [query, search]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      window.location.href = getLocalizedUrl(results[selectedIndex].url);
      setIsOpen(false);
    }
  };

  const getLocalizedUrl = (url: string) => {
    // Always use locale-prefixed URLs for docs
    if (url.startsWith("/docs")) {
      return `/${locale}${url}`;
    }
    return url;
  };

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <>
      {/* Search Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 hover:text-gray-900 transition-colors"
      >
        <SearchIcon className="w-4 h-4" />
        <span className="hidden sm:inline">{t.buttonText}</span>
        <kbd className="hidden sm:inline px-1.5 py-0.5 text-xs bg-zinc-700 rounded">⌘K</kbd>
      </button>

      {/* Search Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm">
          <div
            ref={dialogRef}
            className="w-full max-w-xl bg-white border border-gray-300 rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-300">
              <SearchIcon className="w-5 h-5 text-gray-500" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.placeholder}
                className="flex-1 bg-transparent text-gray-900 placeholder-zinc-500 outline-none"
              />
              <kbd className="px-2 py-1 text-xs text-gray-400 bg-gray-100 rounded">ESC</kbd>
            </div>

            {/* Results */}
            <div className="max-h-96 overflow-y-auto">
              {query && results.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-400">
                  {t.noResults} &quot;{query}&quot;
                </div>
              ) : results.length > 0 ? (
                <div className="py-2">
                  {results.map((item, index) => (
                    <Link
                      key={item.id}
                      href={getLocalizedUrl(item.url)}
                      onClick={() => setIsOpen(false)}
                      className={`flex flex-col gap-1 px-4 py-3 ${
                        index === selectedIndex
                          ? "bg-emerald-600/20 border-l-2 border-emerald-500"
                          : "hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">
                          {item.section}
                        </span>
                        <span className="text-gray-900 font-medium">{item.title}</span>
                      </div>
                      <p className="text-sm text-gray-500 line-clamp-1">
                        {item.content}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6">
                  <p className="text-sm text-gray-400 mb-4">
                    {t.hint}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {["API Key", "threshold", "429", "namespace", "forget", "SDK"].map((term) => (
                      <button
                        key={term}
                        onClick={() => setQuery(term)}
                        className="px-3 py-1.5 text-sm text-gray-500 bg-gray-100 rounded-full hover:bg-gray-200 hover:text-gray-900 transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-gray-300 text-xs text-gray-400">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 rounded">↑</kbd>
                  <kbd className="px-1.5 py-0.5 bg-gray-100 rounded">↓</kbd>
                  {t.navigate}
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 rounded">↵</kbd>
                  {t.select}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}
