"use client";

import { X } from "lucide-react";

interface OnboardingHintProps {
  title: string;
  message: string;
  onDismiss: () => void;
}

export function OnboardingHint({ title, message, onDismiss }: OnboardingHintProps) {
  return (
    <div
      className="card"
      style={{
        border: "1px dashed var(--primary)",
        background: "var(--surface-1)",
        position: "relative",
      }}
    >
      <button
        onClick={onDismiss}
        aria-label="Dismiss hint"
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--muted)",
        }}
      >
        <X size={16} />
      </button>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>{message}</div>
    </div>
  );
}
