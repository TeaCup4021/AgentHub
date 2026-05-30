import type { Theme } from "@/stores/uiStore";

interface Option {
  key: Theme;
  label: string;
}

const options: Option[] = [
  { key: "light", label: "浅色" },
  { key: "dark", label: "深色" },
  { key: "system", label: "跟随系统" },
];

function ThumbLight() {
  return (
    <div style={{ background: "#f5f6f7", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 14, background: "#fff", borderBottom: "1px solid #e8eaef", display: "flex", alignItems: "center", padding: "0 6px", gap: 3 }}>
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#e8eaef", display: "block" }} />
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#e8eaef", display: "block" }} />
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#e8eaef", display: "block" }} />
      </div>
      <div style={{ display: "flex", flex: 1 }}>
        <div style={{ width: 28, background: "#fff", borderRight: "1px solid #e8eaef", padding: "4px 3px", display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ height: 5, borderRadius: 2, background: "#3370ff", display: "block" }} />
          <span style={{ height: 5, borderRadius: 2, background: "#e8eaef", display: "block" }} />
          <span style={{ height: 5, borderRadius: 2, background: "#e8eaef", display: "block" }} />
          <span style={{ height: 5, borderRadius: 2, background: "#e8eaef", display: "block" }} />
        </div>
        <div style={{ flex: 1, padding: 4, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ height: 4, borderRadius: 2, background: "#e8eaef", width: "80%", display: "block" }} />
          <span style={{ height: 4, borderRadius: 2, background: "#e8eaef", width: "60%", display: "block" }} />
          <span style={{ height: 4, borderRadius: 2, background: "#e8eaef", width: "80%", display: "block" }} />
          <span style={{ height: 4, borderRadius: 2, background: "#e8eaef", width: "40%", display: "block" }} />
          <span style={{ height: 4, borderRadius: 2, background: "#e8eaef", width: "60%", display: "block" }} />
        </div>
      </div>
    </div>
  );
}

function ThumbDark() {
  return (
    <div style={{ background: "#1a1a2e", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 14, background: "#16213e", borderBottom: "1px solid #0f3460", display: "flex", alignItems: "center", padding: "0 6px", gap: 3 }}>
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#0f3460", display: "block" }} />
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#0f3460", display: "block" }} />
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#0f3460", display: "block" }} />
      </div>
      <div style={{ display: "flex", flex: 1 }}>
        <div style={{ width: 28, background: "#16213e", borderRight: "1px solid #0f3460", padding: "4px 3px", display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ height: 5, borderRadius: 2, background: "#3370ff", display: "block" }} />
          <span style={{ height: 5, borderRadius: 2, background: "#0f3460", display: "block" }} />
          <span style={{ height: 5, borderRadius: 2, background: "#0f3460", display: "block" }} />
          <span style={{ height: 5, borderRadius: 2, background: "#0f3460", display: "block" }} />
        </div>
        <div style={{ flex: 1, padding: 4, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ height: 4, borderRadius: 2, background: "#0f3460", width: "80%", display: "block" }} />
          <span style={{ height: 4, borderRadius: 2, background: "#0f3460", width: "60%", display: "block" }} />
          <span style={{ height: 4, borderRadius: 2, background: "#0f3460", width: "80%", display: "block" }} />
          <span style={{ height: 4, borderRadius: 2, background: "#0f3460", width: "40%", display: "block" }} />
          <span style={{ height: 4, borderRadius: 2, background: "#0f3460", width: "60%", display: "block" }} />
        </div>
      </div>
    </div>
  );
}

function ThumbSystem() {
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ width: "50%", background: "#f5f6f7", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 14, background: "#fff", borderBottom: "1px solid #e8eaef" }} />
        <div style={{ flex: 1, padding: "4px 3px", display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ height: 4, borderRadius: 2, background: "#e8eaef", width: "80%", display: "block" }} />
          <span style={{ height: 4, borderRadius: 2, background: "#e8eaef", width: "60%", display: "block" }} />
          <span style={{ height: 4, borderRadius: 2, background: "#e8eaef", width: "70%", display: "block" }} />
          <span style={{ height: 4, borderRadius: 2, background: "#e8eaef", width: "50%", display: "block" }} />
        </div>
      </div>
      <div style={{ width: 1, background: "#c0c4cc", flexShrink: 0 }} />
      <div style={{ width: "50%", background: "#1a1a2e", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 14, background: "#16213e", borderBottom: "1px solid #0f3460" }} />
        <div style={{ flex: 1, padding: "4px 3px", display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ height: 4, borderRadius: 2, background: "#0f3460", width: "80%", display: "block" }} />
          <span style={{ height: 4, borderRadius: 2, background: "#0f3460", width: "60%", display: "block" }} />
          <span style={{ height: 4, borderRadius: 2, background: "#0f3460", width: "70%", display: "block" }} />
          <span style={{ height: 4, borderRadius: 2, background: "#0f3460", width: "50%", display: "block" }} />
        </div>
      </div>
    </div>
  );
}

function thumbFor(key: Theme) {
  switch (key) {
    case "light": return <ThumbLight />;
    case "dark": return <ThumbDark />;
    case "system": return <ThumbSystem />;
  }
}

function CheckIcon() {
  return (
    <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#3370ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
        <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function ThemeRadioCards({ value, onChange }: { value: Theme; onChange: (t: Theme) => void }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      {options.map((opt) => {
        const selected = value === opt.key;
        return (
          <div
            key={opt.key}
            onClick={() => onChange(opt.key)}
            style={{
              width: 180,
              borderRadius: 8,
              border: selected ? "2px solid #3370ff" : "2px solid #e8eaef",
              background: selected ? "rgba(51,112,255,0.04)" : "#fff",
              padding: 10,
              cursor: "pointer",
              flexShrink: 0,
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <div style={{ height: 72, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
              {thumbFor(opt.key)}
            </div>
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
