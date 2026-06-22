/* app.js — bootstrap, routage des écrans, état global TERRAIN_STATE.
   Chargé en dernier (après tous les autres modules) : bootstrap au DOMContentLoaded. */

const TERRAIN_STATE = {
  seance: null,                 // seance_export.json importé (voir import.js)
  saisies: {},                  // map personKey -> objet saisie en cours (voir saisie.js)
  cloture: null,                // données de clôture terrain (voir cloture.js)
  currentTireurKey: null,       // clé du tireur actuellement affiché sur l'écran fiche
  ficheRetourVers: 'liste',     // 'liste' ou 'config-sig' — destination du bouton retour de la fiche
  signaturesEncadrement: {},    // role -> { dataUrl, grade, nom, prenom, nomComplet }
  tireursAjoutes: [],           // tireurs créés manuellement sur le terrain
};

/** Clé stable identifiant un tireur, miroir de personKey() dans l'appli principale. */
function personKey(t) {
  return t.nid || t.badge || (t.nomComplet || '').trim().toUpperCase();
}

const SCREENS = ['import', 'liste', 'fiche', 'cloture', 'export', 'config-sig'];

function showScreen(name) {
  SCREENS.forEach(s => {
    const el = document.getElementById('screen-' + s);
    if (el) el.style.display = (s === name) ? 'block' : 'none';
  });
  window.scrollTo(0, 0);
}

function goToImport() {
  swipeResetNav();
  renderResumeSeanceCard();
  showScreen('import');
}

function goToListe() {
  swipePushNav('liste');
  renderListeTireurs();
  showScreen('liste');
}

function goToFiche(key) {
  TERRAIN_STATE.currentTireurKey = key;
  TERRAIN_STATE.ficheRetourVers = key.startsWith('enc-') ? 'config-sig' : 'liste';
  swipePushNav('fiche');
  renderFicheTireur(key);
  const backBtn = document.getElementById('fiche-back-btn');
  if (backBtn) backBtn.textContent = TERRAIN_STATE.ficheRetourVers === 'config-sig' ? '← Encadrement' : '← Liste des tireurs';
  showScreen('fiche');
}

function goFicheBack() {
  if (TERRAIN_STATE.ficheRetourVers === 'config-sig') goToConfigSig();
  else goToListe();
}

function goToConfigSig() {
  swipePushNav('config-sig');
  renderConfigSig();
  showScreen('config-sig');
}

function goToExport() {
  swipePushNav('export');
  renderExportSummary();
  showScreen('export');
}

function goToCloture() {
  swipePushNav('cloture');
  renderCloture();
  showScreen('cloture');
}

/* ── Statut Service Worker ── */
function setSwStatus(text) {
  const el = document.getElementById('t-sw-status');
  if (el) el.textContent = text;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    setSwStatus('⚠ Hors-ligne indisponible');
    return;
  }
  try {
    await navigator.serviceWorker.register('./service-worker.js');
    setSwStatus('✓ Prêt hors-ligne');
  } catch (e) {
    setSwStatus('⚠ Échec installation hors-ligne');
    console.warn('SW registration failed:', e);
  }
}

/* ── Bootstrap ── */
async function initApp() {
  initSwipeNavigation();
  await registerServiceWorker();

  const seance    = await dbGetSeance();
  const saisies   = await dbGetAllSaisies();
  const cloture   = await dbGetCloture();
  const sigEnc    = await dbGetSignaturesEncadrement();
  const tirsAjout = await dbGetTireursAjoutes();
  TERRAIN_STATE.seance               = seance;
  TERRAIN_STATE.saisies              = saisies   || {};
  TERRAIN_STATE.cloture              = cloture   || null;
  TERRAIN_STATE.signaturesEncadrement = sigEnc    || {};
  TERRAIN_STATE.tireursAjoutes        = tirsAjout || [];

  if (seance) {
    goToImport(); // affiche la carte "reprendre la séance en cours"
  } else {
    showScreen('import');
  }
}

document.addEventListener('DOMContentLoaded', initApp);
