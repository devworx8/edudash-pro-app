"use client";

import { useTranslation } from "react-i18next";

interface AdBannerPlaceholderProps {
  onUpgrade: () => void;
  variant?: "top" | "bottom";
}

export function AdBannerPlaceholder({ onUpgrade, variant = "top" }: AdBannerPlaceholderProps) {
  const { t } = useTranslation();
  return (
    <div
      className="card"
      style={{
        border: "1px dashed var(--border)",
        background: "var(--surface-1)",
        textAlign: "center",
        padding: 16,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        {variant === "top"
          ? t("dashboard.parent.ad_banner.top_title", { defaultValue: "Sponsored learning tips" })
          : t("dashboard.parent.ad_banner.bottom_title", { defaultValue: "Support the app" })}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
        {t("dashboard.parent.ad_banner.description", { defaultValue: "Upgrade to remove ads and unlock extra parent tools." })}
      </div>
      <button className="btn btnPrimary" onClick={onUpgrade}>
        {t("dashboard.parent.ad_banner.cta", { defaultValue: "Upgrade" })}
      </button>
    </div>
  );
}
