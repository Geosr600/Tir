/* config-sig.js — écran "Configuration des signatures" :
   pré-enregistrement des signatures DT/MTC et module de test optionnel.
   Chargé après saisie.js et signature.js (dépend de leurs fonctions). */

const _CFG_ROLES_SIG = ['MTC_1', 'MTC_2', 'MTC_3', 'MTC_4', 'MTC_5'];

function _cfgEncadrementPourSig() {
  return (TERRAIN_STATE.seance && TERRAIN_STATE.seance.encadrement || [])
    .filter(e => _CFG_ROLES_SIG.includes(e.role));
}

function _cfgLabelRole(role) {
  if (role === 'DT') return 'Directeur de Tir';
  return role.replace('MTC_', 'MTC ');
}

/* ── Rendu principal ───────────────────────────────────────────────── */

function renderConfigSig() {
  const wrap = document.getElementById('config-sig-content');
  if (!wrap) return;

  const seance = TERRAIN_STATE.seance;
  if (!seance) {
    wrap.innerHTML = '<div class="t-card"><div class="t-hint">Aucune séance importée.</div></div>';
    return;
  }

  const encList = _cfgEncadrementPourSig();
  if (!encList.length) {
    wrap.innerHTML = `
      <div class="t-card">
        <h2>🖊 Signatures encadrement</h2>
        <div class="t-hint">Aucun DT/MTC renseigné dans cette séance.<br>Complétez la séance dans l'application principale avant d'exporter.</div>
      </div>`;
    return;
  }

  wrap.innerHTML = encList.map(_cfgRenderEncadrementCard).join('');

  requestAnimationFrame(() => encList.forEach(_cfgRegisterSigPad));
}

function _cfgRenderEncadrementCard(enc) {
  const role   = enc.role;
  const label  = _cfgLabelRole(role);
  const sigEnc = TERRAIN_STATE.signaturesEncadrement || {};
  const sig    = sigEnc[role] || null;
  const hasSig = !!(sig && sig.dataUrl);
  const hasTest = !!(TERRAIN_STATE.saisies && TERRAIN_STATE.saisies['enc-' + role]);

  return `
  <div class="t-card">
    <h2>${label}</h2>
    <div class="t-hint" style="margin-bottom:12px">${[enc.grade, enc.nom, enc.prenom].filter(Boolean).join(' ')}</div>

    <div class="t-seclabel">Signature pré-enregistrée</div>
    ${hasSig
      ? `<img src="${sig.dataUrl}" alt="Signature ${label}"
           style="display:block;width:100%;max-height:72px;object-fit:contain;border:1px solid var(--t-border);border-radius:6px;margin-bottom:8px">`
      : ''
    }
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">
      <button type="button" class="t-btn t-btn-primary t-btn-small" style="flex:1"
              onclick="ouvrirSigEncadrement('${role}')">✍ ${hasSig ? 'Re-signer' : 'Signer…'}</button>
      ${hasSig ? `<button type="button" class="t-btn t-btn-secondary t-btn-small"
              onclick="effacerSigEncadrement('${role}')">🗑 Effacer</button>` : ''}
    </div>
    <div class="t-sig-status ${hasSig ? 'ok' : ''}">${hasSig ? '✓ Signé' : 'Non signé'}</div>

    <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--t-border)">
      <div class="t-seclabel">Module de test (optionnel)</div>
      <div class="t-hint" style="margin-bottom:8px">Résultats ISTC / Test tir de cet encadrant. Si absent : aucun échec pris en compte.</div>
      <button type="button" class="t-btn t-btn-secondary t-btn-small" style="width:100%"
              onclick="ouvrirTestEncadrement('${role}')">
        📝 ${hasTest ? 'Modifier le test' : 'Saisir résultats test'}
      </button>
    </div>
  </div>`;
}

/* ── Signatures ────────────────────────────────────────────────────── */

function _cfgRegisterSigPad(enc) {
  const role  = enc.role;
  const padId = 'enc-sig-' + role;
  registerSigCallback(padId, (dataUrl) => {
    if (!TERRAIN_STATE.signaturesEncadrement) TERRAIN_STATE.signaturesEncadrement = {};
    TERRAIN_STATE.signaturesEncadrement[role] = {
      dataUrl,
      grade:      enc.grade      || '',
      nom:        enc.nom        || '',
      prenom:     enc.prenom     || '',
      nomComplet: enc.nomComplet || '',
    };
    dbSaveSignaturesEncadrement(TERRAIN_STATE.signaturesEncadrement).catch(() => {});
    renderConfigSig();
  }, {
    title:       `Signature — ${_cfgLabelRole(role)} (${enc.nomComplet || ''})`,
    getExisting: () => ((TERRAIN_STATE.signaturesEncadrement || {})[role] || {}).dataUrl || null,
  });
}

function ouvrirSigEncadrement(role) {
  const enc = _cfgEncadrementPourSig().find(e => e.role === role);
  if (!enc) return;
  _cfgRegisterSigPad(enc);
  openSigModal('enc-sig-' + role);
}

function effacerSigEncadrement(role) {
  if (TERRAIN_STATE.signaturesEncadrement && TERRAIN_STATE.signaturesEncadrement[role]) {
    TERRAIN_STATE.signaturesEncadrement[role].dataUrl = null;
  }
  dbSaveSignaturesEncadrement(TERRAIN_STATE.signaturesEncadrement || {}).catch(() => {});
  renderConfigSig();
}

/* ── Module de test encadrement ────────────────────────────────────── */

function ouvrirTestEncadrement(role) {
  const seance = TERRAIN_STATE.seance;
  const enc = _cfgEncadrementPourSig().find(e => e.role === role);
  if (!enc || !seance) return;

  const key = 'enc-' + role;
  if (!TERRAIN_STATE.saisies[key]) {
    const saisie = buildDefaultSaisie({
      nid: enc.nid || '',
      badge: enc.badge || '',
      nomComplet: enc.nomComplet || '',
      armesPrevues: [],
      nettoyagePrevu: false,
    }, seance);
    saisie.isEncadrement   = true;
    saisie.roleEncadrement = role;
    TERRAIN_STATE.saisies[key] = saisie;
    dbSaveSaisie(key, saisie).catch(() => {});
  }
  goToFiche(key);
}
