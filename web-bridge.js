/* Libreta de Hierro · versión web instalable
   Sustituye lo que la libreta usaba en claude.ai (window.claude.use) por
   equivalentes que guardan todo en el propio iPhone (IndexedDB). */
(function () {
  'use strict';
  window.WEB_APP = true;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* ---------- IndexedDB: «docs» (colección/id → datos) y «media» (fotos) ---------- */
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('libreta-de-hierro', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('docs'); r.result.createObjectStore('media'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return open().then((db) => new Promise((res, rej) => {
      const t = db.transaction(store, mode); const out = fn(t.objectStore(store));
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
  }
  const cols = {}; let loaded = null;
  function loadAll() {
    if (loaded) return loaded;
    loaded = open().then((db) => new Promise((res, rej) => {
      const req = db.transaction('docs', 'readonly').objectStore('docs').openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (c) { const k = String(c.key), i = k.indexOf('/'); const col = k.slice(0, i); (cols[col] = cols[col] || {})[k.slice(i + 1)] = c.value; c.continue(); }
        else res();
      };
      req.onerror = () => rej(req.error);
    }));
    return loaded;
  }
  const subs = {};
  function emit(c) {
    const snap = { docs: Object.entries(cols[c] || {}).map(([id, d]) => ({ id, data: () => clone(d) })) };
    (subs[c] || []).forEach((f) => { try { f(snap); } catch (e) { console.error(e); } });
  }
  const db = {
    collection(c) {
      return {
        onSnapshot(fn, err) {
          (subs[c] = subs[c] || []).push(fn);
          loadAll().then(() => emit(c)).catch((e) => err && err(e));
          return () => { subs[c] = (subs[c] || []).filter((x) => x !== fn); };
        },
        doc(id) {
          return {
            async set(d) { await loadAll(); const v = clone(d); await tx('docs', 'readwrite', (st) => st.put(v, c + '/' + id)); (cols[c] = cols[c] || {})[id] = v; setTimeout(() => emit(c), 0); },
            async delete() { await loadAll(); await tx('docs', 'readwrite', (st) => st.delete(c + '/' + id)); if (cols[c]) delete cols[c][id]; setTimeout(() => emit(c), 0); },
          };
        },
      };
    },
  };
  window.NATIVE_DB = {
    async bulk(c, obj) {
      await loadAll();
      await tx('docs', 'readwrite', (st) => { Object.entries(obj || {}).forEach(([id, d]) => st.put(clone(d), c + '/' + id)); });
      cols[c] = cols[c] || {}; Object.entries(obj || {}).forEach(([id, d]) => { cols[c][id] = clone(d); });
      emit(c);
    },
    async count() { await loadAll(); return Object.values(cols).reduce((a, o) => a + Object.keys(o).length, 0); },
  };

  /* ---------- Fotos ---------- */
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const imgUrl = {}, imgLoading = {};
  window.NATIVE_IMG = (id) => {
    if (!id) return BLANK;
    if (imgUrl[id]) return imgUrl[id];
    if (!imgLoading[id]) {
      imgLoading[id] = tx('media', 'readonly', (st) => st.get(id))
        .then((b) => { imgUrl[id] = b ? URL.createObjectURL(b) : BLANK; })
        .catch(() => { imgUrl[id] = BLANK; })
        .then(() => { if (typeof scheduleRender === 'function') scheduleRender(); });
    }
    return BLANK;
  };
  const assets = {
    async upload(blob) {
      const id = uid() + ((blob.type || '').includes('png') ? '.png' : '.jpg');
      await tx('media', 'readwrite', (st) => st.put(blob, id));
      imgUrl[id] = URL.createObjectURL(blob);
      return { id, url: '', sizeBytes: blob.size, contentType: blob.type || 'image/jpeg' };
    },
    async delete(id) { try { await tx('media', 'readwrite', (st) => st.delete(id)); } catch (e) {} },
    async list() { return { assets: [], usage: {} }; },
  };

  /* ---------- Descargas: menú de compartir del iPhone ---------- */
  const downloads = {
    async save({ filename, data, mimeType }) {
      const blob = typeof data === 'string' ? new Blob([data], { type: mimeType || (filename.endsWith('.json') ? 'application/json' : filename.endsWith('.csv') ? 'text/csv' : 'text/plain') }) : data;
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: filename }); return { status: 'saved' }; }
        catch (e) { if (e && e.name === 'AbortError') return { status: 'cancelled' }; }
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return { status: 'saved' };
    },
  };

  /* ---------- Claude (calorías por texto, foto y etiquetas) con tu clave de la API ---------- */
  const MODEL = 'claude-sonnet-5-5';
  const KEY = 'libreta_anthropic_key';
  const apiKey = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  window.WEB_KEY = { get: apiKey, set: (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) {} } };
  const blobToB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  async function ask(prompt, opts) {
    const key = apiKey();
    if (!key) { const e = new Error('Añade tu clave de la API de Anthropic en Plan → Ajustes de la app para usar esta función.'); e.code = 'not_granted'; throw e; }
    const content = [];
    for (const img of (opts && opts.images) || []) content.push({ type: 'image', source: { type: 'base64', media_type: img.type && img.type.startsWith('image/') ? img.type : 'image/jpeg', data: await blobToB64(img) } });
    content.push({ type: 'text', text: prompt });
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, messages: [{ role: 'user', content }] }),
    });
    if (!res.ok) { const e = new Error(res.status === 401 ? 'La clave de la API no es válida. Revísala en Plan → Ajustes de la app.' : 'Claude no ha respondido (error ' + res.status + ').'); e.code = res.status === 401 ? 'not_granted' : res.status === 429 ? 'rate_limited' : 'error'; throw e; }
    const j = await res.json();
    return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  }
  const sample = async (input, opts) => ({ text: await ask(typeof input === 'string' ? input : input.map((m) => m.content).join('\n'), opts), truncated: false });
  sample.json = async (prompt, opts) => {
    const t = await ask(prompt + '\n\nResponde únicamente con el JSON, sin texto adicional.', opts);
    const m = t.match(/\{[\s\S]*\}/); if (!m) { const e = new Error('Respuesta sin JSON'); e.code = 'error'; throw e; }
    return JSON.parse(m[0]);
  };
  sample.limits = async () => (apiKey() ? { images: { maxCount: 4, maxInputBytes: 5e6 } } : { images: null });

  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  const spaces = { db, assets, downloads, sample };
  window.claude = { use: async (name) => { try { await open(); } catch (e) { return null; } return spaces[name] || null; } };
})();
