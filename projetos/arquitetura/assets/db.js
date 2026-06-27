/* ===== Salsi — camada de dados local (IndexedDB) =====
   Tudo neste arquivo vive só no navegador/aparelho atual. Não existe servidor:
   "sincronizado" aqui significa apenas "confirmado neste dispositivo".
*/
(function () {
  const DB_NAME = 'salsi-db';
  const DB_VERSION = 1;
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('modelFiles')) {
          db.createObjectStore('modelFiles', { keyPath: 'projectId' });
        }
        if (!db.objectStoreNames.contains('photos')) {
          const s = db.createObjectStore('photos', { keyPath: 'id' });
          s.createIndex('byProject', 'projectId');
        }
        if (!db.objectStoreNames.contains('notes')) {
          const s = db.createObjectStore('notes', { keyPath: 'id' });
          s.createIndex('byProject', 'projectId');
        }
        if (!db.objectStoreNames.contains('markups')) {
          const s = db.createObjectStore('markups', { keyPath: 'id' });
          s.createIndex('byProject', 'projectId');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(storeNames, mode, fn) {
    return openDB().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(storeNames, mode);
      const stores = Array.isArray(storeNames) ? storeNames.map(n => t.objectStore(n)) : [t.objectStore(storeNames)];
      let result;
      Promise.resolve(fn(...stores))
        .then((r) => { result = r; })
        .catch(reject);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('transaction aborted'));
    }));
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  const SalsiDB = {
    // ---------- projetos ----------
    async addProject({ name, description }) {
      const project = { id: uid(), name: name || 'Projeto sem nome', description: description || '', createdAt: Date.now() };
      await tx('projects', 'readwrite', (store) => reqToPromise(store.add(project)));
      return project;
    },

    async getProjects() {
      const list = await tx('projects', 'readonly', (store) => reqToPromise(store.getAll()));
      return list.sort((a, b) => b.createdAt - a.createdAt);
    },

    async getProject(id) {
      if (!id) return null;
      return tx('projects', 'readonly', (store) => reqToPromise(store.get(id)));
    },

    async deleteProject(id) {
      await tx(['projects', 'modelFiles', 'photos', 'notes', 'markups'], 'readwrite', async (projects, models, photos, notes, markups) => {
        await reqToPromise(projects.delete(id));
        await reqToPromise(models.delete(id));
        for (const store of [photos, notes, markups]) {
          const idx = store.index('byProject');
          const items = await reqToPromise(idx.getAll(id));
          for (const it of items) await reqToPromise(store.delete(it.id));
        }
      });
    },

    // ---------- arquivo de modelo por projeto ----------
    async setProjectModel(projectId, blob, filename) {
      await tx('modelFiles', 'readwrite', (store) => reqToPromise(store.put({ projectId, blob, filename, savedAt: Date.now() })));
    },

    async getProjectModel(projectId) {
      return tx('modelFiles', 'readonly', (store) => reqToPromise(store.get(projectId))) || null;
    },

    // ---------- fotos ----------
    async addPhoto({ projectId, blob, caption }) {
      const photo = { id: uid(), projectId, blob, caption: caption || '', createdAt: Date.now(), synced: !!(typeof navigator !== 'undefined' && navigator.onLine) };
      await tx('photos', 'readwrite', (store) => reqToPromise(store.add(photo)));
      return photo;
    },
    async getPhotos(projectId) {
      const list = await tx('photos', 'readonly', (store) => reqToPromise(store.index('byProject').getAll(projectId)));
      return list.sort((a, b) => b.createdAt - a.createdAt);
    },
    async deletePhoto(id) {
      await tx('photos', 'readwrite', (store) => reqToPromise(store.delete(id)));
    },

    // ---------- notas ----------
    async addNote({ projectId, title, body, tag }) {
      const note = { id: uid(), projectId, title: title || 'Nota sem título', body: body || '', tag: tag || '', createdAt: Date.now(), synced: !!(typeof navigator !== 'undefined' && navigator.onLine) };
      await tx('notes', 'readwrite', (store) => reqToPromise(store.add(note)));
      return note;
    },
    async getNotes(projectId) {
      const list = await tx('notes', 'readonly', (store) => reqToPromise(store.index('byProject').getAll(projectId)));
      return list.sort((a, b) => b.createdAt - a.createdAt);
    },
    async deleteNote(id) {
      await tx('notes', 'readwrite', (store) => reqToPromise(store.delete(id)));
    },

    // ---------- marcações do modelo 3D ----------
    async addMarkup({ projectId, position, normal, note, number }) {
      const markup = { id: uid(), projectId, position, normal, note: note || '', number, createdAt: Date.now(), synced: !!(typeof navigator !== 'undefined' && navigator.onLine) };
      await tx('markups', 'readwrite', (store) => reqToPromise(store.add(markup)));
      return markup;
    },
    async getMarkups(projectId) {
      const list = await tx('markups', 'readonly', (store) => reqToPromise(store.index('byProject').getAll(projectId)));
      return list.sort((a, b) => a.number - b.number);
    },
    async clearMarkups(projectId) {
      await tx('markups', 'readwrite', async (store) => {
        const items = await reqToPromise(store.index('byProject').getAll(projectId));
        for (const it of items) await reqToPromise(store.delete(it.id));
      });
    },

    // ---------- fila de sincronização (itens com synced:false, de todos os projetos) ----------
    async getPendingSyncItems() {
      const [photos, notes, markups] = await Promise.all([
        tx('photos', 'readonly', (s) => reqToPromise(s.getAll())),
        tx('notes', 'readonly', (s) => reqToPromise(s.getAll())),
        tx('markups', 'readonly', (s) => reqToPromise(s.getAll())),
      ]);
      return {
        photos: photos.filter(p => !p.synced),
        notes: notes.filter(n => !n.synced),
        markups: markups.filter(m => !m.synced),
      };
    },

    async markAllSynced() {
      await tx(['photos', 'notes', 'markups'], 'readwrite', async (photos, notes, markups) => {
        for (const [store] of [[photos], [notes], [markups]]) {
          const items = await reqToPromise(store.getAll());
          for (const it of items) {
            if (!it.synced) { it.synced = true; await reqToPromise(store.put(it)); }
          }
        }
      });
    },

    // ---------- configurações simples (chave/valor) ----------
    async getSetting(key, fallback) {
      const row = await tx('settings', 'readonly', (store) => reqToPromise(store.get(key)));
      return row ? row.value : fallback;
    },
    async setSetting(key, value) {
      await tx('settings', 'readwrite', (store) => reqToPromise(store.put({ key, value })));
    },

    // ---------- backup manual (já que não existe nuvem) ----------
    async exportAll() {
      const [projects, photos, notes, markups] = await Promise.all([
        tx('projects', 'readonly', (s) => reqToPromise(s.getAll())),
        tx('photos', 'readonly', (s) => reqToPromise(s.getAll())),
        tx('notes', 'readonly', (s) => reqToPromise(s.getAll())),
        tx('markups', 'readonly', (s) => reqToPromise(s.getAll())),
      ]);
      // Blobs (fotos/modelos) não entram no JSON — backup cobre projetos, notas e marcações.
      return JSON.stringify({ exportedAt: Date.now(), projects, notes, markups, photoCount: photos.length }, null, 2);
    },

    async importAll(jsonString) {
      const data = JSON.parse(jsonString);
      let imported = { projects: 0, notes: 0, markups: 0 };
      await tx(['projects', 'notes', 'markups'], 'readwrite', async (projects, notes, markups) => {
        for (const p of (data.projects || [])) { await reqToPromise(projects.put(p)); imported.projects++; }
        for (const n of (data.notes || [])) { await reqToPromise(notes.put(n)); imported.notes++; }
        for (const m of (data.markups || [])) { await reqToPromise(markups.put(m)); imported.markups++; }
      });
      return imported;
    },

    async getStorageEstimate() {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        return navigator.storage.estimate();
      }
      return { usage: 0, quota: 0 };
    },

    async clearAllData() {
      await tx(['projects', 'modelFiles', 'photos', 'notes', 'markups', 'settings'], 'readwrite', async (...stores) => {
        for (const s of stores) await reqToPromise(s.clear());
      });
    },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SalsiDB;
  } else {
    window.SalsiDB = SalsiDB;
  }
})();
