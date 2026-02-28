'use server';

import 'server-only';

import { createZaloContextForAccount, isZaloPageHealthy, sendKeepAlive } from '../puppeteer/login';

// Simple promise queue per account để tránh spam hành động
class SimpleQueue {
  constructor({ interval = 1000, intervalCap = 8, concurrency = 1 } = {}) {
    this.interval = interval;
    this.intervalCap = intervalCap;
    this.concurrency = concurrency;
    this.queue = [];
    this.running = 0;
    this.windowStart = Date.now();
    this.windowCount = 0;
  }

  async add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this._next();
    });
  }

  _resetWindowIfNeeded() {
    const now = Date.now();
    if (now - this.windowStart >= this.interval) {
      this.windowStart = now;
      this.windowCount = 0;
    }
  }

  _next() {
    if (this.running >= this.concurrency) return;
    if (!this.queue.length) return;

    this._resetWindowIfNeeded();
    if (this.windowCount >= this.intervalCap) {
      const delay = this.interval - (Date.now() - this.windowStart);
      setTimeout(() => this._next(), Math.max(delay, 0));
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.running++;
    this.windowCount++;

    Promise.resolve()
      .then(() => item.task())
      .then((res) => item.resolve(res))
      .catch((err) => item.reject(err))
      .finally(() => {
        this.running--;
        this._next();
      });
  }
}

// Registry: accountKey -> client
if (!globalThis.__zalo_client_pool) {
  globalThis.__zalo_client_pool = new Map();
}

const POOL = globalThis.__zalo_client_pool;

function createEmptyClient(accountKey) {
  return {
    accountKey,
    context: null,
    page: null,
    lastHealthCheck: 0,
    queue: new SimpleQueue({
      interval: 1000,
      intervalCap: 8,
      concurrency: 1,
    }),
  };
}

export async function getZaloClient(accountKey) {
  return POOL.get(accountKey) || null;
}

export async function destroyZaloClient(accountKey) {
  const client = POOL.get(accountKey);
  if (!client) return;

  try {
    if (client.page && !client.page.isClosed()) {
      await client.page.close().catch(() => {});
    }
    if (client.context) {
      await client.context.close().catch(() => {});
    }
  } catch (e) {
    console.error('[zalo pool] destroy error:', e?.message || e);
  } finally {
    POOL.delete(accountKey);
  }
}

async function createClient(accountKey) {
  const { context, page } = await createZaloContextForAccount(accountKey);
  const client = createEmptyClient(accountKey);
  client.context = context;
  client.page = page;
  client.lastHealthCheck = Date.now();
  POOL.set(accountKey, client);
  return client;
}

async function isHealthy(client) {
  if (!client || !client.page) return false;
  const now = Date.now();
  // Không health-check quá dày
  if (now - client.lastHealthCheck < 15_000) {
    return true;
  }
  const ok = await isZaloPageHealthy(client.page);
  client.lastHealthCheck = now;
  return ok;
}

/**
 * ensureZaloClient(accountKey)
 * - Nếu đã có và còn khoẻ → trả về
 * - Nếu có nhưng chết → destroy + tạo lại
 * - Nếu chưa có → tạo mới
 */
export async function ensureZaloClient(accountKey) {
  if (!accountKey) throw new Error('accountKey is required');

  let client = POOL.get(accountKey);
  if (client && (await isHealthy(client))) {
    return client;
  }

  if (client) {
    await destroyZaloClient(accountKey);
  }

  client = await createClient(accountKey);
  return client;
}

/**
 * Thực thi 1 tác vụ an toàn trên client:
 * - Health-check trước
 * - Queue để không vượt rate limit
 */
export async function withZaloClient(accountKey, fn) {
  const client = await ensureZaloClient(accountKey);
  return client.queue.add(async () => {
    const stillOk = await isHealthy(client);
    if (!stillOk) {
      await destroyZaloClient(accountKey);
      const fresh = await ensureZaloClient(accountKey);
      return fn(fresh);
    }
    return fn(client);
  });
}

// Keepalive toàn cục: lặp qua các client và gửi ping
if (!globalThis.__zalo_keepalive_started) {
  globalThis.__zalo_keepalive_started = true;
  setInterval(() => {
    for (const client of POOL.values()) {
      if (!client.page || client.page.isClosed()) continue;
      sendKeepAlive(client.page).catch(() => {});
    }
  }, 60_000);
}


