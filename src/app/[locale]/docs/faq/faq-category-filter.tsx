"use client";

import { useState, useCallback } from "react";

interface Props {
  categoryKeys: string[];
  categories: Record<string, string>;
}

export function FAQCategoryFilter({ categoryKeys, categories }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>("all");

  // Get translated category display name
  const getCategoryDisplayName = (categoryKey: string) => {
    return categories[categoryKey as keyof typeof categories] || categoryKey;
  };

  // Filter FAQ items by category using DOM manipulation
  const handleCategoryChange = useCallback((categoryKey: string) => {
    setActiveCategory(categoryKey);

    // Filter FAQ items in the DOM
    const faqList = document.getElementById("faq-list");
    if (!faqList) return;

    const items = faqList.querySelectorAll("details[data-category]");
    items.forEach((item) => {
      const itemCategory = item.getAttribute("data-category");
      if (categoryKey === "all" || itemCategory === categoryKey) {
        (item as HTMLElement).style.display = "";
      } else {
        (item as HTMLElement).style.display = "none";
      }
    });
  }, []);

  return (
    <div className="flex flex-wrap gap-2 mb-8 justify-center">
      {categoryKeys.map((catKey) => (
        <button
          key={catKey}
          onClick={() => handleCategoryChange(catKey)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            activeCategory === catKey
              ? "bg-szn-accent text-white"
              : "bg-szn-surface-1 text-szn-text-2 hover:bg-szn-surface hover:text-szn-text-1"
          }`}
        >
          {getCategoryDisplayName(catKey)}
        </button>
      ))}
    </div>
  );
}
