import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Form, Button, Typography, Divider } from "@douyinfe/semi-ui";
import type { FormApi } from "@douyinfe/semi-ui/lib/es/form";
import { useAuthStore } from "@/stores/authStore";

type Mode = "login" | "register";

export function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<FormApi>(null);

  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const sendCode = useAuthStore((s) => s.sendCode);

  const handleSendCode = useCallback(
    async (email: string) => {
      if (countdown > 0) return;
      try {
        setSending(true);
        setError(null);
        await sendCode(email);
        setCountdown(60);
        const timer = setInterval(() => {
          setCountdown((n) => {
            if (n <= 1) {
              clearInterval(timer);
              return 0;
            }
            return n - 1;
          });
        }, 1000);
      } catch {
        setError("发送失败，请稍后重试");
      } finally {
        setSending(false);
      }
    },
    [sendCode, countdown],
  );

  const handleSubmit = useCallback(
    async (values: Record<string, string>) => {
      setError(null);
      try {
        if (mode === "login") {
          await login(values.email, values.password);
        } else {
          await register(values.email, values.code, values.name, values.password);
        }
        navigate("/", { replace: true });
      } catch (e: unknown) {
        let msg = "操作失败";
        if (e instanceof Error) {
          const axErr = e as Error & { serverMessage?: string; response?: { data?: { message?: string } } };
          msg = axErr.serverMessage || axErr.response?.data?.message || e.message;
        }
        setError(msg);
      }
    },
    [mode, login, register, navigate],
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        background: "var(--color-bg-app)",
      }}
    >
      <div
        style={{
          width: 400,
          padding: 40,
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)",
          background: "var(--color-bg-elevated)",
        }}
      >
        <Typography.Title heading={3} style={{ textAlign: "center", marginBottom: 32 }}>
          AgentHub
        </Typography.Title>

        <Form
          getFormApi={(api) => { formRef.current = api; }}
          onSubmit={handleSubmit}
          layout="vertical"
          initValues={{ email: "", password: "", code: "", name: "" }}
        >
          {mode === "login" ? (
            <>
              <Form.Input
                field="email"
                label="邮箱"
                placeholder="请输入邮箱"
                rules={[
                  { required: true, message: "请输入邮箱" },
                  { type: "email", message: "邮箱格式不正确" },
                ]}
              />
              <Form.Input
                field="password"
                label="密码"
                placeholder="请输入密码"
                mode="password"
                rules={[{ required: true, message: "请输入密码" }]}
              />
              <Button
                theme="solid"
                type="primary"
                htmlType="submit"
                block
                style={{ marginTop: 16 }}
              >
                登录
              </Button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <Form.Input
                  field="email"
                  label="邮箱"
                  placeholder="请输入邮箱"
                  style={{ flex: 1 }}
                  rules={[
                    { required: true, message: "请输入邮箱" },
                    { type: "email", message: "邮箱格式不正确" },
                  ]}
                />
                <Button
                  theme="light"
                  onClick={() => {
                    const values = formRef.current?.getValues();
                    const email = values?.email as string;
                    if (email) handleSendCode(email);
                  }}
                  loading={sending}
                  disabled={countdown > 0}
                  style={{ marginBottom: 4, whiteSpace: "nowrap" }}
                >
                  {countdown > 0 ? `${countdown}s` : "发送验证码"}
                </Button>
              </div>
              <Form.Input
                field="code"
                label="验证码"
                placeholder="请输入6位验证码"
                maxLength={6}
                rules={[{ required: true, message: "请输入验证码" }]}
              />
              <Form.Input
                field="name"
                label="姓名"
                placeholder="请输入您的姓名"
                rules={[{ required: true, message: "请输入姓名" }]}
              />
              <Form.Input
                field="password"
                label="密码"
                placeholder="至少6位密码"
                mode="password"
                rules={[{ required: true, message: "请输入密码" }, { min: 6, message: "至少6位" }]}
              />
              <Button
                theme="solid"
                type="primary"
                htmlType="submit"
                block
                style={{ marginTop: 16 }}
              >
                注册
              </Button>
            </>
          )}
        </Form>

        {error && (
          <Typography.Text type="danger" style={{ display: "block", marginTop: 16, textAlign: "center" }}>
            {error}
          </Typography.Text>
        )}

        <Divider margin="24px 0 0 0" />

        <div style={{ textAlign: "center", marginTop: 16 }}>
          {mode === "login" ? (
            <Typography.Text link onClick={() => { setMode("register"); setError(null); }}>
              没有账号？去注册
            </Typography.Text>
          ) : (
            <Typography.Text link onClick={() => { setMode("login"); setError(null); }}>
              已有账号？去登录
            </Typography.Text>
          )}
        </div>
      </div>
    </div>
  );
}
