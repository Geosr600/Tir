/* swipe.js — navigation retour par geste de balayage horizontal (swipe droite → retour).
   Guards : pad signature actif, geste principalement vertical, seuil 60px,
            bord gauche iOS (x < 15px protège le retour système natif). */

const _SWIPE_THRESHOLD  = 60;  // px minimum horizontal pour déclencher
const _SWIPE_EDGE_GUARD = 15;  // px depuis le bord gauche (zone retour iOS)

let _swipeNavHistory  = ['import']; // pile de navigation, démarre sur import
let _swipeTouchStartX = 0;
let _swipeTouchStartY = 0;

/* ── API publique ────────────────────────────────────────────────────── */

function swipePushNav(screen) {
  // Évite les doublons consécutifs (ex. fiche → fiche)
  if (_swipeNavHistory[_swipeNavHistory.length - 1] !== screen) {
    _swipeNavHistory.push(screen);
  }
}

function swipeResetNav() {
  _swipeNavHistory = ['import'];
}

/* ── Guards ──────────────────────────────────────────────────────────── */

function _isSigningActive() {
  // Modale signature ouverte (signatures tireur/formateur par bloc)
  const modal = document.getElementById('sig-modal');
  if (modal && modal.style.display === 'flex') return true;
  // Signature DT inline dans l'écran clôture
  return typeof _dtSigState !== 'undefined' && _dtSigState.drawing;
}

/* ── Navigation sans repush ──────────────────────────────────────────── */

function _renderScreen(name) {
  switch (name) {
    case 'liste':
      renderListeTireurs();
      showScreen('liste');
      break;
    case 'fiche':
      if (TERRAIN_STATE.currentTireurKey) renderFicheTireur(TERRAIN_STATE.currentTireurKey);
      showScreen('fiche');
      break;
    case 'export':
      renderExportSummary();
      showScreen('export');
      break;
    case 'cloture':
      renderCloture();
      showScreen('cloture');
      break;
    default:
      swipeResetNav();
      renderResumeSeanceCard();
      showScreen('import');
      break;
  }
}

function swipeBack() {
  if (_isSigningActive()) return;
  if (_swipeNavHistory.length <= 1) return; // déjà à la racine
  _swipeNavHistory.pop();
  _renderScreen(_swipeNavHistory[_swipeNavHistory.length - 1]);
}

/* ── Enregistrement des events ───────────────────────────────────────── */

function initSwipeNavigation() {
  const main = document.getElementById('t-main');
  if (!main) return;

  main.addEventListener('touchstart', e => {
    const t = e.touches[0];
    _swipeTouchStartX = t.clientX;
    _swipeTouchStartY = t.clientY;
  }, { passive: true });

  main.addEventListener('touchend', e => {
    if (_isSigningActive()) return;
    const t = e.changedTouches[0];
    const deltaX = t.clientX - _swipeTouchStartX;
    const deltaY = t.clientY - _swipeTouchStartY;
    if (
      deltaX > _SWIPE_THRESHOLD &&
      Math.abs(deltaX) > Math.abs(deltaY) &&    // geste majoritairement horizontal
      _swipeTouchStartX > _SWIPE_EDGE_GUARD      // évite la zone retour iOS natif
    ) {
      swipeBack();
    }
  }, { passive: true });
}
