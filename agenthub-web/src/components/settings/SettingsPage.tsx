import { useRef, useState, useEffect, useCallback } from "react";
import { Form, Button } from "@douyinfe/semi-ui";
import { useUIStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { authApi } from "@/lib/api";
import { toast } from "sonner";
import { LLMConfigSection } from "./LLMConfigSection";
import { TokenUsagePanel } from "./TokenUsagePanel";
import { ThemeRadioCards } from "./ThemeRadioCards";
import { BgColorCards } from "./BgColorCards";

const NAV_ITEMS = [
  {
    id: "appearance",
    label: "外观",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "profile",
    label: "个人信息",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "llm",
    label: "LLM 配置",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="6" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M9 6h3M9 8h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M4 11c0-1.1.9-2 2-2s2 .9 2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "security",
    label: "安全",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="5" y="7" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="4" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "token",
    label: "Token 用量",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 12l3-4 3 2 3-5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
];

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const bgColor = useUIStore((s) => s.bgColor);
  const setBgColor = useUIStore((s) => s.setBgColor);
  const [activeId, setActiveId] = useState<string>("appearance");
  const activeTitle = NAV_ITEMS.find((i) => i.id === activeId)?.label ?? "外观";
  const [submittingPassword, setSubmittingPassword] = useState(false);
  const [submittingProfile, setSubmittingProfile] = useState(false);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s._setAuth);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const isScrolling = useRef(false);

  const registerSection = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      sectionRefs.current.set(id, el);
    } else {
      sectionRefs.current.delete(id);
    }
  }, []);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isScrolling.current) return;
      const top = container.scrollTop + 60;
      let closest: string = NAV_ITEMS[0].id;
      let minDist = Infinity;
      for (const item of NAV_ITEMS) {
        const el = sectionRefs.current.get(item.id);
        if (!el) continue;
        const dist = Math.abs(el.offsetTop - top);
        if (dist < minDist) {
          minDist = dist;
          closest = item.id;
        }
      }
      setActiveId(closest);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = sectionRefs.current.get(id);
    const container = contentRef.current;
    if (el && container) {
      isScrolling.current = true;
      setActiveId(id);
      container.scrollTo({ top: el.offsetTop - 20, behavior: "smooth" });
      setTimeout(() => { isScrolling.current = false; }, 500);
    }
  };

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, borderRadius: 8, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
      {/* Sidebar nav */}
      <nav style={{
        width: 180,
        flexShrink: 0,
        padding: "12px 0",
        borderRight: "1px solid var(--color-border-light)",
        background: "var(--color-bg-sidebar)",
      }}>
        <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--color-text-tertiary)", padding: "0 16px 8px", letterSpacing: "0.02em", textTransform: "uppercase" }}>
          设置
        </div>
        {NAV_ITEMS.map((item) => {
          const active = activeId === item.id;
          return (
            <div
              key={item.id}
              onClick={() => scrollTo(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: active ? 500 : 400,
                color: active ? "var(--color-gray-950)" : "var(--color-text-secondary)",
                background: active ? "var(--color-gray-100)" : "transparent",
                transition: "background 0.15s, color 0.15s",
                userSelect: "none",
              }}
            >
              {item.icon}
              {item.label}
            </div>
          );
        })}
      </nav>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--color-bg-sidebar)" }}>
        {/* Top bar: title + close */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          borderBottom: "1px solid var(--color-border-light)",
        }}>
          <span style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text-primary)" }}>{activeTitle}</span>
          <div
            onClick={onClose}
            style={{
              width: 28, height: 28,
              borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              color: "var(--color-text-secondary)",
            }}
          >
            <CloseIcon />
          </div>
        </div>

        {/* Scrollable content */}
        <div
          ref={contentRef}
          className="settings-page"
          style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}
        >
          {/* 外观 */}
          <section ref={(el) => registerSection("appearance", el)}>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 }}>
              外观
            </div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-tertiary)", marginBottom: 12 }}>
              选择界面主题，影响整体配色风格
            </div>
            <ThemeRadioCards value={theme} onChange={setTheme} />

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: "var(--font-size-md)", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 }}>背景底色</div>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-tertiary)", marginBottom: 10 }}>调整画布底色，仅影响浅色主题</div>
            </div>
            <BgColorCards value={bgColor} onChange={setBgColor} />
          </section>

          {/* 个人信息 */}
          <section
            ref={(el) => registerSection("profile", el)}
            style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--color-border-light)" }}
          >
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 }}>
              个人信息
            </div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-tertiary)", marginBottom: 12 }}>
              修改姓名和头像信息
            </div>
            {user ? (
              <Form
                style={{ maxWidth: 360 }}
                initValues={{ name: user.name, avatarUrl: user.avatarUrl || "" }}
                onSubmit={async (values) => {
                  const { name, avatarUrl } = values as Record<string, string>;
                  setSubmittingProfile(true);
                  try {
                    const res = await authApi.updateProfile({ name, avatarUrl: avatarUrl || undefined });
                    const updated = res.data.data;
                    const token = localStorage.getItem("token") || "";
                    const refreshToken = localStorage.getItem("refresh_token") || "";
                    setUser(updated, token, refreshToken);
                    toast.success("个人信息已更新");
                  } catch {
                    toast.error("更新失败，请重试");
                  } finally {
                    setSubmittingProfile(false);
                  }
                }}
              >
                {({ formState }) => (
                  <>
                    <Form.Input
                      field="name"
                      label="姓名"
                      rules={[{ required: true, message: "请输入姓名" }]}
                      placeholder="你的显示名称"
                      trigger="blur"
                    />
                    <Form.Input
                      field="email"
                      label="邮箱"
                      disabled
                      initValue={user.email}
                    />
                    <Form.Input
                      field="avatarUrl"
                      label="头像链接"
                      placeholder="https://..."
                      trigger="blur"
                    />
                    <Button
                      htmlType="submit"
                      loading={submittingProfile}
                      disabled={!formState.values?.name}
                      style={{
                        background: "var(--color-gray-950)",
                        color: "#fff",
                        border: "none",
                      }}
                    >
                      保存
                    </Button>
                  </>
                )}
              </Form>
            ) : (
              <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", padding: "12px 0" }}>
                请先登录
              </p>
            )}
          </section>

          {/* LLM 配置 */}
          <section
            ref={(el) => registerSection("llm", el)}
            style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--color-border-light)" }}
          >
            <LLMConfigSection />
          </section>

          {/* 安全 */}
          <section
            ref={(el) => registerSection("security", el)}
            style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--color-border-light)" }}
          >
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 }}>
              修改密码
            </div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-tertiary)", marginBottom: 12 }}>
              定期更换密码，保护账户安全
            </div>
            <Form
              style={{ maxWidth: 360 }}
              onSubmit={async (values) => {
                const { oldPassword, newPassword, confirmPassword } = values as Record<string, string>;
                if (newPassword !== confirmPassword) {
                  toast.error("两次输入的新密码不一致");
                  return;
                }
                setSubmittingPassword(true);
                try {
                  await authApi.changePassword(oldPassword, newPassword);
                  toast.success("密码修改成功");
                } catch {
                  toast.error("密码修改失败，请检查旧密码是否正确");
                } finally {
                  setSubmittingPassword(false);
                }
              }}
            >
              {({ formState }) => (
                <>
                  <Form.Input
                    field="oldPassword"
                    label="当前密码"
                    mode="password"
                    rules={[{ required: true, message: "请输入当前密码" }]}
                  />
                  <Form.Input
                    field="newPassword"
                    label="新密码"
                    mode="password"
                    rules={[
                      { required: true, message: "请输入新密码" },
                      { min: 6, message: "密码至少 6 位" },
                      { max: 128, message: "密码最多 128 位" },
                    ]}
                  />
                  <Form.Input
                    field="confirmPassword"
                    label="确认新密码"
                    mode="password"
                    rules={[{ required: true, message: "请再次输入新密码" }]}
                  />
                  <Button
                    htmlType="submit"
                    loading={submittingPassword}
                    disabled={!formState.values.oldPassword || !formState.values.newPassword || !formState.values.confirmPassword}
                    style={{
                      background: "var(--color-gray-950)",
                      color: "#fff",
                      border: "none",
                    }}
                  >
                    修改密码
                  </Button>
                </>
              )}
            </Form>
          </section>

          {/* Token 用量 */}
          <section
            ref={(el) => registerSection("token", el)}
            style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--color-border-light)" }}
          >
            <TokenUsagePanel />
          </section>
        </div>
      </div>
    </div>
  );
}
