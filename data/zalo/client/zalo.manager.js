'use server';

import 'server-only';

import connectMongo from '@/config/connectDB';
import { ZaloAccount as ZaloAccountNew } from '@/models/zalo-account.model';
import { ensureZaloClient } from './zalo.pool';

let preloadStarted = false;

/**
 * Preload tất cả tài khoản Zalo đang active vào pool.
 * Gọi 1 lần khi server/Agenda start.
 */
export async function preloadZaloClients() {
  if (preloadStarted) return;
  preloadStarted = true;

  try {
    await connectMongo();
    const activeAccounts = await ZaloAccountNew.find({ status: 'active' })
      .select('accountKey')
      .lean();

    for (const acc of activeAccounts) {
      const key = acc.accountKey;
      if (!key) continue;
      try {
        await ensureZaloClient(key);
      } catch (e) {
        console.error('[zalo manager] preload account failed:', key, e?.message || e);
      }
    }
  } catch (e) {
    console.error('[zalo manager] preloadZaloClients error:', e?.message || e);
  }
}


