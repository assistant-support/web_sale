'use server';

import { revalidateTag } from 'next/cache';
import connectMongo from '@/config/connectDB';
import Service from '@/models/services.model';
import { getServiceAll, getServiceOne } from '@/data/services/handledata.db';
import checkAuthToken from '@/utils/checktoken';
import { uploadBufferToDrive } from '@/lib/drive';
import { Readable } from 'node:stream';

// ====== LOG HELPERS ======
const SERVICE_DEBUG = process.env.SERVICE_DEBUG === 'true';
const modTag = '[services.actions]';

function now() {
  const d = new Date();
  return d.toISOString();
}
function rid() {
  // cố gắng dùng crypto nếu có
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2, 10); }
}
function log(...args) {
  console.log(modTag, now(), ...args);
}
function dlog(...args) {
  if (SERVICE_DEBUG) console.log(modTag, now(), ...args);
}

// ====== HELPERS ======

function parseNumber(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

// data:image/<mime>;base64,<...>
function dataURLtoParts(dataURL) {
  if (typeof dataURL !== 'string') return null;
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataURL);
  if (!m) return null;
  const mime = m[1];
  const base64 = m[2];
  return { mime, buffer: Buffer.from(base64, 'base64') };
}

function fileNameFor(name = 'service') {
  const base = String(name)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  return `service-cover-${base || 'item'}-${Date.now()}.jpg`;
}

/** Upload banner (nếu là dataURL); trả về driveId (string) hoặc null nếu không đổi */
async function ensureDriveIdFromCover(cover, nameHint, reqId) {
  if (!cover) return null;

  const parts = dataURLtoParts(cover);
  if (!parts) {
    dlog(reqId, 'ensureDriveIdFromCover: not a dataURL, skip upload');
    return null;
  }

  dlog(reqId, 'ensureDriveIdFromCover: will upload to Drive', {
    mime: parts.mime,
    bufferLen: parts.buffer?.length,
  });
  try {
    // googleapis chấp nhận Buffer hoặc Stream; dùng Stream cho an toàn
    const stream = Readable.from(parts.buffer);
    const info = await uploadBufferToDrive({
      name: fileNameFor(nameHint),
      mime: parts.mime,
      buffer: stream,
    });
    dlog(reqId, 'ensureDriveIdFromCover: upload done', {
      id: info?.id,
      name: info?.name,
      webViewLink: info?.webViewLink,
    });
    return info?.id || null;
  } catch (err) {
    console.error(modTag, now(), reqId, 'ensureDriveIdFromCover: upload error', err?.message, err?.response?.data || err);
    return null;
  }
}

// ====== EXPORTED ACTIONS ======

export async function service_data(id) {
  const reqId = rid();
  log(reqId, 'service_data: enter', { id });
  try {
    const res = id ? await getServiceOne(id) : await getServiceAll();
    dlog(reqId, 'service_data: result', {
      type: id ? 'one' : 'all',
      size: Array.isArray(res) ? res.length : (res ? 1 : 0),
    });
    return res;
  } catch (err) {
    console.error(modTag, now(), reqId, 'service_data: error', err?.message);
    throw err;
  } finally {
    dlog(reqId, 'service_data: exit');
  }
}

export async function reloadServices() {
  const reqId = rid();
  log(reqId, 'reloadServices: revalidateTag("services")');
  revalidateTag('services');
}

/* -----------------------
   CREATE
----------------------- */
export async function createService(formData) {
  const reqId = rid();
  log(reqId, 'createService: enter');

  try {
    const me = await checkAuthToken();
    console.log(me);

    dlog(reqId, 'createService: session', { hasMe: !!me, meId: me?.id, email: me?.email });
    if (!me || !me.id) {
      log(reqId, 'createService: no user -> abort');
      return { success: false, error: 'Không xác thực được người dùng.' };
    }

    dlog(reqId, 'createService: connectMongo...');
    await connectMongo();
    dlog(reqId, 'createService: connectMongo OK');

    const {
      name,
      type,
      description = '',
      price,
      cover, // dataURL / drive link / id
    } = formData || {};
    dlog(reqId, 'createService: payload raw', {
      name, type,
      hasCover: !!cover,
      coverSnippet: typeof cover === 'string' ? cover.slice(0, 30) + '...' : typeof cover,
      hasPrice: price !== undefined,
      price,
    });

    const payload = {
      name: String(name || '').trim(),
      type,
      description: String(description || '').trim(),
    };

    if (price !== undefined) payload.price = parseNumber(price, 0);

    // upload banner nếu có
    if (cover) {
      const driveId = await ensureDriveIdFromCover(cover, payload.name, reqId);
      if (driveId) {
        payload.cover = driveId; // LƯU ID
        dlog(reqId, 'createService: set payload.cover = driveId', driveId);
      } else {
        dlog(reqId, 'createService: cover provided but no driveId obtained');
      }
    }

    dlog(reqId, 'createService: Service.create() with', {
      ...payload,
      description: payload.description?.slice(0, 40) + (payload.description?.length > 40 ? '...' : ''),
    });

    const created = await Service.create(payload);
    log(reqId, 'createService: created OK', { id: String(created._id), slug: created.slug, cover: created.cover });

    revalidateTag('services');
    dlog(reqId, 'createService: revalidated services');

    return { success: true, data: { id: String(created._id), slug: created.slug, cover: created.cover } };
  } catch (err) {
    if (err && err.code === 11000) {
      log(reqId, 'createService: dup key (name/slug)');
      return { success: false, error: 'Tên/slug dịch vụ đã tồn tại.' };
    }
    console.error(modTag, now(), reqId, 'createService: error', err?.message, err?.response?.data || err);
    return { success: false, error: 'Không thể tạo dịch vụ.' };
  } finally {
    dlog(reqId, 'createService: exit');
  }
}

/* -----------------------
   UPDATE
----------------------- */
export async function updateService(id, formData) {
  const reqId = rid();
  log(reqId, 'updateService: enter', { id });

  try {
    const me = await checkAuthToken();
    dlog(reqId, 'updateService: session', { hasMe: !!me, meId: me?.id });
    if (!me || !me.id) {
      log(reqId, 'updateService: no user -> abort');
      return { success: false, error: 'Không xác thực được người dùng.' };
    }

    dlog(reqId, 'updateService: connectMongo...');
    await connectMongo();
    dlog(reqId, 'updateService: connectMongo OK');

    const {
      name,
      type,
      description,
      price,
      cover,   // dataURL / drive link / id
      isActive,
    } = formData || {};

    dlog(reqId, 'updateService: payload raw', {
      name, type,
      hasCover: !!cover,
      coverSnippet: typeof cover === 'string' ? cover.slice(0, 30) + '...' : typeof cover,
      hasPrice: price !== undefined,
      isActive,
    });

    const svc = await Service.findById(id);
    if (!svc) {
      log(reqId, 'updateService: service not found');
      return { success: false, error: 'Dịch vụ không tồn tại.' };
    }

    if (name != null) svc.name = String(name).trim();
    if (type != null) svc.type = type;
    if (description != null) svc.description = String(description).trim();
    if (price != null) svc.price = parseNumber(price, svc.price ?? 0);
    if (typeof isActive === 'boolean') svc.isActive = isActive;
    if (cover) {
      const driveId = await ensureDriveIdFromCover(cover, svc.name, reqId);
      if (driveId) {
        svc.cover = driveId;
        dlog(reqId, 'updateService: updated cover driveId', driveId);
      } else {
        dlog(reqId, 'updateService: cover provided but no driveId obtained');
      }
    }

    await svc.save();
    log(reqId, 'updateService: saved OK', { id: String(svc._id), cover: svc.cover });

    revalidateTag('services');
    dlog(reqId, 'updateService: revalidated services');

    return { success: true, data: { cover: svc.cover } };
  } catch (err) {
    if (err && err.code === 11000) {
      log(reqId, 'updateService: dup key (name/slug)');
      return { success: false, error: 'Tên/slug dịch vụ đã tồn tại.' };
    }
    console.error(modTag, now(), reqId, 'updateService: error', err?.message, err?.response?.data || err);
    return { success: false, error: 'Không thể cập nhật dịch vụ.' };
  } finally {
    dlog(reqId, 'updateService: exit');
  }
}

/* -----------------------
   TOGGLE ACTIVE
----------------------- */
export async function setServiceActive(id, active) {
  const reqId = rid();
  log(reqId, 'setServiceActive: enter', { id, active });

  try {
    const me = await checkAuthToken();
    dlog(reqId, 'setServiceActive: session', { hasMe: !!me, meId: me?.id });
    if (!me || !me.id) {
      log(reqId, 'setServiceActive: no user -> abort');
      return { success: false, error: 'Không xác thực được người dùng.' };
    }

    await connectMongo();
    dlog(reqId, 'setServiceActive: connectMongo OK');

    const svc = await Service.findById(id);
    if (!svc) {
      log(reqId, 'setServiceActive: service not found');
      return { success: false, error: 'Dịch vụ không tồn tại.' };
    }

    svc.isActive = !!active;
    await svc.save();
    log(reqId, 'setServiceActive: saved OK', { isActive: svc.isActive });

    revalidateTag('services');
    dlog(reqId, 'setServiceActive: revalidated services');

    return { success: true, data: { isActive: svc.isActive } };
  } catch (err) {
    console.error(modTag, now(), reqId, 'setServiceActive: error', err?.message, err?.response?.data || err);
    return { success: false, error: 'Không thể đổi trạng thái dịch vụ.' };
  } finally {
    dlog(reqId, 'setServiceActive: exit');
  }
}

/* -----------------------
   HARD DELETE — không dùng
----------------------- */
export async function hardDeleteService(/* id */) {
  const reqId = rid();
  log(reqId, 'hardDeleteService: blocked by policy');
  return { success: false, error: 'Chính sách: không xóa cứng. Dùng setServiceActive(id, false).' };
}

// ====== MODULE LOADED ======
log('module loaded. RUNTIME:', process.env.NEXT_RUNTIME || 'node', 'SERVICE_DEBUG:', SERVICE_DEBUG);
