import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Auth", () => {
  test("未登录重定向到 /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test("登录页正常渲染", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 5000 });
  });

  test("错误密码停留登录页", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input").first().fill("dev@agenthub-dev.com");
    await page.locator('input[type="password"]').first().fill("wrong_password");
    await page.locator("button").filter({ hasText: /登录|登入|Login/ }).first().click();
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test("正确密码进入主页", async ({ page }) => {
    await login(page);
    await expect(page).not.toHaveURL(/\/login/);
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toMatch(/AgentHub|聊天|设置/);
  });
});
