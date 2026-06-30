/* ===== Salsi — shell compartilhado (barra lateral unificada Dachshund Atelier, faixa offline, fila de sincronização de luxo) ===== */
(function () {
  const NAV_ITEMS = [
    { key: 'home', label: 'Atelier', href: 'index.html', icon: 'home_work' },
    { key: 'models', label: 'Modelo 3D', href: 'models.html', icon: 'view_in_ar' },
    { key: 'notes', label: 'Notas', href: 'notes.html', icon: 'edit_note', badgeKey: 'notes' },
    { key: 'reports', label: 'Relatórios', href: 'reports.html', icon: 'description' },
    { key: 'projects', label: 'Projetos', href: 'projects.html', icon: 'folder_open' },
  ];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  let currentActiveKey = null;

  async function badgeFlags() {
    const pending = await SalsiDB.getPendingSyncItems();
    return {
      photos: false,
      notes: (pending.notes.length + pending.markups.length) > 0,
      total: pending.notes.length + pending.markups.length,
      pending,
    };
  }

  async function renderSidebar(activeKey, cachedFlags) {
    const root = document.getElementById('sidebar-root');
    if (!root) return;
    const flags = cachedFlags || await badgeFlags();

    // --- Expanded w-64 Sidebar (Unified across all pages) ---
    const items = NAV_ITEMS.map(item => {
      const isActive = item.key === activeKey;
      const showBadge = item.badgeKey && flags[item.badgeKey];
      return `
        <a class="flex items-center justify-between py-3 px-4 rounded-xl transition-all duration-300 ease-out group ${isActive ? 'text-primary font-bold bg-surface-container/60' : 'text-on-surface-variant hover:bg-surface-container/50 hover:translate-x-1'}" href="${item.href}">
          <div class="flex items-center gap-4">
            <span class="material-symbols-outlined text-[22px] group-hover:scale-95 transition-transform" ${isActive ? 'style="font-variation-settings:\'FILL\' 1;"' : ''}>${item.icon}</span>
            <span class="font-label-md text-label-md">${item.label}</span>
          </div>
          ${showBadge ? '<span class="w-2.5 h-2.5 rounded-full bg-primary-container animate-pulse"></span>' : ''}
        </a>`;
    }).join('');

    root.outerHTML = `
      <aside class="hidden md:flex flex-col h-screen w-64 fixed left-0 top-0 bg-surface border-r border-outline-variant/30 py-6 px-4 z-50 shrink-0" id="sidebar-root">
        <div class="mb-10 px-2 flex items-center gap-3">
          <img alt="Salsi Logo" class="h-10 w-10 rounded-full border border-primary/20" src="logo.png"/>
          <div>
            <h1 class="font-headline-md text-[20px] font-semibold text-primary leading-tight">Estúdio Salsi</h1>
            <p class="font-label-sm text-[11px] text-on-surface-variant tracking-wider uppercase">Arquitetura</p>
          </div>
        </div>
        <nav class="flex-grow space-y-2">
          ${items}
        </nav>
        <div class="pt-6 border-t border-outline-variant/20 space-y-1">
          <button onclick="location.href='projects.html'" class="w-full bg-primary text-white py-3 px-4 rounded-full font-label-md text-label-md hover:bg-primary-container hover:scale-[1.02] transition-all duration-300 ease-out mb-4 flex items-center justify-center gap-2 shadow-sm">
            <span class="material-symbols-outlined text-[20px]">add</span>
            Novo Projeto
          </button>
          <a class="flex items-center gap-4 py-2 px-4 rounded-lg transition-all duration-300 ease-out ${activeKey === 'settings' ? 'text-primary font-bold bg-surface-container/60' : 'text-on-surface-variant hover:bg-surface-container/50 hover:translate-x-1'}" href="settings.html">
            <span class="material-symbols-outlined">settings</span>
            <span class="font-label-md text-label-md">Ajustes</span>
          </a>
        </div>
      </aside>`;
  }

  function renderOfflineBanner() {
    const root = document.getElementById('offline-banner-root');
    if (!root) return;
    root.outerHTML = `
      <div id="offlineBanner" class="hidden sticky top-0 z-50 w-full bg-primary text-white text-[13px] font-medium py-2.5 px-4 text-center transition-all duration-300">
        <div class="max-w-7xl mx-auto flex items-center justify-center gap-2">
          <span class="material-symbols-outlined animate-spin text-[16px]">sync</span>
          <span id="offlineBannerText">Modo local ativo — Alterações armazenadas offline</span>
        </div>
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
      textEl.textContent = 'Modo local ativo — Alterações armazenadas offline';
      el.classList.remove('hidden');
    } else if (justCameOnline) {
      textEl.textContent = 'Conexão restabelecida. Sincronizando dados...';
      el.classList.remove('hidden');
      SalsiDB.markAllSynced().then(async () => {
        await renderSyncCard();
        await renderSidebar(currentActiveKey);
        setTimeout(() => el.classList.add('hidden'), 2500);
      });
    } else {
      el.classList.add('hidden');
    }
  }

  async function renderSyncCard(cachedFlags) {
    const root = document.getElementById('sync-card-root');
    if (!root) return;
    const flags = cachedFlags || await badgeFlags();
    if (flags.total === 0 || sessionStorage.getItem('salsi:syncCardDismissed') === '1') {
      root.innerHTML = '<div id="sync-card-root"></div>';
      return;
    }
    
    const rows = [
      ...flags.pending.photos.map(p => `
        <div class="flex items-center gap-3 py-2 border-b border-outline-variant/10">
          <div class="w-8 h-8 rounded-lg overflow-hidden bg-surface-container flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[18px] text-primary">photo_camera</span>
          </div>
          <span class="text-[13px] text-on-surface truncate flex-1">${esc(p.caption || 'Foto do local')}</span>
        </div>
      `),
      ...flags.pending.notes.map(n => `
        <div class="flex items-center gap-3 py-2 border-b border-outline-variant/10">
          <div class="w-8 h-8 rounded-lg overflow-hidden bg-surface-container flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[18px] text-primary">edit_note</span>
          </div>
          <span class="text-[13px] text-on-surface truncate flex-1">${esc(n.title)}</span>
        </div>
      `),
      ...flags.pending.markups.map(m => `
        <div class="flex items-center gap-3 py-2 border-b border-outline-variant/10">
          <div class="w-8 h-8 rounded-lg overflow-hidden bg-surface-container flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[18px] text-primary">square_foot</span>
          </div>
          <span class="text-[13px] text-on-surface truncate flex-1">Medição #${m.number}</span>
        </div>
      `),
    ].join('');

    root.innerHTML = `
      <div class="fixed bottom-6 right-6 w-[340px] bg-white/95 backdrop-blur border border-outline-variant/40 rounded-2xl shadow-2xl p-5 z-[999] flex flex-col gap-4 transition-all duration-300" id="syncCard">
        <div class="flex justify-between items-center border-b border-outline-variant/20 pb-2">
          <h4 class="font-headline-md text-[16px] font-semibold text-primary">Pendentes (${flags.total})</h4>
          <button id="scClose" class="w-6 h-6 rounded-full hover:bg-surface-container flex items-center justify-center text-outline">
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div class="max-h-[160px] overflow-y-auto pr-1 space-y-1">
          ${rows}
        </div>
        <div class="flex gap-2 items-center">
          <img class="w-8 h-8 rounded-full border border-primary/15 shrink-0" src="logo.png" alt="Mascot">
          <button class="flex-grow bg-primary text-white py-2.5 rounded-full font-label-md text-label-md hover:bg-primary-container transition-all text-center font-semibold uppercase tracking-wider" id="scSyncBtn">
            Sincronizar Agora
          </button>
        </div>
      </div>`;

    document.getElementById('scClose').addEventListener('click', () => {
      sessionStorage.setItem('salsi:syncCardDismissed', '1');
      const card = document.getElementById('syncCard');
      if (card) card.classList.add('hidden');
    });

    document.getElementById('scSyncBtn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Sincronizando...';
      await SalsiDB.markAllSynced();
      sessionStorage.removeItem('salsi:syncCardDismissed');
      await renderSyncCard();
      await renderSidebar(currentActiveKey);
    });
  }

  async function refreshAll() {
    const flags = await badgeFlags();
    await renderSyncCard(flags);
    await renderSidebar(currentActiveKey, flags);
  }

  async function init(activeKey) {
    currentActiveKey = activeKey;
    renderOfflineBanner();
    const flags = await badgeFlags();
    await renderSidebar(activeKey, flags);
    await renderSyncCard(flags);
  }

  function getActiveProjectId() { return localStorage.getItem('salsi_active_project_id') || null; }
  function setActiveProjectId(id) { localStorage.setItem('salsi_active_project_id', id); }

  window.SalsiShell = { init, refreshAll, renderSyncCard, renderSidebar, getActiveProjectId, setActiveProjectId };
})();
