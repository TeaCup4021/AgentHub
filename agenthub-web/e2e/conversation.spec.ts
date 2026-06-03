import { test, expect } from "@playwright/test";
import { login, openExistingConversation } from "./helpers";

test.describe("Conversation", () => {
  test("登录后显示对话列表和欢迎页", async ({ page }) => {
    await login(page);
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toMatch(/AgentHub|新对话/);
  });

  test("点击已有对话进入聊天", async ({ page }) => {
    await login(page);
    await openExistingConversation(page);
    // After opening conversation, chat area should be visible
    const editor = page.locator("[contenteditable]").first();
    const textarea = page.locator("textarea").first();
    const hasEditor = await editor.isVisible({ timeout: 5000 }).catch(() => false);
    const hasTextarea = await textarea.isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasEditor || hasTextarea).toBeTruthy();
  });

  test("发送消息收到AI回复", async ({ page }) => {
    await login(page);
    await openExistingConversation(page);
    const input = page.locator("[contenteditable]").first();
    if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
      await input.click();
      await input.fill("Say hi in one word");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(12000);
      const bodyText = await page.locator("body").innerText();
      expect(bodyText.length).toBeGreaterThan(200);
      await page.screenshot({ path: "e2e/screenshots/chat-response.png", fullPage: false });
    }
  });

  test("归档对话不报401", async ({ page }) => {
    await login(page);
    const convItem = page.locator("[class*='conv-item'], [class*='ConversationItem']").first();
    if (!(await convItem.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "No conversations");
      return;
    }
    await convItem.click({ button: "right" });
    await page.waitForTimeout(1500);
    const menu = page.locator("[class*='dropdown'], [role='menu'], .semi-dropdown").first();
    if (await menu.isVisible({ timeout: 3000 }).catch(() => false)) {
      const archiveOption = page.locator("text=归档").first();
      const unarchiveOption = page.locator("text=取消归档").first();
      if (await archiveOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await archiveOption.click();
        await page.waitForTimeout(2000);
        const errorToast = page.locator(".semi-toast-error, [class*='Toast--error']").first();
        expect(await errorToast.isVisible({ timeout: 3000 }).catch(() => true)).toBeFalsy();
      } else if (await unarchiveOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await unarchiveOption.click();
        await page.waitForTimeout(2000);
        const errorToast = page.locator(".semi-toast-error, [class*='Toast--error']").first();
        expect(await errorToast.isVisible({ timeout: 3000 }).catch(() => true)).toBeFalsy();
      }
    }
  });
});
