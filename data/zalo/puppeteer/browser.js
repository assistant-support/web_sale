'use server';

import 'server-only';

import puppeteer from 'puppeteer-core';

// Singleton Browser instance dùng chung cho toàn bộ process
// Dùng globalThis để tránh nhân đôi khi HMR / import lại trong Next

if (!globalThis.__zalo_puppeteer_browser) {
  globalThis.__zalo_puppeteer_browser = {
    browser: null,
    launching: null,
  };
}

const BROWSER_REG = globalThis.__zalo_puppeteer_browser;

/**
 * Lấy executablePath cho Chromium/Puppeteer.
 * - LOCAL: có thể đặt PUPPETEER_EXECUTABLE_PATH tuỳ môi trường.
 * - SERVER (Linux): thường là /usr/bin/chromium hoặc /usr/bin/chromium-browser.
 */
function resolveExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // Heuristic đơn giản cho một số môi trường phổ biến
  const candidates = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];

  // Không dùng fs.sync để tránh import thêm, Puppeteer sẽ báo lỗi rõ ràng nếu sai.
  return candidates[0];
}

/**
 * Tạo browser mới (chỉ gọi từ getBrowserInternal).
 */
async function launchBrowser() {
  const executablePath = resolveExecutablePath();

  const headless =
    process.env.ZALO_PUPPETEER_HEADLESS === 'false'
      ? false
      : 'new';

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-features=site-per-process',
  ];

  const browser = await puppeteer.launch({
    headless,
    executablePath,
    args,
  });

  browser.on('disconnected', () => {
    // Khi browser chết, reset registry để lần sau tạo lại
    BROWSER_REG.browser = null;
    BROWSER_REG.launching = null;
  });

  return browser;
}

/**
 * Lấy Browser singleton (tạo 1 lần, reuse lại).
 */
export async function getBrowser() {
  if (BROWSER_REG.browser) {
    return BROWSER_REG.browser;
  }

  if (BROWSER_REG.launching) {
    return BROWSER_REG.launching;
  }

  BROWSER_REG.launching = launchBrowser()
    .then((b) => {
      BROWSER_REG.browser = b;
      return b;
    })
    .finally(() => {
      BROWSER_REG.launching = null;
    });

  return BROWSER_REG.launching;
}

/**
 * Đóng browser (dùng khi shutdown graceful hoặc test).
 */
export async function closeBrowser() {
  if (!BROWSER_REG.browser) return;
  try {
    await BROWSER_REG.browser.close();
  } finally {
    BROWSER_REG.browser = null;
    BROWSER_REG.launching = null;
  }
}


