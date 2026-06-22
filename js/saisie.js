/* saisie.js — écrans liste des tireurs + fiche tireur (saisie ISTC/Test tir).
   Toute modification met à jour TERRAIN_STATE.saisies[key] puis déclenche un auto-save
   IndexedDB (debounce ~500ms) via scheduleAutoSave(). regles.js fournit les calculs. */

let _autoSaveTimers = {};

function scheduleAutoSave(key) {
  clearTimeout(_autoSaveTimers[key]);
  _autoSaveTimers[key] = setTimeout(() => {
    dbSaveSaisie(key, TERRAIN_STATE.saisies[key]);
  }, 500);
}

function getSaisie(key) {
  return TERRAIN_STATE.saisies[key];
}

function getTireur(key) {
  // Encadrant (enc-DT, enc-MTC_1…)
  if (key && key.startsWith('enc-')) {
    const role = key.slice(4);
    const enc = ((TERRAIN_STATE.seance && TERRAIN_STATE.seance.encadrement) || []).find(e => e.role === role);
    if (!enc) return null;
    return {
      nomComplet:    enc.nomComplet || '',
      unite:         enc.unite     || '',
      grade:         enc.grade     || '',
      nid:           enc.nid       || '',
      badge:         enc.badge     || '',
      _isEncadrement: true,
      _roleLabel:    enc.role === 'DT' ? 'Directeur de Tir' : enc.role.replace('MTC_', 'MTC '),
    };
  }
  // Tireurs planifiés de la séance
  const fromSeance = ((TERRAIN_STATE.seance && TERRAIN_STATE.seance.tireurs) || []).find(t => personKey(t) === key);
  if (fromSeance) return fromSeance;
  // Tireurs ajoutés manuellement sur le terrain
  return (TERRAIN_STATE.tireursAjoutes || []).find(t => personKey(t) === key) || null;
}

/* ── Écran liste ─────────────────────────────────────────────────── */

function renderListeTireurs() {
  const seance = TERRAIN_STATE.seance;
  const wrap   = document.getElementById('liste-tireurs');
  const titre  = document.getElementById('liste-titre');
  if (!seance) { wrap.innerHTML = ''; return; }

  const planifies = seance.tireurs || [];
  const ajoutes   = TERRAIN_STATE.tireursAjoutes || [];
  const total     = planifies.length + ajoutes.length;

  titre.textContent = `📋 Tireurs — ${seance.dateTir || ''} (${total})`;

  const lignesPlanifies = planifies.map(t => {
    const key = personKey(t);
    const s = getSaisie(key) || buildDefaultSaisie(t, seance);
    const { label, cls } = _statutTireur(s);
    return `
      <div class="t-tireur-row" onclick="goToFiche('${key}')">
        <div>
          <div class="t-tireur-nom">${t.nomComplet}</div>
          <div class="t-tireur-sub">${t.unite || ''}</div>
        </div>
        <span class="t-badge ${cls}">${label}</span>
      </div>`;
  }).join('');

  const lignesAjoutes = ajoutes.map(t => {
    const key = personKey(t);
    const s = getSaisie(key) || buildDefaultSaisie(t, seance);
    const { label, cls } = _statutTireur(s);
    return `
      <div class="t-tireur-row" onclick="goToFiche('${key}')">
        <div>
          <div class="t-tireur-nom">${t.nomComplet} <span class="t-badge t-badge-terrain" style="font-size:10px;vertical-align:middle;margin-left:4px">+terrain</span></div>
          <div class="t-tireur-sub">${t.unite || ''}</div>
        </div>
        <span class="t-badge ${cls}">${label}</span>
      </div>`;
  }).join('');

  const listeHtml = (lignesPlanifies + lignesAjoutes) || '<div class="t-hint">Aucun tireur dans cette séance.</div>';

  wrap.innerHTML = listeHtml + `
    <div style="margin-top:12px;border-top:1px solid var(--t-border);padding-top:10px">
      <button type="button" class="t-btn t-btn-secondary t-btn-small" style="width:100%"
              onclick="ouvrirFormulaireAjout()">+ Ajouter un tireur</button>
    </div>`;
}

function _statutTireur(s) {
  if (!s.present) return { label: 'Absent', cls: 't-badge-absent' };
  if (_isSaisieTerminee(s)) return { label: '✓ Terminé', cls: 't-badge-done' };
  // "En cours" dès que catégorie choisie (ISTC pré-rempli vert, scores restent à saisir)
  if (s.categorieChoisie) return { label: 'En cours', cls: 't-badge-progress' };
  return { label: 'À saisir', cls: 't-badge-todo' };
}

/* ── Écran fiche tireur ──────────────────────────────────────────── */

function renderFicheTireur(key) {
  const seance = TERRAIN_STATE.seance;
  const t = getTireur(key);
  const s = getSaisie(key);
  const el = document.getElementById('fiche-content');
  if (!t || !s) { el.innerHTML = '<div class="t-hint">Tireur introuvable.</div>'; return; }

  const isEnc      = !!t._isEncadrement;
  const isTerrain  = !isEnc && !!(TERRAIN_STATE.tireursAjoutes || []).find(ta => personKey(ta) === key);
  const cloturee   = !!(TERRAIN_STATE.cloture && TERRAIN_STATE.cloture.cloturee);
  const showContent = isEnc || s.present;

  const armesPossibles = (seance.armesDisponibles || []).filter(a => !s.categorieChoisie || a.categorie === s.categorieChoisie);

  el.innerHTML = `
    <div class="t-card">
      <div class="t-fiche-header">
        <h2>${t.nomComplet}</h2>
        ${isEnc ? `<span class="t-badge t-badge-progress" style="font-size:10px">${t._roleLabel}</span>` : ''}
        ${isTerrain ? '<span class="t-badge t-badge-terrain" style="font-size:10px">+terrain</span>' : ''}
      </div>
      <div class="t-hint">${t.unite || ''}${t.grade ? ' · ' + t.grade : ''}</div>
      ${isEnc ? '<div class="t-hint" style="margin-top:6px;color:#b8860b">⚠ Module de test optionnel — aucun échec pris en compte pour l\'encadrement.</div>' : ''}

      ${!isEnc ? `
      <div class="t-present-toggle">
        <button class="t-btn ${s.present ? 'on present' : ''}" style="flex:1" onclick="setPresence('${key}', true)">✓ Présent</button>
        <button class="t-btn ${!s.present ? 'on absent' : ''}" style="flex:1" onclick="setPresence('${key}', false)">✗ Absent</button>
      </div>` : ''}
    </div>

    ${showContent
      ? _renderFicheContenuPresent(key, t, s, seance, armesPossibles)
      : _renderFicheAbsent(key, s)}

    ${isTerrain && !cloturee ? `
    <div class="t-card">
      <button type="button" class="t-btn t-btn-danger"
              onclick="supprimerTireurAjoute('${key}')">🗑 Supprimer ce tireur (ajouté terrain)</button>
    </div>` : ''}
  `;

  if (showContent && s.categorieChoisie) {
    registerSigPad('sig-istc-tireur',    key, 'tireur',    'istc');
    registerSigPad('sig-istc-formateur', key, 'formateur', 'istc');
    registerSigPad('sig-tir-tireur',     key, 'tireur',    'tir');
    registerSigPad('sig-tir-formateur',  key, 'formateur', 'tir');
  }
}

function _renderFicheAbsent(key, s) {
  return `
    <div class="t-card">
      <div class="t-hint">Ce tireur est marqué absent.</div>
      ${s.remplacePar
        ? `<div class="t-hint" style="margin-top:6px">Remplacé par : <b>${s.remplacePar}</b></div>`
        : `<button type="button" class="t-btn t-btn-secondary" style="margin-top:12px;width:100%"
                  onclick="ouvrirFormulaireAjout('${key}')">👤 Désigner un remplaçant</button>`
      }
      <div class="t-fg" style="margin-top:12px">
        <label>Observations</label>
        <textarea class="t-textarea" onchange="setObservationsLibres('${key}', this.value)">${s.observationsLibres||''}</textarea>
      </div>
    </div>`;
}

function _renderFicheContenuPresent(key, t, s, seance, armesPossibles) {
  const seancePAFA = seance.typeArme === 'PAFA';
  return `
    <div class="t-card">
      ${seancePAFA ? `
        <div class="t-fg">
          <label>Catégorie testée</label>
          <select class="t-select" onchange="setCategorie('${key}', this.value)">
            <option value="">— choisir —</option>
            <option value="FA" ${s.categorieChoisie === 'FA' ? 'selected' : ''}>Fusil d'assaut (FA)</option>
            <option value="PA" ${s.categorieChoisie === 'PA' ? 'selected' : ''}>Arme de poing (PA)</option>
          </select>
        </div>` : ''}
      <div class="t-fg">
        <label>Arme utilisée</label>
        <select class="t-select" onchange="setArmeUtilisee('${key}', this.value)">
          <option value="">— choisir —</option>
          ${armesPossibles.map(a => `<option value="${a.id}" ${(s.armesUtilisees||[])[0]===a.id?'selected':''}>${a.nom}</option>`).join('')}
        </select>
      </div>
      <label class="t-fg" style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" ${s.nettoyageEffectue?'checked':''} onchange="setNettoyage('${key}', this.checked)">
        <span>Nettoyage armement effectué</span>
      </label>
    </div>

    ${!s.categorieChoisie ? '<div class="t-card"><div class="t-hint">Choisissez une catégorie pour afficher les grilles ISTC / Test tir.</div></div>' : `
    <div class="t-card">
      <h2>📋 ISTC — Vérification des connaissances</h2>
      <div class="t-fg t-date-field">
        <label>Date ISTC <span class="t-date-hint">(depuis la NDS — modifier si exceptionnel)</span></label>
        <input type="date" class="t-input" value="${s.istcDateIstc||''}" onchange="setIstcDate('${key}', this.value)">
      </div>
      <div class="t-seclabel">Connaissances (lignes 1-3 éliminatoires si rouge)</div>
      ${(s.istcLignes||[]).map(l => _renderLigneCouleur(key, 'istcLignes', l, s.categorieChoisie)).join('')}
      <div class="t-seclabel" style="display:flex;align-items:center;justify-content:space-between">
        <span>Catalogue des tirs d'instruction</span>
        <label style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:normal">
          <input type="checkbox" ${s.istcCatalogueNonEffectue?'checked':''}
                 onchange="setIstcCatalogueNonEffectue('${key}', this.checked)">
          Non effectué
        </label>
      </div>
      ${s.istcCatalogueNonEffectue
        ? '<div class="t-hint" style="padding:6px 0 10px">⊘ Tir instruction non effectué — non pris en compte dans le résultat.</div>'
        : (s.istcCatalogue||[]).map(l => _renderLigneCatalogue(key, l, s.categorieChoisie)).join('')
      }
      <div class="t-fg" style="margin-top:12px">
        <label>Observations générales ISTC</label>
        <textarea class="t-textarea" onchange="setIstcObservations('${key}', this.value)">${s.istcObservations||''}</textarea>
      </div>
      ${_renderResultBanner(calculerResultatIstc(calculerEliminatoireIstc(s.istcLignes || [], s.istcCatalogueNonEffectue ? [] : (s.istcCatalogue || []))))}
      <div class="t-seclabel">Signature du Tireur</div>
      ${signatureButtonHtml('sig-istc-tireur', s.istcSignatures && s.istcSignatures.tireur)}
      <div class="t-seclabel">Signature du MTC</div>
      <div class="t-sig-mtc-zone">
        ${_getMtcIdentite(s, 'istc') ? `<div class="t-sig-mtc-watermark">${_getMtcIdentite(s, 'istc')}</div>` : ''}
        ${signatureButtonHtml('sig-istc-formateur', s.istcSignatures && s.istcSignatures.formateur)}
      </div>
      ${_renderMTCButtons(key, 'istc')}
    </div>

    <div class="t-card">
      <h2>🎯 Test tir — ${s.categorieChoisie === 'FA' ? "Fusil d'assaut" : 'Arme de poing'} <span style="font-weight:400;font-size:14px">/ ${TOTAL_MAX[s.categorieChoisie]} pts</span></h2>
      <div class="t-fg t-date-field">
        <label>Date tir <span class="t-date-hint">(depuis la NDS — modifier si exceptionnel)</span></label>
        <input type="date" class="t-input" value="${s.tirDateTir||''}" onchange="setTirDate('${key}', this.value)">
      </div>
      ${(SEQUENCES[s.categorieChoisie]||[]).map(def => {
        const sq = (s.testTirSequences||[]).find(x => x.n === def.n) || { n: def.n, score: 0 };
        return _renderSequenceTestTir(key, sq, def);
      }).join('')}
      <div class="t-seq-total-row">
        <b id="tt-total-${key}">Score : ${calculerTotalTestTir(s.testTirSequences)} / ${TOTAL_MAX[s.categorieChoisie]}</b>
        <span class="t-nosafe-toggle ${s.testTirNoSafe?'on':''}" onclick="toggleTestTirNoSafe('${key}')">⚠ NO SAFE</span>
      </div>
      <div class="t-fg" style="margin-top:10px">
        <label>Commentaires</label>
        <textarea class="t-textarea" onchange="setTestTirCommentaires('${key}', this.value)">${s.testTirCommentaires||''}</textarea>
      </div>
      ${_renderResultBanner(calculerResultatTestTir(s.categorieChoisie, calculerTotalTestTir(s.testTirSequences), s.testTirNoSafe))}
      <div class="t-seclabel">Signature Tir — Tireur</div>
      ${signatureButtonHtml('sig-tir-tireur', s.tirSignatures && s.tirSignatures.tireur)}
      <div class="t-seclabel">Signature Tir — Formateur / MTC</div>
      ${signatureButtonHtml('sig-tir-formateur', s.tirSignatures && s.tirSignatures.formateur)}
      ${_renderMTCButtons(key, 'tir')}
    </div>
    `}

    <div class="t-card">
      <div class="t-fg">
        <label>Observations libres</label>
        <textarea class="t-textarea" onchange="setObservationsLibres('${key}', this.value)">${s.observationsLibres||''}</textarea>
      </div>
    </div>
  `;
}

function _renderLigneCouleur(key, field, l, categorie) {
  const eliminatoire = field === 'istcLignes' && LIGNES_ELIMINATOIRES.includes(l.n);
  const def = field === 'istcLignes' ? (ISTC_LIBELLES[categorie] || []).find(d => d.n === l.n) : null;
  const libelle = def ? def.libelle : '';

  // Lignes éliminatoires (1-3) : vert/rouge uniquement (pas de jaune)
  const colorBtns = eliminatoire
    ? `<div class="t-color-btn vert ${l.couleur==='vert'?'on':''}" onclick="setLigneCouleur('${key}','${field}',${l.n},'vert')"></div>
       <div class="t-color-btn rouge ${l.couleur==='rouge'?'on':''}" onclick="setLigneCouleur('${key}','${field}',${l.n},'rouge')"></div>`
    : `<div class="t-color-btn vert ${l.couleur==='vert'?'on':''}" onclick="setLigneCouleur('${key}','${field}',${l.n},'vert')"></div>
       <div class="t-color-btn jaune ${l.couleur==='jaune'?'on':''}" onclick="setLigneCouleur('${key}','${field}',${l.n},'jaune')"></div>
       <div class="t-color-btn rouge ${l.couleur==='rouge'?'on':''}" onclick="setLigneCouleur('${key}','${field}',${l.n},'rouge')"></div>`;

  return `
    <div class="t-ligne-row t-ligne-row--avec-libelle">
      <span class="t-ligne-num ${eliminatoire?'t-ligne-eliminatoire':''}">${l.n}</span>
      <span class="t-ligne-libelle${eliminatoire?' t-ligne-eliminatoire':''}">${libelle}</span>
      <div class="t-tri-color">${colorBtns}</div>
    </div>`;
}

function _renderLigneCatalogue(key, l, categorie) {
  const def = (CATALOGUE_LIBELLES[categorie] || []).find(d => d.n === l.n);
  const cartouches = def ? def.cartouches : '';
  const libelle = def ? def.libelle : '';
  return `
    <div class="t-ligne-row t-ligne-row--avec-libelle">
      <span class="t-ligne-num">${l.n}</span>
      <span class="t-ligne-libelle"><span class="t-cat-cart">${cartouches} cart.</span> ${libelle}</span>
      <div class="t-tri-color">
        <div class="t-color-btn vert ${l.couleur==='vert'?'on':''}" onclick="setLigneCouleur('${key}','istcCatalogue',${l.n},'vert')"></div>
        <div class="t-color-btn jaune ${l.couleur==='jaune'?'on':''}" onclick="setLigneCouleur('${key}','istcCatalogue',${l.n},'jaune')"></div>
        <div class="t-color-btn rouge ${l.couleur==='rouge'?'on':''}" onclick="setLigneCouleur('${key}','istcCatalogue',${l.n},'rouge')"></div>
      </div>
      <span class="t-nosafe-toggle ${l.noSafe?'on':''}" onclick="toggleCatalogueNoSafe('${key}',${l.n})">NO SAFE</span>
    </div>`;
}

/** Séquence Test tir : boutons rapides [0…scoreMax] au lieu d'un input number. */
function _renderSequenceTestTir(key, sq, def) {
  let btns = '';
  for (let v = 0; v <= def.scoreMax; v++) {
    btns += `<button type="button" class="t-score-btn${sq.score === v ? ' on' : ''}"
      onclick="setSequenceScore('${key}',${def.n},${v})">${v}</button>`;
  }
  return `
    <div class="t-seq-bloc">
      <div class="t-seq-header">
        <span class="t-ligne-num">${def.n}</span>
        <span class="t-seq-libelle">${def.libelle}</span>
      </div>
      <div class="t-seq-meta-row">
        <span class="t-seq-meta-item">⏱ ${def.temps}</span>
        <span class="t-seq-meta-item">📏 ${def.distance}</span>
        <span class="t-seq-meta-item">🔵 ${def.cartouches}</span>
      </div>
      <div class="t-score-btn-row">
        ${btns}
        <span class="t-seq-scoremax">/ ${def.scoreMax}</span>
      </div>
    </div>`;
}

function _renderResultBanner(resultat) {
  return `<div class="t-result-banner ${resultat}">${resultat === 'REUSSITE' ? '✓ RÉUSSITE' : '✗ ÉCHEC'}</div>`;
}

/* ── Mutateurs d'état ────────────────────────────────────────────── */

function setPresence(key, present) {
  getSaisie(key).present = present;
  scheduleAutoSave(key);
  renderFicheTireur(key);
}

function setCategorie(key, cat) {
  const s = getSaisie(key);
  s.categorieChoisie = cat || null;
  s.armesUtilisees = [];
  s.istcCatalogue = cat ? buildCatalogueVide(cat) : buildCatalogueVide('FA');
  s.testTirSequences = cat ? buildSequencesVides(cat) : [];
  scheduleAutoSave(key);
  renderFicheTireur(key);
}

function setArmeUtilisee(key, armeId) {
  getSaisie(key).armesUtilisees = armeId ? [armeId] : [];
  scheduleAutoSave(key);
}

function setNettoyage(key, val) {
  getSaisie(key).nettoyageEffectue = !!val;
  scheduleAutoSave(key);
}

function setLigneCouleur(key, field, n, couleur) {
  const s = getSaisie(key);
  const ligne = s[field].find(l => l.n === n);
  if (!ligne) return;
  ligne.couleur = (ligne.couleur === couleur) ? null : couleur; // re-clic = désélectionne
  scheduleAutoSave(key);
  renderFicheTireur(key);
}

function toggleCatalogueNoSafe(key, n) {
  const s = getSaisie(key);
  const ligne = s.istcCatalogue.find(l => l.n === n);
  if (!ligne) return;
  ligne.noSafe = !ligne.noSafe;
  scheduleAutoSave(key);
  renderFicheTireur(key);
}

function setIstcObservations(key, val) {
  getSaisie(key).istcObservations = val;
  scheduleAutoSave(key);
}

function setIstcDate(key, val) {
  getSaisie(key).istcDateIstc = val;
  scheduleAutoSave(key);
}

function setTirDate(key, val) {
  getSaisie(key).tirDateTir = val;
  scheduleAutoSave(key);
}

function setSequenceScore(key, n, val) {
  const s = getSaisie(key);
  const seq = s.testTirSequences.find(x => x.n === n);
  if (!seq) return;
  seq.score = Math.max(0, Number(val) || 0);
  scheduleAutoSave(key);
  const totalEl = document.getElementById('tt-total-' + key);
  if (totalEl) totalEl.textContent = `Score : ${calculerTotalTestTir(s.testTirSequences)} / ${TOTAL_MAX[s.categorieChoisie]}`;
  renderFicheTireur(key);
}

function toggleTestTirNoSafe(key) {
  const s = getSaisie(key);
  s.testTirNoSafe = !s.testTirNoSafe;
  scheduleAutoSave(key);
  renderFicheTireur(key);
}

function setTestTirCommentaires(key, val) {
  getSaisie(key).testTirCommentaires = val;
  scheduleAutoSave(key);
}

function setObservationsLibres(key, val) {
  getSaisie(key).observationsLibres = val;
  scheduleAutoSave(key);
}

function setIstcCatalogueNonEffectue(key, val) {
  getSaisie(key).istcCatalogueNonEffectue = !!val;
  scheduleAutoSave(key);
  renderFicheTireur(key);
}

/* ── Boutons MTC (injection signature pré-enregistrée) ──────────────── */

function _getMtcIdentite(saisie, bloc) {
  const infoField = bloc === 'tir' ? 'tirSignatureMTCInfo' : 'istcSignatureMTCInfo';
  const info = saisie[infoField];
  if (info && (info.grade || info.nom)) {
    return [info.grade, info.nom, info.prenom].filter(Boolean).join(' ').toUpperCase();
  }
  // Filigrane par défaut : premier MTC avec signature pré-enregistrée dans la séance
  const sigEnc    = TERRAIN_STATE.signaturesEncadrement || {};
  const seanceEnc = (TERRAIN_STATE.seance && TERRAIN_STATE.seance.encadrement) || [];
  const mtcRoles  = ['MTC_1', 'MTC_2', 'MTC_3', 'MTC_4', 'MTC_5'];
  const premier   = seanceEnc.find(e => mtcRoles.includes(e.role) && sigEnc[e.role] && sigEnc[e.role].dataUrl);
  if (premier) return [premier.grade, premier.nom, premier.prenom].filter(Boolean).join(' ').toUpperCase();
  return '';
}

function _renderMTCButtons(key, bloc) {
  const roles  = ['MTC_1', 'MTC_2', 'MTC_3', 'MTC_4', 'MTC_5'];
  const sigEnc = TERRAIN_STATE.signaturesEncadrement || {};
  const seanceEnc = (TERRAIN_STATE.seance && TERRAIN_STATE.seance.encadrement) || [];

  // Encadrants de la séance qui ont déjà signé en config-sig
  const disponibles = seanceEnc.filter(e => roles.includes(e.role) && sigEnc[e.role] && sigEnc[e.role].dataUrl);

  if (!disponibles.length) {
    const hasEnc = seanceEnc.some(e => roles.includes(e.role));
    if (!hasEnc) return '';
    return `<div class="t-hint" style="font-size:11px;margin-top:6px">
      Aucune signature encadrement enregistrée —
      <a onclick="goToConfigSig()" style="color:var(--t-primary);cursor:pointer;font-weight:700">→ Config. signatures</a>
    </div>`;
  }

  const btns = disponibles.map(e => {
    const lbl = e.role === 'DT' ? 'DT' : e.role.replace('MTC_', 'MTC ');
    return `<button type="button" class="t-btn t-btn-secondary t-btn-small"
              onclick="injecterSignatureMTC('${key}','${bloc}','${e.role}')">✍ ${lbl}</button>`;
  }).join('');

  return `<div style="margin-top:6px">
    <div style="font-size:11px;color:#888;margin-bottom:4px">Appliquer signature :</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${btns}</div>
  </div>`;
}

function injecterSignatureMTC(key, bloc, role) {
  const sig = (TERRAIN_STATE.signaturesEncadrement || {})[role];
  if (!sig || !sig.dataUrl) {
    alert('Signature non disponible. Enregistrez-la d\'abord dans "Configuration signatures".');
    return;
  }
  const s = getSaisie(key);
  if (!s) return;
  const sigField  = bloc === 'tir' ? 'tirSignatures'        : 'istcSignatures';
  const infoField = bloc === 'tir' ? 'tirSignatureMTCInfo'  : 'istcSignatureMTCInfo';
  if (!s[sigField]) s[sigField] = { tireur: null, formateur: null, dateSignature: null };
  s[sigField].formateur     = sig.dataUrl;
  s[sigField].dateSignature = new Date().toISOString().split('T')[0];
  s[infoField] = { grade: sig.grade, nom: sig.nom, prenom: sig.prenom, role };
  scheduleAutoSave(key);
  renderFicheTireur(key);
}

/* ── Ajout / remplacement de tireur terrain ─────────────────────────── */

function ouvrirFormulaireAjout(keyOriginalAbsent) {
  const modal = document.getElementById('modal-ajout-tireur');
  if (!modal) return;
  modal.dataset.keyOriginal = keyOriginalAbsent || '';
  const titleEl = modal.querySelector('h2');
  if (titleEl) titleEl.textContent = keyOriginalAbsent ? '👤 Désigner un remplaçant' : '+ Ajouter un tireur';
  document.getElementById('ajout-grade').value  = '';
  document.getElementById('ajout-nom').value    = '';
  document.getElementById('ajout-prenom').value = '';
  document.getElementById('ajout-unite').value  = (TERRAIN_STATE.seance && TERRAIN_STATE.seance.unite) || '';
  modal.style.display = 'flex';
}

function fermerFormulaireAjout() {
  const modal = document.getElementById('modal-ajout-tireur');
  if (modal) modal.style.display = 'none';
}

async function validerAjoutTireur() {
  const modal  = document.getElementById('modal-ajout-tireur');
  const grade  = document.getElementById('ajout-grade').value.trim();
  const nom    = document.getElementById('ajout-nom').value.trim().toUpperCase();
  const prenom = document.getElementById('ajout-prenom').value.trim();
  const unite  = document.getElementById('ajout-unite').value.trim();

  if (!nom) { alert('Le nom est obligatoire.'); return; }

  const nomComplet = [grade, nom, prenom].filter(Boolean).join(' ');
  const nid = 'terrain-' + Date.now();
  const tireur = { nid, badge: '', grade, nom, prenom, nomComplet, unite, ajouteTerrain: true };
  const key = personKey(tireur); // = nid = 'terrain-…'

  const seance = TERRAIN_STATE.seance || {};
  const saisie = buildDefaultSaisie({
    ...tireur,
    armesPrevues:    (seance.armesDisponibles || []).map(a => a.id || ''),
    nettoyagePrevu: false,
  }, seance);
  saisie.ajouteTerrain = true;

  // Lien avec le tireur original si c'est un remplacement
  const keyOriginal = modal.dataset.keyOriginal || '';
  if (keyOriginal) {
    saisie.remplaceKeyOriginal = keyOriginal;
    const saisieOrig = TERRAIN_STATE.saisies[keyOriginal];
    if (saisieOrig) {
      saisieOrig.remplacePar = nomComplet;
      saisieOrig.status      = 'absent-remplace';
      await dbSaveSaisie(keyOriginal, saisieOrig);
    }
  }

  TERRAIN_STATE.saisies[key] = saisie;
  if (!TERRAIN_STATE.tireursAjoutes) TERRAIN_STATE.tireursAjoutes = [];
  TERRAIN_STATE.tireursAjoutes.push(tireur);

  await dbSaveSaisie(key, saisie);
  await dbSaveTireursAjoutes(TERRAIN_STATE.tireursAjoutes);

  fermerFormulaireAjout();
  goToFiche(key);
}

async function supprimerTireurAjoute(key) {
  if (!confirm('Supprimer ce tireur ajouté sur le terrain ? Cette action est irréversible.')) return;

  // Annuler le lien de remplacement si applicable
  const saisie = TERRAIN_STATE.saisies[key];
  if (saisie && saisie.remplaceKeyOriginal) {
    const saisieOrig = TERRAIN_STATE.saisies[saisie.remplaceKeyOriginal];
    if (saisieOrig) {
      saisieOrig.remplacePar = null;
      delete saisieOrig.status;
      await dbSaveSaisie(saisie.remplaceKeyOriginal, saisieOrig);
    }
  }

  TERRAIN_STATE.tireursAjoutes = (TERRAIN_STATE.tireursAjoutes || []).filter(t => personKey(t) !== key);
  delete TERRAIN_STATE.saisies[key];

  await dbDeleteSaisie(key);
  await dbSaveTireursAjoutes(TERRAIN_STATE.tireursAjoutes);
  goToListe();
}
