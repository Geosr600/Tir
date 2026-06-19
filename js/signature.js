/* signature.js — capture de signature tactile via modale plein écran.
   Approche modale : évite tout conflit avec la navigation par swipe et le scroll de page.
   Un canvas unique dans la modale est partagé entre tous les pads ; chaque pad est identifié
   par son padId et stocke key/role/bloc dans _sigPadState. */

const _sigPadState = {}; // padId -> { key, role, bloc }

/* ── Rendu HTML — bouton + aperçu miniature ─────────────────────────── */

function signatureButtonHtml(padId, existingDataUrl) {
  if (existingDataUrl) {
    return `
      <div class="t-sig-btn-wrap">
        <img src="${existingDataUrl}" class="t-sig-thumbnail" alt="Signature">
        <button type="button" class="t-btn t-btn-secondary t-btn-small"
                onclick="openSigModal('${padId}')">✏ Re-signer</button>
      </div>
      <div id="${padId}-status" class="t-sig-status ok">✓ Signé</div>`;
  }
  return `
    <div class="t-sig-btn-wrap">
      <button type="button" class="t-btn t-btn-primary"
              onclick="openSigModal('${padId}')">✍ Signer…</button>
    </div>
    <div id="${padId}-status" class="t-sig-status">Non signé</div>`;
}

// Alias rétrocompatibilité (appelé depuis saisie.js existant)
function signaturePadHtml(padId, existingDataUrl) {
  return signatureButtonHtml(padId, existingDataUrl);
}

/* ── Enregistrement des pads ─────────────────────────────────────── */

// Enregistre le contexte d'un pad (key tireur, role, bloc) sans créer de canvas inline.
function registerSigPad(padId, tireurKey, role, bloc) {
  _sigPadState[padId] = { key: tireurKey, role, bloc };
}

// Alias rétrocompatibilité — initSignaturePad appelé depuis saisie.js
function initSignaturePad(padId, tireurKey, role, bloc) {
  registerSigPad(padId, tireurKey, role, bloc);
}

/* ── Modale signature ────────────────────────────────────────────── */

let _modalActivePadId = null;
let _modalCtx         = null;
let _modalCanvas      = null;
let _modalDrawing     = false;
let _modalLastX       = 0;
let _modalLastY       = 0;
let _modalEventsWired = false;

function openSigModal(padId) {
  const st = _sigPadState[padId];
  if (!st) return;
  _modalActivePadId = padId;

  const modal  = document.getElementById('sig-modal');
  const canvas = document.getElementById('sig-modal-canvas');
  const title  = document.getElementById('sig-modal-title');
  if (!modal || !canvas) return;

  const roleLabel = st.role === 'tireur' ? 'Tireur' : 'Formateur / MTC';
  const blocLabel = st.bloc === 'istc'   ? 'ISTC'   : 'Test tir';
  if (title) title.textContent = `Signature — ${roleLabel} (${blocLabel})`;

  // Dimensionner le canvas au viewport disponible
  const ratio = window.devicePixelRatio || 1;
  const W = Math.min(window.innerWidth - 24, 576);
  const H = Math.round(Math.min(window.innerHeight * 0.50, 320));
  canvas.width  = Math.round(W * ratio);
  canvas.height = Math.round(H * ratio);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  _modalCanvas  = canvas;
  _modalCtx     = canvas.getContext('2d');
  _modalCtx.scale(ratio, ratio);
  _modalCtx.lineWidth   = 2.5;
  _modalCtx.lineCap     = 'round';
  _modalCtx.lineJoin    = 'round';
  _modalCtx.strokeStyle = '#1a1a2e';
  _modalCtx.fillStyle   = '#ffffff';
  _modalCtx.fillRect(0, 0, W, H);

  // Charger la signature existante si présente
  const s = getSaisie(st.key);
  const sigField = st.bloc === 'tir' ? 'tirSignatures' : 'istcSignatures';
  const existing = s?.[sigField]?.[st.role];
  if (existing) {
    const img = new Image();
    img.onload = () => _modalCtx.drawImage(img, 0, 0, W, H);
    img.src = existing;
  }

  _modalDrawing = false;
  _wireModalEvents();
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeSigModal() {
  const modal = document.getElementById('sig-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
  _modalActivePadId = null;
  _modalDrawing     = false;
}

function clearSigModal() {
  if (!_modalCanvas || !_modalCtx) return;
  const ratio = window.devicePixelRatio || 1;
  const W = _modalCanvas.width  / ratio;
  const H = _modalCanvas.height / ratio;
  _modalCtx.fillStyle = '#ffffff';
  _modalCtx.fillRect(0, 0, W, H);
}

function validateSigModal() {
  const padId = _modalActivePadId;
  if (!padId || !_modalCanvas) { closeSigModal(); return; }
  const st = _sigPadState[padId];
  if (!st) { closeSigModal(); return; }

  const dataUrl = _modalCanvas.toDataURL('image/png', 0.6);
  const s = getSaisie(st.key);
  if (s) {
    const sigField = st.bloc === 'tir' ? 'tirSignatures' : 'istcSignatures';
    if (!s[sigField]) s[sigField] = { tireur: null, formateur: null, dateSignature: null };
    s[sigField][st.role] = dataUrl;
    s[sigField].dateSignature = new Date().toISOString().split('T')[0];
    scheduleAutoSave(st.key);
  }

  closeSigModal();
  if (st.key) renderFicheTireur(st.key); // rafraîchit le thumbnail dans la fiche
}

function _wireModalEvents() {
  if (_modalEventsWired || !_modalCanvas) return;
  _modalEventsWired = true;

  const pos = e => {
    const rect = _modalCanvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  _modalCanvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    _modalCanvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    _modalDrawing = true; _modalLastX = p.x; _modalLastY = p.y;
  });
  _modalCanvas.addEventListener('pointermove', e => {
    if (!_modalDrawing) return;
    e.preventDefault();
    const p = pos(e);
    _modalCtx.beginPath();
    _modalCtx.moveTo(_modalLastX, _modalLastY);
    _modalCtx.lineTo(p.x, p.y);
    _modalCtx.stroke();
    _modalLastX = p.x; _modalLastY = p.y;
  });
  const endDraw = () => { _modalDrawing = false; };
  _modalCanvas.addEventListener('pointerup',     endDraw);
  _modalCanvas.addEventListener('pointerleave',  endDraw);
  _modalCanvas.addEventListener('pointercancel', endDraw);
}

// Fonctions conservées pour cloture.js (pad DT inline, géré indépendamment)
function clearSignaturePad(padId) {
  // No-op pour les pads modale : la suppression se fait via clearSigModal()
}
