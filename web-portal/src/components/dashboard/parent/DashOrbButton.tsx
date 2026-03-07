"use client";

import { Sparkles } from "lucide-react";

interface DashOrbButtonProps {
  onClick: () => void;
}

export function DashOrbButton({ onClick }: DashOrbButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Ask Dash AI"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)",
        border: "none",
        boxShadow: "0 10px 30px rgba(124,58,237,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        cursor: "pointer",
        zIndex: 50,
      }}
    >
      <Sparkles size={22} />
    </button>
  );
}
