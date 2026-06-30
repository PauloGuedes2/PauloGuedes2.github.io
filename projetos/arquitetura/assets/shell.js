/* ===== Salsi — shell compartilhado (sidebar de luxo, faixa offline, fila de sincronização) ===== */
(function () {
  const NAV_ITEMS = [
    { key: 'home', label: 'Início', href: 'index.html', icon: 'i-home' },
    { key: 'projects', label: 'Projetos', href: 'projects.html', icon: 'i-building' },
    { key: 'photos', label: 'Fotos', href: 'photos.html', icon: 'i-camera', badgeKey: 'photos' },
    { key: 'notes', label: 'Notas', href: 'notes.html', icon: 'i-notes', badgeKey: 'notes' },
    { key: 'models', label: 'Modelo 3D', href: 'models.html', icon: 'i-cube' },
    { key: 'reports', label: 'Relatórios', href: 'reports.html', icon: 'i-report' },
  ];

  function svgUse(icon) { return `<svg><use href="#${icon}"/></svg>`; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  let currentActiveKey = null;

  async function badgeFlags() {
    const pending = await SalsiDB.getPendingSyncItems();
    return {
      photos: pending.photos.length > 0,
      notes: (pending.notes.length + pending.markups.length) > 0,
      total: pending.photos.length + pending.notes.length + pending.markups.length,
      pending,
    };
  }

  async function renderSidebar(activeKey) {
    const root = document.getElementById('sidebar-root');
    if (!root) return;
    const flags = await badgeFlags();
    const items = NAV_ITEMS.map(item => {
      const isActive = item.key === activeKey;
      const showBadge = item.badgeKey && flags[item.badgeKey];
      return `<a class="navitem${isActive ? ' active' : ''}" href="${item.href}">${svgUse(item.icon)}<span>${item.label}</span>${showBadge ? '<span class="badge"></span>' : ''}</a>`;
    }).join('');
    
    root.outerHTML = `
      <aside class="sidebar" id="sidebar-root">
        <div class="brand" title="Salsi — Croqui e Modelo">
          <img src="logo.png" alt="Salsi">
          <span>Salsi</span>
        </div>
        <div class="sidebar-nav-container">
          ${items}
        </div>
        <div class="spacer"></div>
        <a class="navitem${activeKey === 'settings' ? ' active' : ''}" href="settings.html">${svgUse('i-settings')}<span>Ajustes</span></a>
      </aside>`;
  }

  function renderOfflineBanner() {
    const root = document.getElementById('offline-banner-root');
    if (!root) return;
    root.outerHTML = `
      <div class="offline-banner" id="offlineBanner">
        <span id="offlineBannerText">Modo local ativo — as alterações serão salvas no dispositivo</span>
      </div>`;
    updateOfflineBanner(false);
    window.addEventListener('online', () => updateOfflineBanner(true));
    window.addEventListener('offline', () => updateOfflineBanner(false));
  }

  function updateOfflineBanner(justCameOnline) {
    const el = document.getElementById('offlineBanner');
    const textEl = document.getElementById('offlineBannerText');
    if (!el || !textEl) return;
    if (!navigator.onLine) {
      el.classList.remove('online-flash');
      textEl.innerHTML = 'Modo local ativo — as alterações serão salvas no dispositivo';
      el.classList.add('show');
    } else if (justCameOnline) {
      textEl.innerHTML = 'Conexão restabelecida. Sincronizando dados...';
      el.classList.add('show', 'online-flash');
      SalsiDB.markAllSynced().then(async () => {
        await renderSyncCard();
        await renderSidebar(currentActiveKey);
        setTimeout(() => el.classList.remove('show', 'online-flash'), 2200);
      });
    } else {
      el.classList.remove('show', 'online-flash');
    }
  }

  function syncItemRow(icon, text, thumbBlob) {
    const thumb = thumbBlob
      ? `<div class="thumb"><img src="${URL.createObjectURL(thumbBlob)}" alt=""></div>`
      : `<div class="thumb">${svgUse(icon)}</div>`;
    return `<div class="sync-item">${thumb}<span>${esc(text)}</span></div>`;
  }

  async function renderSyncCard() {
    const root = document.getElementById('sync-card-root');
    if (!root) return;
    const flags = await badgeFlags();
    if (flags.total === 0 || sessionStorage.getItem('salsi:syncCardDismissed') === '1') {
      root.innerHTML = '<div id="sync-card-root"></div>';
      return;
    }
    const rows = [
      ...flags.pending.photos.map(p => syncItemRow('i-camera', p.caption || 'Foto do local', p.blob)),
      ...flags.pending.notes.map(n => syncItemRow('i-notes', n.title)),
      ...flags.pending.markups.map(m => syncItemRow('i-cube', `Medição do modelo #${m.number}`)),
    ].join('');
    root.innerHTML = `
      <div class="sync-card show" id="syncCard">
        <div class="sc-head">Fila de Sincronização (${flags.total} pendentes) <span class="sc-close" id="scClose">${svgUse('i-close')}</span></div>
        <div class="sc-body">
          <div class="sc-list">${rows}</div>
          <img class="mascot" src="logo.png" alt="Salsi" style="width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--accent); margin-left: 12px;">
        </div>
        <div class="sc-foot"><button class="btn primary" id="scSyncBtn" style="min-height:38px; width:100%; display:inline-flex; align-items:center; justify-content:center; gap:8px;">Sincronizar Agora</button></div>
      </div>`;
    document.getElementById('scClose').addEventListener('click', () => {
      sessionStorage.setItem('salsi:syncCardDismissed', '1');
      const card = document.getElementById('syncCard');
      if (card) card.classList.remove('show');
    });
    document.getElementById('scSyncBtn').addEventListener('click', async (e) => {
      e.target.closest('button').disabled = true;
      await SalsiDB.markAllSynced();
      sessionStorage.removeItem('salsi:syncCardDismissed');
      await renderSyncCard();
      await renderSidebar(currentActiveKey);
    });
  }

  async function refreshAll() {
    await renderSyncCard();
    await renderSidebar(currentActiveKey);
  }

  async function init(activeKey) {
    currentActiveKey = activeKey;
    renderOfflineBanner();
    await renderSidebar(activeKey);
    await renderSyncCard();
  }

  function getActiveProjectId() { return localStorage.getItem('salsi:activeProjectId') || null; }
  function setActiveProjectId(id) { localStorage.setItem('salsi:activeProjectId', id); }

  window.SalsiShell = { init, refreshAll, renderSyncCard, renderSidebar, getActiveProjectId, setActiveProjectId };
})();
