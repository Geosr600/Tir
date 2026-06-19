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
  return (TERRAIN_STATE.seance.tireurs || []).find(t => personKey(t) === key);
}

/* ── Écran liste ─────────────────────────────────────────────────── */

function renderListeTireurs() {
  const seance = TERRAIN_STATE.seance;
  const wrap = document.getElementById('liste-tireurs');
  const titre = document.getElementById('liste-titre');
  if (!seance) { wrap.innerHTML = ''; return; }

  titre.textContent = `📋 Tireurs — ${seance.dateTir || ''} (${(seance.tireurs||[]).length})`;

  wrap.innerHTML = (seance.tireurs || []).map(t => {
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
  }).join('') || '<div class="t-hint">Aucun tireur dans cette séance.</div>';
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

  const armesPossibles = (seance.armesDisponibles || []).filter(a => !s.categorieChoisie || a.categorie === s.categorieChoisie);

  el.innerHTML = `
    <div class="t-card">
      <div class="t-fiche-header"><h2>${t.nomComplet}</h2></div>
      <div class="t-hint">${t.unite || ''}${t.grade ? ' · ' + t.grade : ''}</div>

      <div class="t-present-toggle">
        <button class="t-btn ${s.present ? 'on present' : ''}" style="flex:1" onclick="setPresence('${key}', true)">✓ Présent</button>
        <button class="t-btn ${!s.present ? 'on absent' : ''}" style="flex:1" onclick="setPresence('${key}', false)">✗ Absent</button>
      </div>
    </div>

    ${s.present ? _renderFicheContenuPresent(key, t, s, seance, armesPossibles) : ''}
  `;

  // Enregistre les pads dans _sigPadState (nécessaire avant tout appel openSigModal)
  if (s.present && s.categorieChoisie) {
    registerSigPad('sig-istc-tireur',    key, 'tireur',    'istc');
    registerSigPad('sig-istc-formateur', key, 'formateur', 'istc');
    registerSigPad('sig-tir-tireur',     key, 'tireur',    'tir');
    registerSigPad('sig-tir-formateur',  key, 'formateur', 'tir');
  }
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
      <div class="t-seclabel">Catalogue des tirs d'instruction</div>
      ${(s.istcCatalogue||[]).map(l => _renderLigneCatalogue(key, l, s.categorieChoisie)).join('')}
      <div class="t-fg" style="margin-top:12px">
        <label>Observations générales ISTC</label>
        <textarea class="t-textarea" onchange="setIstcObservations('${key}', this.value)">${s.istcObservations||''}</textarea>
      </div>
      <div class="t-seclabel">Signatures ISTC — Tireur</div>
      ${signatureButtonHtml('sig-istc-tireur', s.istcSignatures && s.istcSignatures.tireur)}
      <div class="t-seclabel">Signatures ISTC — Formateur / MTC</div>
      ${signatureButtonHtml('sig-istc-formateur', s.istcSignatures && s.istcSignatures.formateur)}
      ${_renderResultBanner(calculerResultatIstc(calculerEliminatoireIstc(s.istcLignes, s.istcCatalogue)))}
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
      <div class="t-seclabel">Signatures Tir — Tireur</div>
      ${signatureButtonHtml('sig-tir-tireur', s.tirSignatures && s.tirSignatures.tireur)}
      <div class="t-seclabel">Signatures Tir — Formateur / MTC</div>
      ${signatureButtonHtml('sig-tir-formateur', s.tirSignatures && s.tirSignatures.formateur)}
      ${_renderResultBanner(calculerResultatTestTir(s.categorieChoisie, calculerTotalTestTir(s.testTirSequences), s.testTirNoSafe))}
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
