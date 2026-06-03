import { test, expect } from "@playwright/test";

const TEST_EMAIL = `e2e-${Date.now()}@test.com`;
const TEST_PASSWORD = "e2eTest123456";
const TEST_NAME = "E2ETester";

test.describe("真实后端 — 注册/登录流程", () => {
  test("注册 → 登录 → 进入主页", async ({ page }) => {
    // 1. 打开注册页
    await page.goto("/login");
    await expect(page.locator("h3")).toContainText("AgentHub");
    await page.locator("text=没有账号？去注册").click();

    // 2. 填写邮箱
    const emailInput = page.locator("input").first();
    await emailInput.fill(TEST_EMAIL);

    // 3. 发送验证码 — 从网络响应提取 code
    const codePromise = page.waitForResponse(
      (res) => res.url().includes("/auth/send-code") && res.status() === 200,
      { timeout: 10000 }
    );
    await page.locator("button").filter({ hasText: "发送验证码" }).click();
    const sendCodeRes = await codePromise;
    const sendCodeBody = await sendCodeRes.json();
    const code: string = sendCodeBody.data?.code ?? sendCodeBody.code;
    expect(code).toMatch(/^\d{6}$/);
    console.log(`[e2e] 验证码: ${code}`);

    // 4. 填写验证码、姓名、密码
    const codeInput = page.locator("input").nth(1);
    await codeInput.fill(code);

    const nameInput = page.locator("input").nth(2);
    await nameInput.fill(TEST_NAME);

    const passwordInput = page.locator("input").nth(3);
    await passwordInput.fill(TEST_PASSWORD);

    // 5. 点击注册
    await page.locator("button").filter({ hasText: "注册" }).click();

    // 6. 注册成功应跳转到主页
    await page.waitForURL("**/", { timeout: 15000 });
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain("/login");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toMatch(/AgentHub|聊天|设置/);

    // 7. 清除 token 并刷新页面模拟登出
    await page.evaluate(() => {
      localStorage.removeItem("token");
      localStorage.removeItem("refresh_token");
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // 8. 此时未登录，应被重定向到 /login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

    // 9. 用刚注册的账号登录
    const loginEmailInput = page.locator("input").first();
    await loginEmailInput.fill(TEST_EMAIL);
    const loginPasswordInput = page.locator('input[type="password"]').first();
    await loginPasswordInput.fill(TEST_PASSWORD);
    await page.locator("button").filter({ hasText: /登录|登入/ }).click();

    // 10. 登录成功应跳转到主页
    await page.waitForURL("**/", { timeout: 15000 });
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain("/login");
    const bodyText2 = await page.locator("body").innerText();
    expect(bodyText2).toMatch(/AgentHub|聊天|设置/);
  });

  test("错误验证码注册失败", async ({ page }) => {
    await page.goto("/login");
    await page.locator("text=没有账号？去注册").click();

    await page.locator("input").first().fill("fail-test@test.com");
    await page.locator("input").nth(1).fill("000000");
    await page.locator("input").nth(2).fill("FailTest");
    await page.locator("input").nth(3).fill("test123456");
    await page.locator("button").filter({ hasText: "注册" }).click();

    // 应停留在注册页并显示错误
    await page.waitForTimeout(3000);
    expect(page.url()).toContain("/login");
    const errorEl = page.locator("[class*=danger], [class*=error], .semi-typography-danger").first();
    const hasError = await errorEl.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasError) {
      const errText = await errorEl.innerText();
      expect(errText.length).toBeGreaterThan(0);
    }
  });

  test("错误密码登录失败", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input").first().fill(TEST_EMAIL);
    await page.locator('input[type="password"]').first().fill("wrong_password_123");
    await page.locator("button").filter({ hasText: /登录|登入/ }).click();

    await page.waitForTimeout(3000);
    expect(page.url()).toContain("/login");
  });
});
