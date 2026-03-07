"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Image as ImageIcon, Upload } from "lucide-react";

interface ChatWallpaperPickerProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSelect: (value: { type: "preset" | "url"; value: string }) => void;
}

const PRESETS: { key: string; label: string; css: string }[] = [
  {
    key: "purple-glow",
    label: "Purple Glow",
    css: "linear-gradient(180deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
  },
  {
    key: "midnight",
    label: "Midnight",
    css: "linear-gradient(180deg, #0a0f1e 0%, #1a1a2e 50%, #0a0f1e 100%)",
  },
  {
    key: "ocean-deep",
    label: "Ocean Deep",
    css: "linear-gradient(180deg, #0c4a6e 0%, #164e63 50%, #0f172a 100%)",
  },
  {
    key: "forest-night",
    label: "Forest Night",
    css: "linear-gradient(180deg, #14532d 0%, #1e3a3a 50%, #0f172a 100%)",
  },
  {
    key: "sunset-warm",
    label: "Sunset Warm",
    css: "linear-gradient(180deg, #7c2d12 0%, #4a1d1d 50%, #0f172a 100%)",
  },
  {
    key: "dark-slate",
    label: "Dark Slate",
    css: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)",
  },
];

export const ChatWallpaperPicker = ({ isOpen, onClose, userId, onSelect }: ChatWallpaperPickerProps) => {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const triggerFilePicker = () => fileInputRef.current?.click();

  const handleUpload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      // Convert to base64 data URL for local storage (avoids bucket issues)
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          onSelect({ type: "url", value: dataUrl });
          onClose();
        }
      };
      reader.onerror = () => {
        setError("Failed to read image file");
      };
      reader.readAsDataURL(file);
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(92vw, 680px)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          boxShadow: "0 20px 80px rgba(0,0,0,0.35)",
          padding: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, color: "var(--text)", fontSize: 18, fontWeight: 700 }}>Chat wallpaper</h3>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Presets */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                onSelect({ type: "preset", value: p.key });
                onClose();
              }}
              style={{
                height: 100,
                borderRadius: 12,
                border: "1px solid var(--border)",
                overflow: "hidden",
                cursor: "pointer",
                position: "relative",
                background: p.css,
              }}
              title={p.label}
            >
              <div
                style={{
                  position: "absolute",
                  left: 8,
                  bottom: 8,
                  padding: "4px 8px",
                  borderRadius: 6,
                  background: "rgba(0,0,0,0.35)",
                  color: "white",
                  fontSize: 12,
                }}
              >
                {p.label}
              </div>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--border)", margin: "14px 0" }} />

        {/* Upload */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ImageIcon size={18} />
            <span style={{ color: "var(--muted)", fontSize: 14 }}>Upload your own image</span>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.currentTarget.value = "";
              }}
            />
            <button
              onClick={triggerFilePicker}
              disabled={uploading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: uploading ? "var(--surface-2)" : "var(--surface)",
                cursor: uploading ? "not-allowed" : "pointer",
              }}
            >
              <Upload size={16} />
              {uploading ? "Uploading..." : "Choose file"}
            </button>
          </div>
        </div>

        {error && (
          <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>
        )}
      </div>
    </div>
  );
};

export default ChatWallpaperPicker;
