/* cloture.js — écran de clôture terrain.
   Collecte : observations, CR DT, incidents, bilan munitions, heure début/fin,
   séance réalisée/annulée, signature DT. Persisté dans IndexedDB store 'cloture'. */

let _autoSaveClotureTimer = null;
let _dtSigState = { canvas: null, ctx: null, drawing: false };

/* ── Données par défaut ────────────────────────────────────────────── */

function buildDefaultCloture(seance) {
  let munitions = [];
  if (seance.munitionsPrevues && seance.munitionsPrevues.length > 0) {
    munitions = seance.munitionsPrevues.map(m => ({
      ref: m.ref, prevues: m.qte || 0,
      percues: 0, consommees: 0, reintegrees: 0, defaillantes: 0, observations: '',
    }));
  } else {
    const refs = new Set();
    (seance.armesDisponibles || []).forEach(a => { if (a.munitionRef) refs.add(a.munitionRef); });
    munitions = Array.from(refs).map(ref => ({
      ref, prevues: 0, percues: 0, consommees: 0, reintegrees: 0, defaillantes: 0, observations: '',
    }));
  }
  return {
    observationsGenerales: '',
    compteRenduDT: '',
    incidents: '',
    noSafeGlobal: false,
    remarquesEncadrement: '',
    munitions,
    heureDebut: '',
    heureFin: '',
    seanceRealisee: true,
    motifAnnulation: '',
    signatureDT: null,
    dateClotureTerrain: null,
  };
}

function ensureCloture() {
  if (!TERRAIN_STATE.cloture) {
    TERRAIN_STATE.cloture = buildDefaultCloture(TERRAIN_STATE.seance);
  }
  return TERRAIN_STATE.cloture;
}

function scheduleAutoSaveCloture() {
  clearTimeout(_autoSaveClotureTimer);
  _autoSaveClotureTimer = setTimeout(() => {
    if (TERRAIN_STATE.cloture) dbSaveCloture(TERRAIN_STATE.cloture).catch(() => {});
  }, 500);
}

/* ── Calculs ───────────────────────────────────────────────────────── */

function calculerEcartMunitions(mun) {
  return (mun.percues || 0) - (mun.consommees || 0) - (mun.reintegrees || 0) - (mun.defaillantes || 0);
}

function _bilanIstcAuto() {
  const presents = Object.values(TERRAIN_STATE.saisies || {}).filter(s => s.present && s.categorieChoisie);
  const reussis = presents.filter(s => !calculerEliminatoireIstc(s.istcLignes || [], s.istcCatalogue || []));
  return { total: presents.length, reussis: reussis.length };
}

function _bilanTirAuto() {
  const presents = Object.values(TERRAIN_STATE.saisies || {}).filter(s => s.present && s.categorieChoisie);
  const reussis = presents.filter(s =>
    calculerResultatTestTir(s.categorieChoisie, calculerTotalTestTir(s.testTirSequences || []), s.testTirNoSafe) === 'REUSSITE'
  );
  return { total: presents.length, reussis: reussis.length };
}

/* ── Rendu ─────────────────────────────────────────────────────────── */

function renderCloture() {
  const wrap = document.getElementById('cloture-content');
  if (!wrap) return;

  const seance = TERRAIN_STATE.seance;
  if (!seance) {
    wrap.innerHTML = '<div class="t-card"><div class="t-hint">Aucune séance importée.</div></div>';
    return;
  }

  const cl = ensureCloture();
  const bilanI = _bilanIstcAuto();
  const bilanT = _bilanTirAuto();

  wrap.innerHTML = `
    <!-- Informations générales -->
    <div class="t-card">
      <h2>📋 Clôture — ${seance.lieuLib || seance.lieu || '—'}</h2>
      <div class="t-cl-row">
        <div class="t-fg t-cl-half">
          <label>Heure début</label>
          <input type="time" class="t-input" value="${cl.heureDebut||''}" onchange="setClotureChamp('heureDebut', this.value)">
        </div>
        <div class="t-fg t-cl-half">
          <label>Heure fin</label>
          <input type="time" class="t-input" value="${cl.heureFin||''}" onchange="setClotureChamp('heureFin', this.value)">
        </div>
      </div>
      <div class="t-fg">
        <label>Séance</label>
        <div class="t-seg-ctrl">
          <button class="t-seg-btn ${cl.seanceRealisee ? 'on' : ''}" onclick="setClotureRealisee(true)">✓ Réalisée</button>
          <button class="t-seg-btn ${!cl.seanceRealisee ? 'on danger' : ''}" onclick="setClotureRealisee(false)">✗ Annulée</button>
        </div>
      </div>
      ${!cl.seanceRealisee ? `
      <div class="t-fg">
        <label>Motif d'annulation</label>
        <textarea class="t-textarea" onchange="setClotureChamp('motifAnnulation', this.value)">${cl.motifAnnulation||''}</textarea>
      </div>` : ''}
    </div>

    <!-- Compte rendu -->
    <div class="t-card">
      <h2>📝 Compte rendu DT</h2>
      <div class="t-fg">
        <label>Observations générales</label>
        <textarea class="t-textarea" rows="3" onchange="setClotureChamp('observationsGenerales', this.value)">${cl.observationsGenerales||''}</textarea>
      </div>
      <div class="t-fg">
        <label>Compte rendu DT</label>
        <textarea class="t-textarea" rows="3" onchange="setClotureChamp('compteRenduDT', this.value)">${cl.compteRenduDT||''}</textarea>
      </div>
      <div class="t-fg">
        <label>Incidents / No safe</label>
        <textarea class="t-textarea" rows="2" onchange="setClotureChamp('incidents', this.value)">${cl.incidents||''}</textarea>
      </div>
      <div class="t-fg">
        <label>Remarques encadrement</label>
        <textarea class="t-textarea" rows="2" onchange="setClotureChamp('remarquesEncadrement', this.value)">${cl.remarquesEncadrement||''}</textarea>
      </div>
    </div>

    <!-- Bilans auto -->
    <div class="t-card">
      <h2>📊 Bilans (calculés automatiquement)</h2>
      <div class="t-bilan-row ${bilanI.reussis < bilanI.total ? 't-bilan-partiel' : 't-bilan-ok'}">
        <span class="t-bilan-label">ISTC</span>
        <span class="t-bilan-val">${bilanI.reussis} / ${bilanI.total} réussis</span>
      </div>
      <div class="t-bilan-row ${bilanT.reussis < bilanT.total ? 't-bilan-partiel' : 't-bilan-ok'}">
        <span class="t-bilan-label">Test Tir</span>
        <span class="t-bilan-val">${bilanT.reussis} / ${bilanT.total} réussis</span>
      </div>
    </div>

    <!-- Munitions -->
    ${cl.munitions.length > 0 ? `
    <div class="t-card">
      <h2>🔵 Munitions — bilan</h2>
      ${cl.munitions.map((mun, idx) => _renderMunitionBloc(mun, idx)).join('')}
    </div>` : ''}

    <!-- Signature DT -->
    <div class="t-card">
      <h2>✍ Signature DT</h2>
      <div class="t-sig-pad-wrap">
        <canvas id="dt-sig-canvas" class="t-sig-pad"></canvas>
      </div>
      <div class="t-sig-actions">
        <button type="button" class="t-btn t-btn-secondary t-btn-small" onclick="clearDTSignature()">Effacer</button>
      </div>
      <div id="dt-sig-status" class="t-sig-status ${cl.signatureDT ? 'ok' : ''}">${cl.signatureDT ? '✓ Signé' : 'Non signé'}</div>
    </div>

    <div class="t-card">
      <p class="t-hint">La clôture est sauvegardée automatiquement. Elle sera intégrée dans le JSON lors de l'export final.</p>
    </div>
  `;

  requestAnimationFrame(() => _initDTSignaturePad());
}

function _renderMunitionBloc(mun, idx) {
  const ecart = calculerEcartMunitions(mun);
  const ecartCls = ecart !== 0 ? 't-ecart-alerte' : '';
  return `
    <div class="t-mun-bloc">
      <div class="t-mun-ref">${mun.ref}</div>
      <div class="t-mun-grid">
        <span class="t-mun-label">Prévues</span>
        <span class="t-mun-val t-mun-readonly">${mun.prevues}</span>

        <span class="t-mun-label">Perçues</span>
        <input type="number" class="t-input t-mun-input" min="0" value="${mun.percues||0}"
               onchange="setMunitionField(${idx}, 'percues', this.value)">

        <span class="t-mun-label">Consommées</span>
        <input type="number" class="t-input t-mun-input" min="0" value="${mun.consommees||0}"
               onchange="setMunitionField(${idx}, 'consommees', this.value)">

        <span class="t-mun-label">Réintégrées</span>
        <input type="number" class="t-input t-mun-input" min="0" value="${mun.reintegrees||0}"
               onchange="setMunitionField(${idx}, 'reintegrees', this.value)">

        <span class="t-mun-label">Défaillantes</span>
        <input type="number" class="t-input t-mun-input" min="0" value="${mun.defaillantes||0}"
               onchange="setMunitionField(${idx}, 'defaillantes', this.value)">

        <span class="t-mun-label t-mun-ecart-label">Écart</span>
        <span id="ecart-${idx}" class="t-mun-val t-ecart-val ${ecartCls}">${ecart}</span>
      </div>
      ${ecart !== 0 ? `
      <div id="mun-obs-${idx}" class="t-fg t-mun-obs-wrap">
        <label>⚠ Observation obligatoire (écart ≠ 0)</label>
        <textarea class="t-textarea" onchange="setMunitionObservation(${idx}, this.value)">${mun.observations||''}</textarea>
      </div>` : `<div id="mun-obs-${idx}" class="t-fg t-mun-obs-wrap" style="display:none">
        <label>⚠ Observation obligatoire (écart ≠ 0)</label>
        <textarea class="t-textarea" onchange="setMunitionObservation(${idx}, this.value)">${mun.observations||''}</textarea>
      </div>`}
    </div>`;
}

/* ── Mutateurs ─────────────────────────────────────────────────────── */

function setClotureChamp(champ, val) {
  ensureCloture()[champ] = val;
  scheduleAutoSaveCloture();
}

function setClotureRealisee(val) {
  ensureCloture().seanceRealisee = val;
  scheduleAutoSaveCloture();
  renderCloture();
}

function setMunitionField(idx, champ, val) {
  const mun = ensureCloture().munitions[idx];
  if (!mun) return;
  mun[champ] = parseInt(val, 10) || 0;
  scheduleAutoSaveCloture();
  const ecart = calculerEcartMunitions(mun);
  const ecartEl = document.getElementById('ecart-' + idx);
  if (ecartEl) {
    ecartEl.textContent = ecart;
    ecartEl.className = 't-mun-val t-ecart-val' + (ecart !== 0 ? ' t-ecart-alerte' : '');
  }
  const obsWrap = document.getElementById('mun-obs-' + idx);
  if (obsWrap) obsWrap.style.display = ecart !== 0 ? 'block' : 'none';
}

function setMunitionObservation(idx, val) {
  const mun = ensureCloture().munitions[idx];
  if (!mun) return;
  mun.observations = val;
  scheduleAutoSaveCloture();
}

/* ── Signature DT (canvas autonome, sans signature.js) ────────────── */

function _initDTSignaturePad() {
  const canvas = document.getElementById('dt-sig-canvas');
  if (!canvas) return;
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width  = Math.max(1, Math.round(rect.width  * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.lineWidth   = 2.2;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.strokeStyle = '#1a1a2e';
  _dtSigState = { canvas, ctx, drawing: false };

  const existing = TERRAIN_STATE.cloture?.signatureDT;
  if (existing) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
    img.src = existing;
  }

  function getXY(e) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.buttons !== 1 && e.pointerType === 'mouse') return;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getXY(e);
    _dtSigState.drawing = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('pointermove', e => {
    if (!_dtSigState.drawing) return;
    const { x, y } = getXY(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    e.preventDefault();
  }, { passive: false });

  const endDraw = () => {
    if (!_dtSigState.drawing) return;
    _dtSigState.drawing = false;
    const dataUrl = canvas.toDataURL('image/png', 0.6);
    ensureCloture().signatureDT = dataUrl;
    scheduleAutoSaveCloture();
    const st = document.getElementById('dt-sig-status');
    if (st) { st.textContent = '✓ Signé'; st.classList.add('ok'); }
  };

  canvas.addEventListener('pointerup',     endDraw);
  canvas.addEventListener('pointerleave',  endDraw);
  canvas.addEventListener('pointercancel', endDraw);
}

function clearDTSignature() {
  const { canvas, ctx } = _dtSigState;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  ensureCloture().signatureDT = null;
  scheduleAutoSaveCloture();
  const st = document.getElementById('dt-sig-status');
  if (st) { st.textContent = 'Non signé'; st.classList.remove('ok'); }
}
