import { PUBLIC_STORE } from './config.js';

function configured() {
  return Boolean(PUBLIC_STORE.url && PUBLIC_STORE.anonKey && PUBLIC_STORE.table);
}

function headers(extra = {}) {
  return {
    apikey: PUBLIC_STORE.anonKey,
    Authorization: `Bearer ${PUBLIC_STORE.anonKey}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

export function publicStoreConfigured() { return configured(); }

export async function listPublicFaces(search = '') {
  if (!configured()) return [];
  const base = PUBLIC_STORE.url.replace(/\/$/, '');
  const params = new URLSearchParams({ select: '*', order: 'created_at.desc', limit: '100' });
  if (search.trim()) params.set('or', `(title.ilike.*${search.trim()}*,author.ilike.*${search.trim()}*)`);
  const response = await fetch(`${base}/rest/v1/${PUBLIC_STORE.table}?${params}`, { headers: headers() });
  if (!response.ok) throw new Error(`Không tải được thư viện (${response.status})`);
  return response.json();
}

export async function publishFace({ title, author, width, height, preview, payload }) {
  if (!configured()) throw new Error('Chưa cấu hình kho cộng đồng');
  const base = PUBLIC_STORE.url.replace(/\/$/, '');
  const body = {
    title: title || 'Không tên', author: author || 'Ẩn danh',
    screen_width: width, screen_height: height,
    preview_data: preview, payload, downloads: 0
  };
  const response = await fetch(`${base}/rest/v1/${PUBLIC_STORE.table}`, {
    method: 'POST', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Không đăng được (${response.status})`);
  const result = await response.json();
  return result[0] || result;
}

export async function incrementDownload(id) {
  if (!configured() || !id) return;
  const base = PUBLIC_STORE.url.replace(/\/$/, '');
  try {
    await fetch(`${base}/rest/v1/rpc/tnva_increment_download`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ face_id: id })
    });
  } catch { /* optional */ }
}
