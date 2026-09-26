/** Вход по телефону и коду: канал-заглушка показывает код на экране (AUTH_CHANNEL=log) */
export async function loginByPhone(page, base, phone) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.getByLabel(/Телефон/i).first().fill(phone);
  await page.getByRole("button", { name: /Получить код/ }).click();
  await page.waitForTimeout(1500);
  const text = await page.locator("body").innerText();
  const code = text.match(/Ваш код — (\d{6})/)?.[1] ?? text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`Код не показан. Экран: ${text.slice(0, 300)}`);
  await page.getByLabel(/Код/i).first().fill(code);
  await page.getByRole("button", { name: /^Войти$|Войти в систему/ }).click();
  await page.waitForTimeout(2500);
  return { code, url: page.url() };
}
