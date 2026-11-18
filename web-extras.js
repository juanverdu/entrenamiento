/* Libreta de Hierro · funciones de la versión instalable (web)
   Se carga después del código de la libreta y usa sus funciones (S, toast, render…). */
(function () {
  'use strict';
  if (!window.WEB_APP) return;
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const APP_VERSION = '5 · 18 nov';
  let busy = '';

  /* ---------- Avisos en el móvil con la app ntfy (gratis, sin cuenta) ---------- */
  const LS = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
  const N = {
    topic: () => LS.get('ntfy_topic'),
    on: (k) => LS.get('ntfy_' + k) === '1',
    async send(o) {
      const t = N.topic(); if (!t) return false;
      const body = JSON.stringify({ topic: t, ...o });
      try { const r = await fetch('https://ntfy.sh/', { method: 'POST', keepalive: true, body }); return r.ok; }
      catch (e) { try { await fetch('https://ntfy.sh/', { method: 'POST', mode: 'no-cors', keepalive: true, body }); return true; } catch (e2) { return false; } }
    },
  };
  let sentEnd = 0;
  function restOnHide() {
    if (!N.topic() || !N.on('rest')) return;
    let t = null; try { t = timer; } catch (e) { return; }
    if (!t || !t.end || t.end === sentEnd || t.end - Date.now() < 10000) return;
    sentEnd = t.end;
    N.send({ title: 'Descanso terminado', message: t.next ? 'Siguiente: ' + t.next : 'A por la siguiente serie.', priority: 5, tags: ['stopwatch'], delay: String(Math.round(t.end / 1000)) });
  }
  function scheduleDaily() {
    if (!N.topic() || !N.on('daily')) return;
    let done = []; try { done = JSON.parse(LS.get('ntfy_sched') || '[]'); } catch (e) {}
    const now = Date.now(); done = done.filter((x) => x > now);
    const want = [];
    for (let d = 0; d < 3; d++) {
      for (const [h, m, title, msg] of [[8, 0, 'Pésate', 'Al levantarte, después del baño y antes de desayunar.'], [21, 30, '¿Has apuntado las comidas?', 'Márcalas con «Hecha» en Hoy y apunta los pasos.']]) {
        const dt = new Date(); dt.setDate(dt.getDate() + d); dt.setHours(h, m, 0, 0);
        const ts = dt.getTime();
        if (ts > now + 60000 && ts < now + 71 * 3600000 && !done.includes(ts)) want.push([ts, title, msg]);
      }
    }
    want.forEach(([ts, title, message]) => { done.push(ts); N.send({ title, message, tags: ['bell'], delay: String(Math.round(ts / 1000)) }); });
    LS.set('ntfy_sched', JSON.stringify(done));
  }
  function notifSlot() {
    const t = N.topic();
    if (!t) return `<div class="slot"><span class="label">Avisos en el móvil</span>
        <p style="font-size:14px">Recibe un aviso cuando termine el descanso aunque tengas la app cerrada o el móvil bloqueado, y recordatorios a las 8:00 (pesarte) y a las 21:30 (comidas). Usa la app gratuita <b>ntfy</b>, sin cuenta.</p>
        <div class="row"><button class="btn primary" data-nat="ntfy-on">Activar avisos</button></div></div>`;
    return `<div class="slot"><span class="label">Avisos en el móvil</span>
        <ol style="margin:0;padding-left:20px;font-size:14px;display:grid;gap:6px">
          <li>Instala <b>ntfy</b> desde la App Store (es gratis) y permite sus notificaciones.</li>
          <li>En ntfy pulsa <b>+</b>, escribe este tema y pulsa <b>Subscribe</b>: <code class="mono" style="user-select:all;word-break:break-all">${t}</code> <button class="btn small" data-nat="ntfy-copy">Copiar</button></li>
          <li>Prueba que llega: <button class="btn small" data-nat="ntfy-test">Enviar aviso de prueba</button></li>
        </ol>
        <label class="check"><input type="checkbox" data-nat-chk="rest" ${N.on('rest') ? 'checked' : ''}> Aviso al terminar el descanso</label>
        <label class="check"><input type="checkbox" data-nat-chk="daily" ${N.on('daily') ? 'checked' : ''}> Recordatorios a las 8:00 y a las 21:30</label>
        <p class="muted" style="font-size:13px">El aviso del descanso se programa cuando sales de la app con el descanso en marcha. Si vuelves y lo saltas, te llegará igualmente. Los recordatorios se programan para los próximos 3 días cada vez que abres la app; si la desactivas, los ya programados todavía llegan.</p>
        <div class="row"><button class="btn small ghost" data-nat="ntfy-off">Quitar avisos</button></div></div>`;
  }

  async function importBackup(file) {
    let j = null;
    try { j = JSON.parse(await file.text()); } catch (e) { toast('No se pudo leer el archivo'); return; }
    if (!j || j.app !== 'Libreta de Hierro') { toast('Ese archivo no es una copia de la Libreta de Hierro'); return; }
    if ((await window.NATIVE_DB.count()) > 0 && !confirm('Se añadirán los datos de la copia a los que ya hay en la app (los días repetidos se sustituyen). ¿Continuar?')) return;
    busy = 'Importando…'; render();
    for (const c of ['weights', 'measures', 'meals', 'workouts', 'daily', 'products']) if (j[c]) await window.NATIVE_DB.bulk(c, j[c]);
    if (j.profile) { const p = { ...j.profile }; delete p.machines; await window.NATIVE_DB.bulk('profile', { main: p }); }
    busy = '';
    const n = (o) => Object.keys(j[o] || {}).length;
    toast(`Copia importada: ${n('workouts')} entrenos, ${n('meals')} comidas y ${n('weights')} pesos`);
    render();
  }

  function card() {
    const key = !!window.WEB_KEY.get();
    return `<div class="card" id="natCard">
      <h3>Ajustes de la app</h3>
      ${standalone ? '' : `<div class="slot"><span class="label">Instálala en el iPhone</span>
        <p style="font-size:14px">En Safari, pulsa el botón de compartir y elige <b>«Añadir a pantalla de inicio»</b>. Se abrirá a pantalla completa, como una app, y no caduca.</p></div>`}
      ${notifSlot()}
      <div class="slot"><span class="label">Tus datos</span>
        <p style="font-size:14px">Se guardan solo en este iPhone. Haz una copia de vez en cuando con «Descargar copia completa» (más arriba, en Tu perfil y copias) y guárdala en Archivos o iCloud Drive.</p></div>
      <div class="slot"><span class="label">Pasar datos de otra libreta</span>
        <p style="font-size:14px">Elige una copia descargada de la libreta de claude.ai o de la app de Xcode. Las fotos no se pasan: vuelve a hacer las de las máquinas y las de progreso.</p>
        <div class="row"><span class="btn photo-btn">${busy || 'Importar copia'}<input type="file" id="natImport" accept=".json,application/json"></span></div></div>
      <div class="slot"><span class="label">Claude (calorías por texto, foto del plato y etiquetas)</span>
        <p style="font-size:14px">${key ? 'Clave guardada en este iPhone.' : 'Necesita una clave de la API de Anthropic (console.anthropic.com). Se paga por uso: céntimos por consulta. Sin clave, apunta las calorías a mano o con el escáner de productos ya guardados.'}</p>
        <form id="natKeyForm" class="row"><div class="field" style="flex:1;min-width:0"><label class="label" for="natKey">Clave de la API</label><input id="natKey" type="password" autocomplete="off" placeholder="${key ? '•••••••• (guardada)' : 'sk-ant-…'}"></div><button class="btn" style="align-self:end">Guardar</button>${key ? '<button type="button" class="btn ghost" style="align-self:end" data-nat="key-del">Borrar</button>' : ''}</form></div>
      <div class="slot"><span class="label">Pasos</span>
        <p style="font-size:14px">La versión web no puede leer la app Salud. Apunta los pasos del día en Hoy (los ves en Salud → Pasos).</p></div>
      <p class="muted" style="font-size:12px;margin:0">Versión ${APP_VERSION}</p>
    </div>`;
  }
  const origAj = vAjustes;
  vAjustes = function () { return origAj().replace(/<\/section>\s*$/, card() + '</section>'); };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nat]'); if (!b) return;
    const a = b.dataset.nat;
    if (a === 'key-del') { window.WEB_KEY.set(null); toast('Clave borrada'); render(); }
    if (a === 'ntfy-on') { const r = new Uint8Array(9); crypto.getRandomValues(r); LS.set('ntfy_topic', 'entreno-' + [...r].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 14)); LS.set('ntfy_rest', '1'); LS.set('ntfy_daily', '1'); scheduleDaily(); render(); }
    if (a === 'ntfy-off') { if (!confirm('¿Quitar los avisos? Los recordatorios ya programados todavía pueden llegar hasta 3 días.')) return; ['ntfy_topic', 'ntfy_rest', 'ntfy_daily', 'ntfy_sched'].forEach((k) => LS.set(k, null)); toast('Avisos quitados. Puedes borrar el tema en la app ntfy.'); render(); }
    if (a === 'ntfy-copy') { const t = N.topic(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Tema copiado'), () => toast('Mantén pulsado el tema para copiarlo')); }
    if (a === 'ntfy-test') { b.disabled = true; N.send({ title: 'Entrenamiento', message: '¡Los avisos funcionan!', tags: ['white_check_mark'] }).then((ok) => { b.disabled = false; toast(ok ? 'Enviado. Debería llegarte en unos segundos.' : 'No se pudo enviar. Revisa la conexión.'); }); }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'natKeyForm') return;
    e.preventDefault();
    const v = (document.getElementById('natKey').value || '').trim();
    if (!v.startsWith('sk-')) { toast('La clave empieza por «sk-ant-»'); return; }
    window.WEB_KEY.set(v); toast('Clave guardada'); render();
  });
  document.addEventListener('change', (e) => {
    const k = e.target.dataset && e.target.dataset.natChk;
    if (k) { LS.set('ntfy_' + k, e.target.checked ? '1' : '0'); if (k === 'daily' && e.target.checked) scheduleDaily(); toast(e.target.checked ? 'Activado' : 'Desactivado'); return; }
    if (e.target.id === 'natImport' && e.target.files && e.target.files[0]) { importBackup(e.target.files[0]); e.target.value = ''; }
  });

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') restOnHide(); else scheduleDaily(); });
  window.addEventListener('pagehide', restOnHide);
  setTimeout(scheduleDaily, 1500);

  /* Actualizaciones: cuando subo una versión nueva, se aplica sola al abrir la app */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return; reloaded = true;
      const a = document.activeElement;
      if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) { toast('Hay una versión nueva. Se aplicará la próxima vez que abras la app.'); return; }
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((reg) => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch((e) => console.warn('SW', e));
  }
})();
