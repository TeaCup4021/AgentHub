import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export async function login(page: Page) {
  await page.goto("/login");
  await page.waitForTimeout(500);
  await page.locator("input").first().fill("test@agenthub.dev");
  await page.locator('input[type="password"]').first().fill("123456");
  await page.locator("button").filter({ hasText: /登录|登入|Login/ }).first().click();
  await page.waitForURL("**/", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

export async function openExistingConversation(page: Page) {
  // Click on an existing conversation from the sidebar
  const convItem = page.locator("[class*='conv-item'], [class*='ConversationItem']").first();
  if (await convItem.isVisible({ timeout: 5000 }).catch(() => false)) {
    await convItem.click();
    await page.waitForTimeout(2000);
  }
  // Look for the chat input
  const editor = page.locator("[contenteditable]").first();
  const textarea = page.locator("textarea").first();
  const isEditor = await editor.isVisible({ timeout: 3000 }).catch(() => false);
  const isTextarea = await textarea.isVisible({ timeout: 3000 }).catch(() => false);
  if (!isEditor && !isTextarea) {
    // Try clicking on a specific conversation link
    const firstConvLink = page.locator("text=Final E2E").first();
    if (await firstConvLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstConvLink.click();
      await page.waitForTimeout(2000);
    }
  }
}
