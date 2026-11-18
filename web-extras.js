/* Libreta de Hierro · funciones de la versión instalable (web)
   Se carga después del código de la libreta y usa sus funciones (S, toast, render…). */
(function () {
  'use strict';
  if (!window.WEB_APP) return;
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  let busy = '';

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
      <div class="slot"><span class="label">Tus datos</span>
        <p style="font-size:14px">Se guardan solo en este iPhone. Haz una copia de vez en cuando con «Descargar copia completa» (más arriba, en Tus datos) y guárdala en Archivos o iCloud Drive.</p></div>
      <div class="slot"><span class="label">Pasar datos de otra libreta</span>
        <p style="font-size:14px">Elige una copia descargada de la libreta de claude.ai o de la app de Xcode. Las fotos no se pasan: vuelve a hacer las de las máquinas y las de progreso.</p>
        <div class="row"><span class="btn photo-btn">${busy || 'Importar copia'}<input type="file" id="natImport" accept=".json,application/json"></span></div></div>
      <div class="slot"><span class="label">Claude (calorías por texto, foto del plato y etiquetas)</span>
        <p style="font-size:14px">${key ? 'Clave guardada en este iPhone.' : 'Necesita una clave de la API de Anthropic (console.anthropic.com). Se paga por uso: céntimos por consulta. Sin clave, apunta las calorías a mano o con el escáner de productos ya guardados.'}</p>
        <form id="natKeyForm" class="row"><div class="field" style="flex:1;min-width:0"><label class="label" for="natKey">Clave de la API</label><input id="natKey" type="password" autocomplete="off" placeholder="${key ? '•••••••• (guardada)' : 'sk-ant-…'}"></div><button class="btn" style="align-self:end">Guardar</button>${key ? '<button type="button" class="btn ghost" style="align-self:end" data-nat="key-del">Borrar</button>' : ''}</form></div>
      <div class="slot"><span class="label">Pasos</span>
        <p style="font-size:14px">La versión web no puede leer la app Salud. Apunta los pasos del día en Hoy (los ves en Salud → Pasos).</p></div>
    </div>`;
  }
  const origPlan = vPlan;
  vPlan = function () { return origPlan().replace(/<\/section>\s*$/, card() + '</section>'); };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nat]'); if (!b) return;
    if (b.dataset.nat === 'key-del') { window.WEB_KEY.set(null); toast('Clave borrada'); render(); }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'natKeyForm') return;
    e.preventDefault();
    const v = (document.getElementById('natKey').value || '').trim();
    if (!v.startsWith('sk-')) { toast('La clave empieza por «sk-ant-»'); return; }
    window.WEB_KEY.set(v); toast('Clave guardada'); render();
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'natImport' && e.target.files && e.target.files[0]) { importBackup(e.target.files[0]); e.target.value = ''; }
  });

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
