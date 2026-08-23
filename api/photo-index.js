const { list, put, issueSignedToken, presignUrl } = require('@vercel/blob');

const CATALOG_PATH = 'photo-library/_catalog.json';

function blobAuthOptions() {
  const options = {};
  if (process.env.VERCEL_OIDC_TOKEN) options.oidcToken = process.env.VERCEL_OIDC_TOKEN;
  if (process.env.BLOB_STORE_ID) options.storeId = process.env.BLOB_STORE_ID;
  return options;
}

function parsePath(pathname) {
  const parts = String(pathname || '').split('/');
  const airport = parts[1] || 'UNKNOWN';
  const base = parts[parts.length - 1] || '';
  const m = base.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_(.+?)(?:-[A-Za-z0-9]{20,})?\.jpg$/i);
  let capturedAt = null;
  let sourceName = base;
  if (m) {
    capturedAt = m[1].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z');
    sourceName = m[2] + '.jpg';
  }
  return { airport, capturedAt, sourceName };
}

async function readCatalog() {
  try {
    const page = await list({ prefix: CATALOG_PATH, limit: 10, ...blobAuthOptions() });
    const hit = (page.blobs || []).find(b => b.pathname === CATALOG_PATH);
    if (!hit) return { version: 1, updatedAt: null, items: {} };

    const token = await issueSignedToken({
      pathname: CATALOG_PATH,
      operations: ['get'],
      validUntil: Date.now() + 10 * 60 * 1000,
      ...blobAuthOptions()
    });
    const { presignedUrl } = await presignUrl(token, {
      operation: 'get',
      pathname: CATALOG_PATH,
      access: 'private',
      validUntil: Date.now() + 5 * 60 * 1000,
      useCache: false
    });
    const response = await fetch(presignedUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('catalog HTTP ' + response.status);
    const data = await response.json();
    return data && typeof data === 'object' ? data : { version: 1, updatedAt: null, items: {} };
  } catch (error) {
    console.warn('Photo catalog read fallback', error.message);
    return { version: 1, updatedAt: null, items: {} };
  }
}

async function writeCatalog(catalog) {
  catalog.version = 1;
  catalog.updatedAt = new Date().toISOString();
  await put(CATALOG_PATH, JSON.stringify(catalog, null, 2), {
    access: 'private',
    allowOverwrite: true,
    contentType: 'application/json',
    ...blobAuthOptions()
  });
}

async function allPhotoBlobs() {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix: 'photo-library/', limit: 1000, cursor, ...blobAuthOptions() });
    for (const b of page.blobs || []) {
      if (b.pathname !== CATALOG_PATH && /\.(jpg|jpeg|webp|png)$/i.test(b.pathname)) out.push(b);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor && out.length < 10000);
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const pathname = String(body.pathname || '');
      if (!pathname.startsWith('photo-library/') || pathname === CATALOG_PATH) return res.status(400).json({ ok: false, error: 'Invalid photo pathname' });
      const status = ['CONFIRMED', 'PROBABLE', 'UNKNOWN'].includes(String(body.status || '').toUpperCase()) ? String(body.status).toUpperCase() : 'UNKNOWN';
      const registration = String(body.registration || '').trim().toUpperCase().slice(0, 20).replace(/^40-/, '4O-');
      const catalog = await readCatalog();
      catalog.items = catalog.items || {};
      catalog.items[pathname] = {
        status,
        registration: registration || null,
        airline: String(body.airline || '').trim().slice(0, 80) || null,
        aircraftType: String(body.aircraftType || '').trim().slice(0, 80) || null,
        notes: String(body.notes || '').trim().slice(0, 500) || null,
        usable: body.usable !== false,
        updatedAt: new Date().toISOString()
      };
      await writeCatalog(catalog);
      return res.status(200).json({ ok: true, item: catalog.items[pathname], updatedAt: catalog.updatedAt });
    }

    if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    const [blobs, catalog] = await Promise.all([allPhotoBlobs(), readCatalog()]);
    const validUntil = Date.now() + 20 * 60 * 1000;
    let signedToken = null;
    if (blobs.length) {
      signedToken = await issueSignedToken({
        pathname: '*',
        operations: ['get'],
        validUntil: Date.now() + 60 * 60 * 1000,
        ...blobAuthOptions()
      });
    }
    const items = [];
    for (const b of blobs) {
      const parsed = parsePath(b.pathname);
      let previewUrl = null;
      if (signedToken) {
        const signed = await presignUrl(signedToken, {
          operation: 'get', pathname: b.pathname, access: 'private', validUntil
        });
        previewUrl = signed.presignedUrl;
      }
      items.push({
        pathname: b.pathname,
        size: b.size,
        uploadedAt: b.uploadedAt || null,
        previewUrl,
        ...parsed,
        catalog: catalog.items?.[b.pathname] || { status: 'UNKNOWN', registration: null, usable: true }
      });
    }
    items.sort((a, b) => String(a.capturedAt || a.uploadedAt || '').localeCompare(String(b.capturedAt || b.uploadedAt || '')));

    // Group nearby shooting moments; 12 seconds is enough to collect a short aircraft burst without merging long gaps.
    let group = 0, last = null;
    for (const item of items) {
      const t = Date.parse(item.capturedAt || item.uploadedAt || 0);
      if (last === null || !Number.isFinite(t) || Math.abs(t - last) > 12000) group++;
      item.momentId = 'M' + String(group).padStart(4, '0');
      if (Number.isFinite(t)) last = t;
    }

    const counts = { total: items.length, confirmed: 0, probable: 0, unknown: 0, usable: 0 };
    for (const x of items) {
      const s = x.catalog?.status || 'UNKNOWN';
      if (s === 'CONFIRMED') counts.confirmed++; else if (s === 'PROBABLE') counts.probable++; else counts.unknown++;
      if (x.catalog?.usable !== false) counts.usable++;
    }
    return res.status(200).json({ ok: true, service: 'MikeAircraft Photo Librarian', version: '0.2', counts, catalogUpdatedAt: catalog.updatedAt, items });
  } catch (error) {
    console.error('MikeAircraft Photo Librarian error', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};
