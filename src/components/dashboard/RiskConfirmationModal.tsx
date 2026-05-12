"use client";

import { useState } from "react";
import type { RiskModal } from "@/types/operations";

interface RiskConfirmationModalProps {
  modal: RiskModal;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RiskConfirmationModal({
  modal,
  onCancel,
  onConfirm,
}: RiskConfirmationModalProps) {
  const [checked, setChecked] = useState(false);

  if (!modal.open) return null;

  return (
    <div className="szn-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="szn-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Risk confirmation"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">{modal.title}</h2>

        {/* Impacts */}
        <h3 className="text-sm font-semibold szn-text-2 mb-2">What will happen</h3>
        <ul className="list-disc pl-5 space-y-1 mb-4">
          {modal.impacts.map((item) => (
            <li key={item} className="text-sm">{item}</li>
          ))}
        </ul>

        {/* Rollback */}
        <h3 className="text-sm font-semibold szn-text-2 mb-2">How to undo</h3>
        <ul className="list-disc pl-5 space-y-1 mb-4">
          {modal.rollback.map((item) => (
            <li key={item} className="text-sm">{item}</li>
          ))}
        </ul>

        {/* Confirmation checkbox */}
        <label className="szn-check-row">
          <input aria-label="Confirmation checkbox"
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="w-4 h-4 rounded accent-[var(--ink-900)]"
          />
          <span className="text-sm">I understand the impact of this action.</span>
        </label>

        {/* Action buttons */}
        <div className="szn-row mt-4">
          <button
            className="szn-btn szn-btn-secondary"
            type="button"
            onClick={() => { setChecked(false); onCancel(); }}
          >
            Cancel
          </button>
          <button
            className="szn-btn szn-btn-danger"
            type="button"
            disabled={!checked}
            onClick={() => { setChecked(false); onConfirm(); }}
          >
            Confirm
          </button>
        </div>
      </section>
    </div>
  );
}
