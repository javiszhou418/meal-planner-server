import { chromium } from 'playwright';
const TIMEOUT = 8_000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';
export async function scrapeImageUrl(query: string): Promise<string | null> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: UA });
    const page = await ctx.newPage();
    await page.goto(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query+' chinese food dish')}`,{waitUntil:'domcontentloaded',timeout:TIMEOUT});
    await page.locator('img.YQ4gaf').first().click({timeout:TIMEOUT});
    const fullImg = page.locator('img.sFlh5c, img.r48jcc').first();
    await fullImg.waitFor({state:'visible',timeout:TIMEOUT});
    const src = await fullImg.getAttribute('src');
    if (!src||src.startsWith('data:')) return null;
    return src;
  } catch { return null; }
  finally { await browser.close(); }
}
