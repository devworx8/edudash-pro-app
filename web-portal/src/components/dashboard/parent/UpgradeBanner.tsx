"use client";

interface UpgradeBannerProps {
  title: string;
  description: string;
  onUpgrade: () => void;
}

export function UpgradeBanner({ title, description, onUpgrade }: UpgradeBannerProps) {
  return (
    <div
      className="card"
      style={{
        border: "1px solid rgba(139, 92, 246, 0.4)",
        background: "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(236,72,153,0.12))",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>{description}</div>
      </div>
      <button className="btn btnPrimary" onClick={onUpgrade}>
        Upgrade
      </button>
    </div>
  );
}
