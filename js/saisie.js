/* saisie.js — écrans liste des tireurs + fiche tireur (saisie ISTC/Test tir).
   Architecture v4 : chaque tireur peut avoir N blocs, chacun = 1 arme + 1 catégorie + 3 parties.
   Toute modification met à jour TERRAIN_STATE.saisies[key] puis déclenche un auto-save
   IndexedDB (debounce ~500ms) via scheduleAutoSave(). regles.js fournit les calculs. */

let _autoSaveTimers = {};
let _blocsCollapsed = {}; // '${key}-${idx}' -> bool

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
  const fromSeance = ((TERRAIN_STATE.seance && TERRAIN_STATE.seance.tireurs) || []).find(t => personKey(t) === key);
  if (fromSeance) return fromSeance;
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
  const blocs = s.blocs || [];
  if (!blocs.length || !blocs[0].categorie) return { label: 'À saisir', cls: 't-badge-todo' };
  if (_isSaisieTerminee(s)) {
    let allOk = true;
    let hasNoSafe = false;
    for (const b of blocs) {
      if (!b.categorie) continue;
      if (calculerNoSafeBloc(b)) { hasNoSafe = true; break; }
      const catPourCalc = (b.istcCatalogueNonEffectue || b.cataloguePresent === false) ? [] : (b.istcCatalogue || []);
      const elim    = calculerEliminatoireIstc(b.istcLignes || [], catPourCalc);
      const resIstc = b.connaissancesPresent !== false ? calculerResultatIstc(elim) : 'REUSSITE';
      const resTir  = b.testTirPresent !== false
        ? calculerResultatTestTir(b.categorie, calculerTotalTestTir(b.testTirSequences || []), false)
        : 'REUSSITE';
      if (resIstc !== 'REUSSITE' || resTir !== 'REUSSITE') { allOk = false; break; }
    }
    if (hasNoSafe) return { label: '⛔ NO SAFE', cls: 't-badge-nosafe' };
    return allOk
      ? { label: '✓ Réussite', cls: 't-badge-reussite' }
      : { label: '✗ Échec',   cls: 't-badge-echec'    };
  }
  return { label: 'En cours', cls: 't-badge-progress' };
}

/* ── Écran fiche tireur ──────────────────────────────────────────── */

function renderFicheTireur(key) {
  const seance = TERRAIN_STATE.seance;
  const t = getTireur(key);
  const s = getSaisie(key);
  const el = document.getElementById('fiche-content');
  if (!t || !s) { el.innerHTML = '<div class="t-hint">Tireur introuvable.</div>'; return; }

  const isEnc     = !!t._isEncadrement;
  const isTerrain = !isEnc && !!(TERRAIN_STATE.tireursAjoutes || []).find(ta => personKey(ta) === key);
  const cloturee  = !!(TERRAIN_STATE.cloture && TERRAIN_STATE.cloture.cloturee);

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

    ${!isEnc && !s.present
      ? _renderFicheAbsent(key, s)
      : _renderFicheContenuPresent(key, t, s, seance)}

    ${isTerrain && !cloturee ? `
    <div class="t-card">
      <button type="button" class="t-btn t-btn-danger"
              onclick="supprimerTireurAjoute('${key}')">🗑 Supprimer ce tireur (ajouté terrain)</button>
    </div>` : ''}
  `;

  // Enregistrement des pads de signature — un pad par partie de chaque bloc
  (s.blocs || []).forEach((b, idx) => {
    if (!b.categorie) return;
    if (b.connaissancesPresent !== false) {
      registerSigPad(`sig-b${idx}-connaissance-tireur`,    key, 'tireur',    `b${idx}-connaissance`);
      registerSigPad(`sig-b${idx}-connaissance-formateur`, key, 'formateur', `b${idx}-connaissance`);
    }
    if (b.cataloguePresent !== false) {
      registerSigPad(`sig-b${idx}-istc-tireur`,    key, 'tireur',    `b${idx}-istc`);
      registerSigPad(`sig-b${idx}-istc-formateur`, key, 'formateur', `b${idx}-istc`);
    }
    if (b.testTirPresent !== false) {
      registerSigPad(`sig-b${idx}-tir-tireur`,    key, 'tireur',    `b${idx}-tir`);
      registerSigPad(`sig-b${idx}-tir-formateur`, key, 'formateur', `b${idx}-tir`);
    }
  });
}

function _renderFicheAbsent(key, s) {
  return `
    <div class="t-card">
      <div class="t-hint">Ce tireur est marqué absent — aucune des parties n'a pu être réalisée.</div>
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

function _renderFicheContenuPresent(key, t, s, seance) {
  const blocs      = s.blocs || [];
  const armesDispo = (seance && seance.armesDisponibles) || [];
  const multiArmes = armesDispo.length > 1;
  const showSuppr  = blocs.length > 1;

  return `
    <div class="t-card">
      <label class="t-fg" style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" ${s.nettoyageEffectue?'checked':''} onchange="setNettoyage('${key}', this.checked)">
        <span>Nettoyage armement effectué</span>
      </label>
    </div>

    ${blocs.length === 0
      ? '<div class="t-card"><div class="t-hint">Aucun test défini. Un bloc sera créé dès que vous ajouterez un test.</div></div>'
      : blocs.map((b, i) => _renderBloc(key, s, b, i, seance, showSuppr)).join('')}

    ${multiArmes ? `
    <div class="t-card" style="padding:12px">
      <button type="button" class="t-btn t-btn-secondary t-btn-small" style="width:auto"
              onclick="ajouterBloc('${key}')">+ Ajouter un test (autre arme / catégorie)</button>
    </div>` : ''}

    <div class="t-card">
      <div class="t-fg">
        <label>Observations libres</label>
        <textarea class="t-textarea" onchange="setObservationsLibres('${key}', this.value)">${s.observationsLibres||''}</textarea>
      </div>
    </div>`;
}

/* ── Rendu d'un bloc (1 arme + 3 parties) ───────────────────────── */

function _renderBloc(key, s, b, idx, seance, showSuppr) {
  const armesDispo    = (seance && seance.armesDisponibles) || [];
  const seancePAFA    = seance && seance.typeArme === 'PAFA';
  const cat           = b.categorie;
  const armesFiltered = cat ? armesDispo.filter(a => a.categorie === cat) : armesDispo;
  const armeObj       = armesDispo.find(a => a.id === b.armeId);
  const armeNom       = armeObj ? armeObj.nom : (b.armeId || '');
  const multiBlocs    = s.blocs.length > 1;
  const collapsed     = !!_blocsCollapsed[`${key}-${idx}`];

  const blocTitle = multiBlocs
    ? `Bloc ${idx + 1} — ${armeNom || (cat || '?')}`
    : (armeNom || cat || 'Test');

  // Sélecteur arme : uniquement si plusieurs armes disponibles pour la catégorie
  const armeRequise = cat && armesFiltered.length > 1 && !b.armeId;
  let armeSelector = '';
  if (cat && armesFiltered.length > 1) {
    armeSelector = `
      <div class="t-fg">
        <label>Arme utilisée</label>
        <select class="t-select" onchange="setBlocArme('${key}',${idx},this.value)">
          <option value="">— choisir —</option>
          ${armesFiltered.map(a => `<option value="${a.id}" ${b.armeId===a.id?'selected':''}>${a.nom}</option>`).join('')}
        </select>
      </div>
      ${armeRequise ? `<div class="t-alerte-arme">⚠ Sélectionnez une arme pour valider ce bloc.</div>` : ''}`;
  } else if (cat && armesFiltered.length === 1 && armeNom) {
    armeSelector = `<div style="font-size:13px;font-weight:600;color:var(--t-ink);margin-bottom:10px">🔫 ${_escapeHtml(armeNom)}</div>`;
  }

  return `
    <div class="t-tt-bloc${armeRequise ? ' t-tt-bloc--alerte' : ''}">
      <div class="t-tt-bloc-header">
        <div class="t-tt-bloc-toggle" onclick="toggleBlocCollapse('${key}',${idx})">
          <span class="t-tt-bloc-title">📋 ${_escapeHtml(blocTitle)}${armeRequise ? ' ⚠' : ''}</span>
          <span class="t-tt-bloc-chevron">${collapsed ? '▶' : '▼'}</span>
        </div>
        ${showSuppr ? `<button type="button" class="t-btn t-btn-danger t-btn-small" style="margin-top:0"
                onclick="supprimerBloc('${key}',${idx})">✕ Supprimer</button>` : ''}
      </div>

      ${!collapsed ? `
        ${seancePAFA ? `
          <div class="t-fg" style="margin-top:10px">
            <label>Catégorie</label>
            <select class="t-select" onchange="setBlocCategorie('${key}',${idx},this.value)">
              <option value="">— choisir —</option>
              <option value="FA" ${cat==='FA'?'selected':''}>Fusil d'assaut (FA)</option>
              <option value="PA" ${cat==='PA'?'selected':''}>Arme de poing (PA)</option>
            </select>
          </div>` : ''}

        ${cat ? `
          ${armeSelector}
          ${_renderBlocPartie1(key, b, idx)}
          ${_renderBlocPartie2(key, b, idx)}
          ${_renderBlocPartie3(key, b, idx)}
        ` : '<div class="t-hint" style="margin-top:8px">Choisissez une catégorie pour afficher les grilles ISTC / Test tir.</div>'}
      ` : ''}
    </div>`;
}

/* ── Partie 1 : Vérification des connaissances (par bloc) ─────────── */

function _renderBlocPartie1(key, b, idx) {
  const realisee     = b.connaissancesPresent !== false;
  const commentaires = b.connaissancesCommentairesParLigne || b.istcCommentairesParLigne || {};
  const cat          = b.categorie;
  const elimP1       = (b.istcLignes||[]).some(l => LIGNES_ELIMINATOIRES.includes(l.n) && l.couleur === 'rouge');
  return `
    <div style="border-top:1px solid var(--t-border);margin-top:12px;padding-top:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h2 style="margin:0;font-size:15px">📋 Partie 1 — Vérification des connaissances</h2>
      </div>
      <div class="t-part-toggle">
        <button class="t-btn t-btn-small ${realisee?'on present':''}" style="flex:1"
                onclick="setBlocPartiePresence('${key}',${idx},'connaissancesPresent',true)">✓ Réalisée</button>
        <button class="t-btn t-btn-small ${!realisee?'on absent':''}" style="flex:1"
                onclick="setBlocPartiePresence('${key}',${idx},'connaissancesPresent',false)">⊘ Non réalisée</button>
      </div>
      ${!realisee
        ? '<div class="t-hint" style="margin-top:8px">Partie non réalisée — aucune signature requise.</div>'
        : `
          <div class="t-fg t-date-field" style="margin-top:10px">
            <label>Date ISTC <span class="t-date-hint">(depuis la NDS)</span></label>
            <input type="date" class="t-input" value="${b.istcDateIstc||''}" onchange="setBlocIstcDate('${key}',${idx},this.value)">
          </div>
          <div class="t-seclabel">Connaissances (lignes 1-3 éliminatoires si rouge)</div>
          ${(b.istcLignes||[]).map(l => _renderBlocLigneCouleur(key, idx, 'istcLignes', l, cat, commentaires, `b${idx}-connaissance`)).join('')}
          ${_renderResultBanner(calculerResultatIstc(elimP1), elimP1)}
          <div class="t-seclabel">Signature du Tireur</div>
          ${signatureButtonHtml(`sig-b${idx}-connaissance-tireur`, b.connaissancesSignatures && b.connaissancesSignatures.tireur)}
          <div class="t-seclabel">Signature du MTC</div>
          <div class="t-sig-mtc-zone">
            ${_getMtcIdentite(null, `b${idx}-connaissance`, b) ? `<div class="t-sig-mtc-watermark">${_getMtcIdentite(null, `b${idx}-connaissance`, b)}</div>` : ''}
            ${signatureButtonHtml(`sig-b${idx}-connaissance-formateur`, b.connaissancesSignatures && b.connaissancesSignatures.formateur)}
          </div>
          ${_renderMTCButtons(key, `b${idx}-connaissance`)}
        `}
    </div>`;
}

/* ── Partie 2 : Catalogue des tirs d'instruction (par bloc) ──────── */

function _renderBlocPartie2(key, b, idx) {
  const realisee     = b.cataloguePresent !== false;
  const commentaires = b.catalogueCommentairesParLigne || {};
  const cat          = b.categorie;
  const catPourCalcP2 = (b.istcCatalogueNonEffectue || !realisee) ? [] : (b.istcCatalogue || []);
  const elimP2        = catPourCalcP2.some(l => l.couleur === 'rouge');
  return `
    <div style="border-top:1px solid var(--t-border);margin-top:12px;padding-top:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h2 style="margin:0;font-size:15px">📂 Partie 2 — Catalogue des tirs d'instruction</h2>
      </div>
      <div class="t-part-toggle">
        <button class="t-btn t-btn-small ${realisee?'on present':''}" style="flex:1"
                onclick="setBlocPartiePresence('${key}',${idx},'cataloguePresent',true)">✓ Réalisée</button>
        <button class="t-btn t-btn-small ${!realisee?'on absent':''}" style="flex:1"
                onclick="setBlocPartiePresence('${key}',${idx},'cataloguePresent',false)">⊘ Non réalisée</button>
      </div>
      ${!realisee
        ? '<div class="t-hint" style="margin-top:8px">Partie non réalisée — aucune signature requise.</div>'
        : `
          <div class="t-fg t-date-field" style="margin-top:10px">
            <label>Date tir d'instruction <span class="t-date-hint">(depuis la NDS)</span></label>
            <input type="date" class="t-input" value="${b.catalogueDateTir||b.tirDateTir||''}" onchange="setBlocCatalogueDate('${key}',${idx},this.value)">
          </div>
          <div class="t-part-subsection">
            <div class="t-seclabel">Tir d'instruction</div>
            ${(b.istcCatalogue||[]).map(l => _renderBlocLigneCatalogue(key, idx, l, cat, commentaires)).join('')}
          </div>
          <div class="t-fg" style="margin-top:12px">
            <label>Observations générales ISTC</label>
            <textarea class="t-textarea" onchange="setBlocIstcObservations('${key}',${idx},this.value)">${b.istcObservations||''}</textarea>
          </div>
          ${_renderResultBanner(calculerResultatIstc(elimP2), elimP2)}
          <div class="t-seclabel">Signature du Tireur</div>
          ${signatureButtonHtml(`sig-b${idx}-istc-tireur`, b.istcSignatures && b.istcSignatures.tireur)}
          <div class="t-seclabel">Signature du MTC</div>
          <div class="t-sig-mtc-zone">
            ${_getMtcIdentite(null, `b${idx}-istc`, b) ? `<div class="t-sig-mtc-watermark">${_getMtcIdentite(null, `b${idx}-istc`, b)}</div>` : ''}
            ${signatureButtonHtml(`sig-b${idx}-istc-formateur`, b.istcSignatures && b.istcSignatures.formateur)}
          </div>
          ${_renderMTCButtons(key, `b${idx}-istc`)}
        `}
    </div>`;
}

/* ── Partie 3 : Test tir (par bloc) ─────────────────────────────── */

function _renderBlocPartie3(key, b, idx) {
  const realisee        = b.testTirPresent !== false;
  const commentaires    = b.testTirCommentairesParSequence || {};
  const cat             = b.categorie;
  const total           = calculerTotalTestTir(b.testTirSequences);
  const effectiveNoSafe = calculerNoSafeBloc(b);
  const result          = calculerResultatTestTir(cat, total, effectiveNoSafe);

  return `
    <div style="border-top:1px solid var(--t-border);margin-top:12px;padding-top:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h2 style="margin:0;font-size:15px">🎯 Partie 3 — Test tir <span style="font-weight:400;font-size:13px">/ ${TOTAL_MAX[cat]} pts</span></h2>
      </div>
      <div class="t-part-toggle">
        <button class="t-btn t-btn-small ${realisee?'on present':''}" style="flex:1"
                onclick="setBlocPartiePresence('${key}',${idx},'testTirPresent',true)">✓ Réalisé</button>
        <button class="t-btn t-btn-small ${!realisee?'on absent':''}" style="flex:1"
                onclick="setBlocPartiePresence('${key}',${idx},'testTirPresent',false)">⊘ Non réalisé</button>
      </div>
      ${!realisee
        ? '<div class="t-hint" style="margin-top:8px">Test non réalisé — aucune signature requise.</div>'
        : `
          <div class="t-fg t-date-field" style="margin-top:10px">
            <label>Date tir <span class="t-date-hint">(depuis la NDS)</span></label>
            <input type="date" class="t-input" value="${b.tirDateTir||''}" onchange="setBlocTirDate('${key}',${idx},this.value)">
          </div>
          ${(SEQUENCES[cat]||[]).map(def => {
            const sq = (b.testTirSequences||[]).find(x => x.n === def.n) || { n: def.n, score: 0 };
            return _renderBlocSequenceTestTir(key, idx, sq, def, commentaires);
          }).join('')}
          <div class="t-seq-total-row" style="display:flex;align-items:center;gap:8px">
            <b id="tt-total-${key}-${idx}" style="flex:1">Score : ${total} / ${TOTAL_MAX[cat]}</b>
            <button type="button"
                    class="t-nosafe-btn${effectiveNoSafe?' on':''}"
                    style="font-size:11px;padding:3px 8px;white-space:nowrap"
                    onclick="toggleBlocNoSafe('${key}',${idx})"
                    title="${effectiveNoSafe && !b.testTirNoSafe?'NO SAFE déclenché automatiquement (P1 ou P2)':'Basculer le statut NO SAFE'}">
              ⛔ NO SAFE
            </button>
          </div>
          ${_renderResultBanner(result, effectiveNoSafe)}
          <div class="t-seclabel">Signature Tir — Tireur</div>
          ${signatureButtonHtml(`sig-b${idx}-tir-tireur`, b.tirSignatures && b.tirSignatures.tireur)}
          <div class="t-seclabel">Signature Tir — Formateur / MTC</div>
          <div class="t-sig-mtc-zone">
            ${_getMtcIdentite(null, `b${idx}-tir`, b) ? `<div class="t-sig-mtc-watermark">${_getMtcIdentite(null, `b${idx}-tir`, b)}</div>` : ''}
            ${signatureButtonHtml(`sig-b${idx}-tir-formateur`, b.tirSignatures && b.tirSignatures.formateur)}
          </div>
          ${_renderMTCButtons(key, `b${idx}-tir`)}
        `}
    </div>`;
}

/* ── Rendu lignes et séquences (version bloc-aware) ──────────────── */

function _renderBlocLigneCouleur(key, idx, field, l, categorie, commentaires, partie) {
  const eliminatoire = field === 'istcLignes' && LIGNES_ELIMINATOIRES.includes(l.n);
  const def = (ISTC_LIBELLES[categorie] || []).find(d => d.n === l.n);
  const libelle    = def ? def.libelle : '';
  const commentaire = (commentaires || {})[l.n] || '';
  const hasComment = !!commentaire;

  const colorBtns = eliminatoire
    ? `<div class="t-color-btn vert ${l.couleur==='vert'?'on':''}" onclick="setBlocLigneCouleur('${key}',${idx},'${field}',${l.n},'vert')"></div>
       <div class="t-color-btn rouge ${l.couleur==='rouge'?'on':''}" onclick="setBlocLigneCouleur('${key}',${idx},'${field}',${l.n},'rouge')"></div>`
    : `<div class="t-color-btn vert ${l.couleur==='vert'?'on':''}" onclick="setBlocLigneCouleur('${key}',${idx},'${field}',${l.n},'vert')"></div>
       <div class="t-color-btn jaune ${l.couleur==='jaune'?'on':''}" onclick="setBlocLigneCouleur('${key}',${idx},'${field}',${l.n},'jaune')"></div>
       <div class="t-color-btn rouge ${l.couleur==='rouge'?'on':''}" onclick="setBlocLigneCouleur('${key}',${idx},'${field}',${l.n},'rouge')"></div>`;

  return `
    <div class="t-ligne-row t-ligne-row--avec-libelle">
      <span class="t-ligne-num ${eliminatoire?'t-ligne-eliminatoire':''}">${l.n}</span>
      <span class="t-ligne-libelle${eliminatoire?' t-ligne-eliminatoire':''}">${libelle}</span>
      <div class="t-tri-color">${colorBtns}</div>
      <button type="button" class="t-comment-btn${hasComment?' has-comment':''}"
              onclick="ouvrirCommentaire('${key}','${partie}',${l.n})"
              title="${hasComment?'Modifier le commentaire':'Ajouter un commentaire'}">💬</button>
    </div>
    ${hasComment ? `<div class="t-comment-preview">💬 ${_escapeHtml(commentaire)}</div>` : ''}`;
}

function _renderBlocLigneCatalogue(key, idx, l, categorie, commentaires) {
  const def = (CATALOGUE_LIBELLES[categorie] || []).find(d => d.n === l.n);
  const cartouches = def ? def.cartouches : '';
  const libelle    = def ? def.libelle : '';
  const commentaire = (commentaires || {})[l.n] || '';
  const hasComment  = !!commentaire;
  return `
    <div class="t-ligne-row t-ligne-row--avec-libelle">
      <span class="t-ligne-num">${l.n}</span>
      <span class="t-ligne-libelle"><span class="t-cat-cart">${cartouches} cart.</span> ${libelle}</span>
      <div class="t-tri-color">
        <div class="t-color-btn vert ${l.couleur==='vert'?'on':''}" onclick="setBlocLigneCouleur('${key}',${idx},'istcCatalogue',${l.n},'vert')"></div>
        <div class="t-color-btn jaune ${l.couleur==='jaune'?'on':''}" onclick="setBlocLigneCouleur('${key}',${idx},'istcCatalogue',${l.n},'jaune')"></div>
        <div class="t-color-btn rouge ${l.couleur==='rouge'?'on':''}" onclick="setBlocLigneCouleur('${key}',${idx},'istcCatalogue',${l.n},'rouge')"></div>
      </div>
      <button type="button" class="t-comment-btn${hasComment?' has-comment':''}"
              onclick="ouvrirCommentaire('${key}','b${idx}-catalogue',${l.n})"
              title="${hasComment?'Modifier le commentaire':'Ajouter un commentaire'}">💬</button>
    </div>
    ${hasComment ? `<div class="t-comment-preview">💬 ${_escapeHtml(commentaire)}</div>` : ''}`;
}

const _COMMENTAIRES_PREDEFS_TIR = [
  'Réaliser hors temps',
  'Exercice non conforme à la demande',
];

function injecterCommentairePred(texte) {
  const ta = document.getElementById('comment-modal-textarea');
  if (ta) ta.value = texte;
}

function _renderBlocSequenceTestTir(key, blocIdx, sq, def, commentaires) {
  const partie = `b${blocIdx}-tir`;
  let btns = '';
  for (let v = 0; v <= def.scoreMax; v++) {
    btns += `<button type="button" class="t-score-btn${sq.score === v ? ' on' : ''}"
      onclick="setBlocSequenceScore('${key}',${blocIdx},${def.n},${v})">${v}</button>`;
  }
  const commentaire = (commentaires || {})[def.n] || '';
  const hasComment = !!commentaire;
  return `
    <div class="t-seq-bloc">
      <div class="t-seq-header">
        <span class="t-ligne-num">${def.n}</span>
        <span class="t-seq-libelle">${def.libelle}</span>
        <button type="button" class="t-comment-btn${hasComment?' has-comment':''}"
                onclick="ouvrirCommentaire('${key}','${partie}',${def.n})"
                title="${hasComment?'Modifier le commentaire':'Ajouter un commentaire'}">💬</button>
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
      ${hasComment ? `<div class="t-comment-preview">💬 ${_escapeHtml(commentaire)}</div>` : ''}
    </div>`;
}

function _renderResultBanner(resultat, noSafe) {
  if (noSafe) return `<div class="t-result-banner NOSAFE">⛔ NO SAFE</div>`;
  return `<div class="t-result-banner ${resultat}">${resultat === 'REUSSITE' ? '✓ RÉUSSITE' : '✗ ÉCHEC'}</div>`;
}

function _escapeHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Modale commentaire ──────────────────────────────────────────── */

let _commentCtx = null;

// partie format : 'b${idx}-connaissance', 'b${idx}-catalogue', 'b${idx}-tir'
function ouvrirCommentaire(key, partie, n) {
  _commentCtx = { key, partie, n };
  const s = getSaisie(key);
  const blocs = (s && s.blocs) || [];
  let texte = '';

  const bm = partie.match(/^b(\d+)-(.+)$/);
  if (bm) {
    const blocIdx = parseInt(bm[1], 10);
    const part    = bm[2];
    const b       = blocs[blocIdx] || {};
    if (part === 'connaissance') texte = (b.connaissancesCommentairesParLigne || {})[n] || '';
    else if (part === 'catalogue') texte = (b.catalogueCommentairesParLigne || {})[n] || '';
    else if (part === 'tir') texte = (b.testTirCommentairesParSequence || {})[n] || '';
  }

  const modal = document.getElementById('modal-commentaire');
  if (!modal) return;

  const isTir = bm && bm[2] === 'tir';
  const blocIdx = bm ? parseInt(bm[1]) + 1 : 0;
  const partLabel = !bm ? ''
    : bm[2] === 'connaissance' ? `Connaissances — ligne ${n}`
    : bm[2] === 'catalogue'    ? `Catalogue — exercice ${n}`
    : `Test tir — séquence ${n}`;
  const titre = blocs.length > 1 ? `Bloc ${blocIdx} · ${partLabel}` : partLabel;

  const el = modal.querySelector('#comment-modal-titre');
  if (el) el.textContent = titre || 'Commentaire';

  const ta = document.getElementById('comment-modal-textarea');
  if (ta) ta.value = texte;

  const predsZone = document.getElementById('comment-modal-preds');
  if (predsZone) {
    if (isTir) {
      predsZone.style.display = '';
      predsZone.innerHTML = '<div style="font-size:11px;color:#888;margin-bottom:6px">Commentaires rapides :</div>'
        + _COMMENTAIRES_PREDEFS_TIR.map(c => {
            const safe = c.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
            return `<button type="button" class="t-btn t-btn-secondary t-btn-small" style="margin-bottom:4px;width:100%;text-align:left"
                     onclick="injecterCommentairePred('${safe}')">${_escapeHtml(c)}</button>`;
          }).join('');
    } else {
      predsZone.style.display = 'none';
      predsZone.innerHTML = '';
    }
  }

  modal.style.display = 'flex';
}

function fermerCommentaire() {
  const modal = document.getElementById('modal-commentaire');
  if (modal) modal.style.display = 'none';
  _commentCtx = null;
}

function validerCommentaire() {
  if (!_commentCtx) { fermerCommentaire(); return; }
  const { key, partie, n } = _commentCtx;
  const ta = document.getElementById('comment-modal-textarea');
  const texte = (ta ? ta.value : '').trim();
  const s = getSaisie(key);
  if (!s) { fermerCommentaire(); return; }

  const bm = partie.match(/^b(\d+)-(.+)$/);
  if (bm) {
    const blocIdx = parseInt(bm[1], 10);
    const part    = bm[2];
    const b       = (s.blocs || [])[blocIdx];
    if (b) {
      if (part === 'connaissance') {
        if (!b.connaissancesCommentairesParLigne) b.connaissancesCommentairesParLigne = {};
        if (!b.istcCommentairesParLigne)          b.istcCommentairesParLigne          = {};
        b.connaissancesCommentairesParLigne[n] = texte;
        b.istcCommentairesParLigne[n]          = texte;
      } else if (part === 'catalogue') {
        if (!b.catalogueCommentairesParLigne) b.catalogueCommentairesParLigne = {};
        b.catalogueCommentairesParLigne[n] = texte;
        const ligne = (b.istcCatalogue || []).find(l => l.n === n);
        if (ligne) ligne.observation = texte;
      } else if (part === 'tir') {
        if (!b.testTirCommentairesParSequence) b.testTirCommentairesParSequence = {};
        b.testTirCommentairesParSequence[n] = texte;
      }
    }
  }

  scheduleAutoSave(key);
  fermerCommentaire();
  renderFicheTireur(key);
}

/* ── Mutateurs d'état ────────────────────────────────────────────── */

function setPresence(key, present) {
  const s = getSaisie(key);
  s.present = present;
  if (!present) {
    (s.blocs || []).forEach(b => {
      b.connaissancesPresent = false;
      b.cataloguePresent     = false;
      b.testTirPresent       = false;
    });
  } else {
    const allFalse = (s.blocs || []).every(b =>
      b.connaissancesPresent === false && b.cataloguePresent === false && b.testTirPresent === false
    );
    if (allFalse) {
      (s.blocs || []).forEach(b => {
        b.connaissancesPresent = true;
        b.cataloguePresent     = true;
        b.testTirPresent       = true;
      });
    }
  }
  scheduleAutoSave(key);
  renderFicheTireur(key);
}

function setBlocPartiePresence(key, idx, field, val) {
  const s = getSaisie(key);
  const b = (s.blocs || [])[idx];
  if (!b) return;
  b[field] = val;
  const allFalse = (s.blocs || []).every(b2 =>
    b2.connaissancesPresent === false && b2.cataloguePresent === false && b2.testTirPresent === false
  );
  s.present = !allFalse;
  scheduleAutoSave(key);
  renderFicheTireur(key);
}

function setBlocCategorie(key, idx, categorie) {
  const s      = getSaisie(key);
  const b      = (s.blocs || [])[idx];
  if (!b) return;
  const seance = TERRAIN_STATE.seance;
  const armesDispo = (seance && seance.armesDisponibles) || [];
  const armesForCat = armesDispo.filter(a => a.categorie === categorie);

  b.categorie               = categorie;
  b.armeId                  = armesForCat.length === 1 ? armesForCat[0].id : '';
  b.istcLignes              = categorie ? Array.from({ length: NB_LIGNES_CONNAISSANCES }, (_, i) => ({ n: i + 1, couleur: 'vert' })) : [];
  b.istcCatalogue           = buildCatalogueVide(categorie);
  b.catalogueCommentairesParLigne = {};
  b.testTirSequences        = buildSequencesVides(categorie);
  b.testTirCommentairesParSequence = {};
  scheduleAutoSave(key);
  renderFicheTireur(key);
}

function setBlocArme(key, idx, armeId) {
  const s = getSaisie(key);
  const b = (s.blocs || [])[idx];
  if (!b) return;
  b.armeId = armeId;
  scheduleAutoSave(key);
  renderFicheTireur(key);
}

function setNettoyage(key, val) {
  getSaisie(key).nettoyageEffectue = !!val;
  scheduleAutoSave(key);
}

function setBlocLigneCouleur(key, idx, field, n, couleur) {
  const s = getSaisie(key);
  const b = (s.blocs || [])[idx];
  if (!b) return;
  const ligne = (b[field] || []).find(l => l.n === n);
  if (!ligne) return;
  ligne.couleur = (ligne.couleur === couleur) ? null : couleur;
  scheduleAutoSave(key);
  renderFicheTireur(key);
}

function setBlocIstcObservations(key, idx, val) {
  const b = (getSaisie(key).blocs || [])[idx];
  if (b) { b.istcObservations = val; scheduleAutoSave(key); }
}

function setBlocIstcDate(key, idx, val) {
  const b = (getSaisie(key).blocs || [])[idx];
  if (b) { b.istcDateIstc = val; scheduleAutoSave(key); }
}

function setBlocTirDate(key, idx, val) {
  const b = (getSaisie(key).blocs || [])[idx];
  if (b) { b.tirDateTir = val; scheduleAutoSave(key); }
}

function setBlocCatalogueDate(key, idx, val) {
  const b = (getSaisie(key).blocs || [])[idx];
  if (b) { b.catalogueDateTir = val; scheduleAutoSave(key); }
}

function setBlocIstcCatalogueNonEffectue(key, idx, val) {
  const b = (getSaisie(key).blocs || [])[idx];
  if (!b) return;
  b.istcCatalogueNonEffectue = !!val;
  scheduleAutoSave(key);
  renderFicheTireur(key);
}

function setBlocSequenceScore(key, blocIdx, n, val) {
  const s = getSaisie(key);
  const b = (s.blocs || [])[blocIdx];
  if (!b) return;
  const seq = (b.testTirSequences || []).find(x => x.n === n);
  if (!seq) return;
  seq.score = Math.max(0, Number(val) || 0);
  scheduleAutoSave(key);
  const totalEl = document.getElementById(`tt-total-${key}-${blocIdx}`);
  if (totalEl) totalEl.textContent = `Score : ${calculerTotalTestTir(b.testTirSequences)} / ${TOTAL_MAX[b.categorie]}`;
  renderFicheTireur(key);
}

function toggleBlocNoSafe(key, idx) {
  const b = (getSaisie(key).blocs || [])[idx];
  if (!b) return;
  b.testTirNoSafe = !b.testTirNoSafe;
  scheduleAutoSave(key);
  renderFicheTireur(key);
}

function setObservationsLibres(key, val) { getSaisie(key).observationsLibres = val; scheduleAutoSave(key); }

function ajouterBloc(key) {
  const s      = getSaisie(key);
  const seance = TERRAIN_STATE.seance;
  if (!s.blocs) s.blocs = [];
  const cat    = seance && seance.typeArme !== 'PAFA' ? seance.typeArme : '';
  s.blocs.push(buildBlocVide(cat, '', seance));
  scheduleAutoSave(key);
  renderFicheTireur(key);
}

function supprimerBloc(key, idx) {
  const s = getSaisie(key);
  if (!s.blocs || s.blocs.length <= 1) return;
  s.blocs.splice(idx, 1);
  delete _blocsCollapsed[`${key}-${idx}`];
  scheduleAutoSave(key);
  renderFicheTireur(key);
}

function toggleBlocCollapse(key, idx) {
  const k = `${key}-${idx}`;
  _blocsCollapsed[k] = !_blocsCollapsed[k];
  renderFicheTireur(key);
}

/* ── Boutons MTC ─────────────────────────────────────────────────── */

// Récupère l'identité du MTC depuis le bloc ou les signatures encadrement.
// bloc format : 'b${idx}-connaissance', 'b${idx}-istc', 'b${idx}-tir'
function _getMtcIdentite(saisie, bloc, blocObj) {
  let info;
  if (blocObj) {
    const part = bloc.replace(/^b\d+-/, '');
    if (part === 'connaissance') info = blocObj.connaissancesMTCInfo;
    else if (part === 'istc')   info = blocObj.istcSignatureMTCInfo;
    else if (part === 'tir')    info = blocObj.tirSignatureMTCInfo;
  }
  if (info && (info.grade || info.nom)) {
    return [info.grade, info.nom, info.prenom].filter(Boolean).join(' ').toUpperCase();
  }
  const sigEnc    = TERRAIN_STATE.signaturesEncadrement || {};
  const seanceEnc = (TERRAIN_STATE.seance && TERRAIN_STATE.seance.encadrement) || [];
  const mtcRoles  = ['MTC_1', 'MTC_2', 'MTC_3', 'MTC_4', 'MTC_5'];
  const premier   = seanceEnc.find(e => mtcRoles.includes(e.role) && sigEnc[e.role] && sigEnc[e.role].dataUrl);
  if (premier) return [premier.grade, premier.nom, premier.prenom].filter(Boolean).join(' ').toUpperCase();
  return '';
}

function _renderMTCButtons(key, bloc) {
  const roles       = ['MTC_1', 'MTC_2', 'MTC_3', 'MTC_4', 'MTC_5'];
  const sigEnc      = TERRAIN_STATE.signaturesEncadrement || {};
  const seanceEnc   = (TERRAIN_STATE.seance && TERRAIN_STATE.seance.encadrement) || [];
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

  const bm = bloc.match(/^b(\d+)-(.+)$/);
  if (bm) {
    const blocIdx = parseInt(bm[1], 10);
    const part    = bm[2];
    const b       = (s.blocs || [])[blocIdx];
    if (!b) return;
    const today = new Date().toISOString().split('T')[0];
    const mtcInfo = { grade: sig.grade, nom: sig.nom, prenom: sig.prenom, role };
    if (part === 'connaissance') {
      if (!b.connaissancesSignatures) b.connaissancesSignatures = { tireur: null, formateur: null, dateSignature: null };
      b.connaissancesSignatures.formateur     = sig.dataUrl;
      b.connaissancesSignatures.dateSignature = today;
      b.connaissancesMTCInfo = mtcInfo;
    } else if (part === 'istc') {
      if (!b.istcSignatures) b.istcSignatures = { tireur: null, formateur: null, dateSignature: null };
      b.istcSignatures.formateur     = sig.dataUrl;
      b.istcSignatures.dateSignature = today;
      b.istcSignatureMTCInfo = mtcInfo;
    } else if (part === 'tir') {
      if (!b.tirSignatures) b.tirSignatures = { tireur: null, formateur: null, dateSignature: null };
      b.tirSignatures.formateur     = sig.dataUrl;
      b.tirSignatures.dateSignature = today;
      b.tirSignatureMTCInfo = mtcInfo;
    }
  }
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

  const keyOriginal = modal.dataset.keyOriginal || '';
  const nomComplet  = [grade, nom, prenom].filter(Boolean).join(' ');
  const nid         = 'terrain-' + Date.now();
  const t           = { nid, grade, nom, prenom, nomComplet, unite, ajouteTerrain: true };
  const seance      = TERRAIN_STATE.seance;

  if (keyOriginal) {
    const sOriginal = getSaisie(keyOriginal);
    if (sOriginal) {
      sOriginal.remplacePar        = nomComplet;
      sOriginal.connaissancesPresent = false;
      sOriginal.cataloguePresent     = false;
      (sOriginal.blocs || []).forEach(b => {
        b.connaissancesPresent = false;
        b.cataloguePresent     = false;
        b.testTirPresent       = false;
      });
      sOriginal.present = false;
      scheduleAutoSave(keyOriginal);
    }
  }

  const key    = personKey(t);
  const saisie = buildDefaultSaisie(t, seance);
  saisie.ajouteTerrain = true;
  saisie.remplaceKeyOriginal = keyOriginal || undefined;

  TERRAIN_STATE.tireursAjoutes.push(t);
  TERRAIN_STATE.saisies[key] = saisie;
  await dbSaveSaisie(key, saisie);
  await dbSaveTireursAjoutes(TERRAIN_STATE.tireursAjoutes);

  fermerFormulaireAjout();
  goToFiche(key);
}

async function supprimerTireurAjoute(key) {
  if (!confirm('Supprimer ce tireur ajouté sur le terrain ?')) return;
  TERRAIN_STATE.tireursAjoutes = (TERRAIN_STATE.tireursAjoutes || []).filter(t => personKey(t) !== key);
  delete TERRAIN_STATE.saisies[key];
  await dbDeleteSaisie(key);
  await dbSaveTireursAjoutes(TERRAIN_STATE.tireursAjoutes);
  goToListe();
}
