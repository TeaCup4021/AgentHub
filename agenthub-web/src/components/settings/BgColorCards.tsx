import type { BgColor } from "@/stores/uiStore";

interface Option {
  key: BgColor;
  label: string;
  color: string;
}

const options: Option[] = [
  { key: "#ECEDEE", label: "素云灰", color: "#ECEDEE" },
  { key: "#E6F1F4", label: "湖水蓝", color: "#E6F1F4" },
  { key: "#DCE5F7", label: "烟波蓝", color: "#DCE5F7" },
  { key: "#4872AD", label: "深海蓝", color: "#4872AD" },
];

function CheckIcon() {
  return (
    <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#3370ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
        <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function BgColorCards({ value, onChange }: { value: BgColor; onChange: (c: BgColor) => void }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {options.map((opt) => {
        const selected = value === opt.key;
        return (
          <div
            key={opt.key}
            onClick={() => onChange(opt.key)}
            style={{
              width: 120,
              borderRadius: 8,
              border: "none",
              background: selected ? "rgba(51,112,255,0.06)" : "transparent",
              padding: "10px 8px 8px",
              cursor: "pointer",
              flexShrink: 0,
              textAlign: "center",
              transition: "background 0.15s",
            }}
          >
            <div style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: opt.color,
              margin: "0 auto 8px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{opt.label}</span>
              {selected && <CheckIcon />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
