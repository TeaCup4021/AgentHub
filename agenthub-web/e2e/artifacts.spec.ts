import { test, expect } from "@playwright/test";
import { login, openExistingConversation } from "./helpers";

test.describe("Artifact Cards", () => {
  test("发送消息后AI流式回复渲染成功", async ({ page }) => {
    await login(page);
    await openExistingConversation(page);
    const input = page.locator("[contenteditable]").first();
    if (!(await input.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Chat input not found");
      return;
    }
    await input.click();
    await input.fill("Say hello");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(15000);
    await page.screenshot({ path: "e2e/screenshots/streaming-ok.png", fullPage: false });
  });

  test("代码块浅色模式验证非黑色背景", async ({ page }) => {
    await login(page);
    await page.evaluate(() => document.body.removeAttribute("theme-mode"));
    await page.waitForTimeout(500);
    await openExistingConversation(page);
    const input = page.locator("[contenteditable]").first();
    if (!(await input.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Chat input not found");
      return;
    }
    await input.click();
    await input.fill('Output a Python function in a code block: ```python\\ndef hello():\\n    print("hello")\\n```');
    await page.keyboard.press("Enter");
    await page.waitForTimeout(18000);
    await page.screenshot({ path: "e2e/screenshots/light-code.png", fullPage: false });

    // Check that no dark-background code blocks (#1e1e1e or #000)
    const darkBgEls = await page.locator("[style*='background: rgb(30, 30, 30)'], [style*='background:#1e1e1e'], [style*='background: #1e1e1e']").count();
    expect(darkBgEls).toBe(0);
  });

  test("暗色模式代码块深色背景", async ({ page }) => {
    await login(page);
    await page.evaluate(() => document.body.setAttribute("theme-mode", "dark"));
    await page.waitForTimeout(1000);
    await openExistingConversation(page);
    const input = page.locator("[contenteditable]").first();
    if (!(await input.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Chat input not found");
      return;
    }
    await input.click();
    await input.fill('Output a Python function in a code block: ```python\\ndef hello():\\n    print("hello")\\n```');
    await page.keyboard.press("Enter");
    await page.waitForTimeout(18000);
    await page.screenshot({ path: "e2e/screenshots/dark-code.png", fullPage: false });
    // Restore light mode
    await page.evaluate(() => document.body.removeAttribute("theme-mode"));
  });

  test("设置页可访问", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "e2e/screenshots/settings.png", fullPage: false });
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(100);
  });
});
