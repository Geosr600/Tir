/* cloture.js — écran de clôture terrain.
   Collecte : observations, CR DT, incidents, bilan munitions, heure début/fin,
   séance réalisée/annulée, signature DT. Persisté dans IndexedDB store 'cloture'. */

let _autoSaveClotureTimer = null;

/* ── Données par défaut ────────────────────────────────────────────── */

function buildDefaultCloture(seance) {
  let munitions = [];
  if (seance.munitionsPrevues && seance.munitionsPrevues.length > 0) {
    munitions = seance.munitionsPrevues.map(m => ({
      ref: m.ref, prevues: m.qte || 0,
      consommees: m.qte || 0, reintegrees: 0, defaillantes: 0,
    }));
  } else {
    const refs = new Set();
    (seance.armesDisponibles || []).forEach(a => { if (a.munitionRef) refs.add(a.munitionRef); });
    munitions = Array.from(refs).map(ref => ({
      ref, prevues: 0, consommees: 0, reintegrees: 0, defaillantes: 0,
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
    cloturee: false,
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
  const distribuees = mun.distribuees !== undefined ? (mun.distribuees || 0) : (mun.percues || 0);
  return distribuees - (mun.consommees || 0) - (mun.reintegrees || 0) - (mun.defaillantes || 0);
}

function _bilanIstcAuto() {
  const presents = Object.values(TERRAIN_STATE.saisies || {}).filter(s => !s.isEncadrement && s.present && s.categorieChoisie);
  const reussis = presents.filter(s => !calculerEliminatoireIstc(s.istcLignes || [], s.istcCatalogue || []));
  return { total: presents.length, reussis: reussis.length };
}

function _bilanTirAuto() {
  const presents = Object.values(TERRAIN_STATE.saisies || {}).filter(s => !s.isEncadrement && s.present && s.categorieChoisie);
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
      ${cl.signatureDT
        ? `<img id="dt-sig-thumb" src="${cl.signatureDT}" class="t-sig-thumbnail" alt="Signature DT" style="display:block;margin-bottom:8px">`
        : '<img id="dt-sig-thumb" class="t-sig-thumbnail" alt="" style="display:none">'
      }
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="t-btn t-btn-primary" onclick="openDTSig()">✍ ${cl.signatureDT ? 'Re-signer' : 'Signer…'}</button>
        ${cl.signatureDT ? '<button type="button" class="t-btn t-btn-secondary t-btn-small" onclick="clearDTSig()">🗑 Effacer</button>' : ''}
      </div>
      <div id="dt-sig-status" class="t-sig-status ${cl.signatureDT ? 'ok' : ''}" style="margin-top:6px">${cl.signatureDT ? '✓ Signé' : 'Non signé'}</div>
    </div>

    <!-- Validation clôture -->
    <div class="t-card">
      ${cl.cloturee
        ? `<div class="t-status ok" style="margin-bottom:10px">✓ Clôture validée le ${cl.dateClotureTerrain ? new Date(cl.dateClotureTerrain).toLocaleString('fr-FR') : '—'}</div>`
        : '<p class="t-hint" style="margin-bottom:10px">Vérifiez toutes les informations ci-dessus, puis validez la clôture pour accéder à l\'export.</p>'
      }
      <button class="t-btn t-btn-primary" onclick="validerCloture()">${cl.cloturee ? '↻ Re-valider la clôture' : '✓ Valider la clôture →'}</button>
    </div>
  `;

  requestAnimationFrame(() => _registerDTSigPad());
}

function _renderMunitionBloc(mun, idx) {
  const consomme = (mun.prevues || 0) - (mun.defaillantes || 0) - (mun.reintegrees || 0);
  const alerte = consomme < 0;
  return `
    <div class="t-mun-bloc">
      <div class="t-mun-ref">${mun.ref}</div>
      <div class="t-mun-grid">
        <span class="t-mun-label">Prévu</span>
        <input type="number" class="t-input t-mun-input" min="0" value="${mun.prevues||0}"
               onchange="setMunitionField(${idx}, 'prevues', this.value)">

        <span class="t-mun-label">Défaillante</span>
        <input type="number" class="t-input t-mun-input" min="0" value="${mun.defaillantes||0}"
               onchange="setMunitionField(${idx}, 'defaillantes', this.value)">

        <span class="t-mun-label">Réintégré</span>
        <input type="number" class="t-input t-mun-input" min="0" value="${mun.reintegrees||0}"
               onchange="setMunitionField(${idx}, 'reintegrees', this.value)">

        <span class="t-mun-label t-mun-ecart-label">Consommé</span>
        <span id="consomme-${idx}" class="t-mun-val t-ecart-val ${alerte ? 't-ecart-alerte' : ''}">${consomme}</span>
      </div>
      ${alerte ? '<div class="t-hint" style="color:var(--t-rouge);margin-top:8px;font-size:12px">⚠ Valeur négative — vérifiez les saisies.</div>' : ''}
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
  // Maintenir percues/distribuees en sync avec prevues pour compatibilité export principal
  if (champ === 'prevues') { mun.distribuees = mun.prevues; mun.percues = mun.prevues; }
  const consomme = (mun.prevues || 0) - (mun.defaillantes || 0) - (mun.reintegrees || 0);
  mun.consommees = consomme;
  scheduleAutoSaveCloture();
  const el = document.getElementById('consomme-' + idx);
  if (el) {
    el.textContent = consomme;
    el.className = 't-mun-val t-ecart-val' + (consomme < 0 ? ' t-ecart-alerte' : '');
  }
}

/* ── Signature DT via modale (signature.js) ───────────────────────── */

function _registerDTSigPad() {
  registerSigCallback('dt-cloture', (dataUrl) => {
    ensureCloture().signatureDT = dataUrl;
    scheduleAutoSaveCloture();
    const statusEl = document.getElementById('dt-sig-status');
    if (statusEl) { statusEl.textContent = '✓ Signé'; statusEl.className = 't-sig-status ok'; }
    const thumbEl = document.getElementById('dt-sig-thumb');
    if (thumbEl) { thumbEl.src = dataUrl; thumbEl.style.display = 'block'; }
  }, {
    title: 'Signature DT',
    getExisting: () => TERRAIN_STATE.cloture?.signatureDT || null,
  });
}

function openDTSig() {
  _registerDTSigPad();
  openSigModal('dt-cloture');
}

function clearDTSig() {
  ensureCloture().signatureDT = null;
  scheduleAutoSaveCloture();
  renderCloture();
}

/* ── Validation clôture ────────────────────────────────────────────── */

async function validerCloture() {
  const cl = ensureCloture();
  if (!cl.seanceRealisee && !(cl.motifAnnulation || '').trim()) {
    alert('Veuillez saisir le motif d\'annulation avant de valider.');
    return;
  }
  const munNegatifs = (cl.munitions || []).filter(m =>
    ((m.prevues || 0) - (m.defaillantes || 0) - (m.reintegrees || 0)) < 0
  );
  if (munNegatifs.length > 0) {
    alert('⚠ Munitions consommées négatives :\n' + munNegatifs.map(m => '• ' + m.ref).join('\n') + '\n\nVérifiez les saisies (Défaillante + Réintégré > Prévu).');
    return;
  }
  cl.cloturee = true;
  cl.dateClotureTerrain = new Date().toISOString();
  TERRAIN_STATE.cloture = cl;
  await dbSaveCloture(cl);
  renderCloture();
  setTimeout(goToExport, 300);
}
