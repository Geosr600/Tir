/* db.js — wrapper IndexedDB (style nds-sync.js de l'appli principale).
   Base 'terrain_nds', distincte de 'nds_fs' (appli principale) — pas de collision possible,
   ce sont deux origines/contextes différents de toute façon.

   Stores :
   - 'seance' (clé fixe 'current')  : le seance_export.json importé.
   - 'saisies' (clé = nid||badge)   : résultat en cours de saisie par tireur (auto-save).
   - 'meta'    (clé fixe 'app')     : état global utilitaire. */

const _TDB = { db: 'terrain_nds', version: 2 };

function _openTerrainDb() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(_TDB.db, _TDB.version);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('seance'))  db.createObjectStore('seance');
      if (!db.objectStoreNames.contains('saisies')) db.createObjectStore('saisies');
      if (!db.objectStoreNames.contains('meta'))    db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('cloture')) db.createObjectStore('cloture');
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

function _tx(storeName, mode) {
  return _openTerrainDb().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function _put(storeName, key, value) {
  return _tx(storeName, 'readwrite').then(store => new Promise((res, rej) => {
    const req = store.put(value, key);
    req.onsuccess = () => res(true);
    req.onerror   = () => rej(req.error);
  }));
}

function _get(storeName, key) {
  return _tx(storeName, 'readonly').then(store => new Promise((res, rej) => {
    const req = store.get(key);
    req.onsuccess = () => res(req.result ?? null);
    req.onerror   = () => rej(req.error);
  }));
}

function _getAll(storeName) {
  return _openTerrainDb().then(db => new Promise((res, rej) => {
    const store = db.transaction(storeName, 'readonly').objectStore(storeName);
    const keysReq = store.getAllKeys();
    const valsReq = store.getAll();
    let keys, vals;
    keysReq.onsuccess = () => { keys = keysReq.result; if (vals) res(keys.map((k,i)=>({key:k, value:vals[i]}))); };
    valsReq.onsuccess = () => { vals = valsReq.result; if (keys) res(keys.map((k,i)=>({key:k, value:vals[i]}))); };
    keysReq.onerror = valsReq.onerror = () => rej(keysReq.error || valsReq.error);
  }));
}

function _clearStore(storeName) {
  return _tx(storeName, 'readwrite').then(store => new Promise((res, rej) => {
    const req = store.clear();
    req.onsuccess = () => res(true);
    req.onerror   = () => rej(req.error);
  }));
}

/* ── API publique ── */

function dbSaveSeance(data) {
  return _put('seance', 'current', data).then(() =>
    _put('meta', 'app', { formatVersionSeance: data.formatVersion, importedAt: new Date().toISOString() })
  );
}

function dbGetSeance() {
  return _get('seance', 'current');
}

function dbSaveSaisie(key, data) {
  return _put('saisies', key, { ...data, dernierEnregistrement: new Date().toISOString() });
}

function dbGetSaisie(key) {
  return _get('saisies', key);
}

async function dbGetAllSaisies() {
  const rows = await _getAll('saisies');
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return map;
}

function dbGetMeta() {
  return _get('meta', 'app');
}

function dbSetMeta(patch) {
  return dbGetMeta().then(cur => _put('meta', 'app', { ...(cur || {}), ...patch }));
}

function dbSaveCloture(data) {
  return _put('cloture', 'current', data);
}

function dbGetCloture() {
  return _get('cloture', 'current');
}

async function dbClearAll() {
  await _clearStore('seance');
  await _clearStore('saisies');
  await _clearStore('meta');
  await _clearStore('cloture');
}
