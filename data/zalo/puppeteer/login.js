'use server';

import 'server-only';

import { getBrowser } from './browser';
import { ZaloAccount as ZaloAccountNew } from '@/models/zalo-account.model';
import connectMongo from '@/config/connectDB';

const ZALO_WEB_URL = process.env.ZALO_WEB_URL || 'https://chat.zalo.me/';

/**
 * Tạo context + page cho một tài khoản Zalo (dùng cookie đã lưu trong Mongo).
 * KHÔNG dùng để gửi API trực tiếp, chỉ để:
 *  - Giữ session
 *  - Duy trì WebSocket
 *  - Làm nền cho các hành động khác (keepalive, health check, refresh cookie sau này)
 */
export async function createZaloContextForAccount(accountKey) {
  if (!accountKey) throw new Error('accountKey is required');

  await connectMongo();
  const acc = await ZaloAccountNew.findOne({ accountKey }).lean();
  if (!acc) throw new Error('ZaloAccount not found for accountKey');

  const browser = await getBrowser();
  const context = await browser.createIncognitoBrowserContext();
  const page = await context.newPage();

  const userAgent =
    acc?.device?.userAgent ||
    process.env.ZALO_PUPPETEER_UA ||
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36';

  await page.setUserAgent(userAgent);

  // Khôi phục cookie nếu có
  const cookies = acc?.session?.cookies;
  if (cookies && Array.isArray(cookies.cookies)) {
    try {
      // Cookie JSON kiểu tough-cookie store → field cookies
      const puppeteerCookies = cookies.cookies.map((c) => ({
        name: c.key || c.name,
        value: c.value,
        domain: c.domain?.startsWith('.') ? c.domain.slice(1) : c.domain,
        path: c.path || '/',
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
        expires: typeof c.expires === 'number' ? c.expires : undefined,
      }));
      await page.setCookie(...puppeteerCookies);
    } catch (e) {
      console.error('[zalo puppeteer] setCookie error:', e);
    }
  }

  await page.goto(ZALO_WEB_URL, {
    waitUntil: 'networkidle2',
    timeout: 60_000,
  });

  return { context, page, account: acc };
}

/**
 * Health check cơ bản: kiểm tra page còn mở và Zalo Web đã load.
 */
export async function isZaloPageHealthy(page) {
  if (!page || page.isClosed()) return false;
  try {
    const ok = await page.evaluate(() => {
      // tuỳ phiên bản Zalo Web, có thể thay đổi điều kiện này
      const hasZaloGlobal =
        typeof window !== 'undefined' &&
        (window).Zalo !== undefined;
      const hasRoot = !!document.querySelector('#zalo-chat-app, #root, body');
      return hasZaloGlobal || hasRoot;
    });
    return !!ok;
  } catch {
    return false;
  }
}

/**
 * Gửi keepalive nhỏ để Zalo thấy phiên vẫn hoạt động (giống user thật).
 */
export async function sendKeepAlive(page) {
  if (!page || page.isClosed()) return;
  try {
    await page.evaluate(() => {
      // Gọi request nhẹ nhàng, không quan trọng kết quả
      fetch('/', { method: 'GET', cache: 'no-store' }).catch(() => {});
    });
  } catch (e) {
    console.error('[zalo puppeteer] keepalive error:', e?.message || e);
  }
}


