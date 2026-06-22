/* export.js — génération du resultat_seance.json et des PDF (ISTC + Test tir) par tireur.
   Deux boutons distincts : "Export JSON" et "Export PDF (ZIP)".
   window._dernierExportBlobs est partagé avec mail.js. */

let _dernierExportBlobs = null;

function _templateIstc(cat)    { return cat === 'FA' ? 'istc-fa'      : 'istc-pa'; }
function _templateTestTir(cat) { return cat === 'FA' ? 'test-tir-fa'  : 'test-tir-pa'; }

function _nomFichierSafe(nomComplet) {
  return (nomComplet || 'TIREUR').replace(/[^a-zA-Z0-9À-ɏ _-]/g, '_').trim();
}

function _findTireurSeance(saisie, tireurs) {
  return (tireurs || []).find(t =>
    (saisie.nid  && t.nid  === saisie.nid)  ||
    (saisie.badge && t.badge === saisie.badge) ||
    t.nomComplet === saisie.nomComplet
  ) || null;
}

/** Calcule les blocs résultat (istc + tir) pour chaque tireur. Synchrone, sans I/O. */
function _computeResultats(seance, saisies) {
  // Exclure les saisies encadrement (enc-*) du flux tireurs principal
  const saisiesList = Object.values(saisies || {}).filter(s => !s.isEncadrement);
  const presents    = saisiesList.filter(s => s.present);
  const absents     = saisiesList.filter(s => !s.present);
  const resultats   = [];

  for (const saisie of presents) {
    const cat = saisie.categorieChoisie;
    const srcTireur  = _findTireurSeance(saisie, seance.tireurs);
    const tireurInfo = {
      nomComplet: saisie.nomComplet,
      unite: (srcTireur && srcTireur.unite) || seance.unite || '',
    };

    const cataloguePourCalc = saisie.istcCatalogueNonEffectue ? [] : (saisie.istcCatalogue || []);

    const istcBlocBase = calculerBlocIstc(
      cat ? _templateIstc(cat) : null,
      saisie.istcLignes               || [],
      cataloguePourCalc,
      saisie.istcCommentairesParLigne || {},
      saisie.istcObservations         || ''
    );
    const istcBloc = cat ? {
      ...istcBlocBase,
      arme:                 cat,
      dateIstc:             saisie.istcDateIstc || seance.dateIstc || '',
      signatures:           saisie.istcSignatures || { tireur: null, formateur: null, dateSignature: null },
      catalogueNonEffectue: !!saisie.istcCatalogueNonEffectue,
    } : istcBlocBase;

    const tirBlocBase = cat ? calculerBlocTestTir(
      _templateTestTir(cat),
      cat,
      saisie.testTirSequences    || [],
      !!saisie.testTirNoSafe,
      saisie.testTirCommentaires || ''
    ) : null;
    const tirBloc = tirBlocBase ? {
      ...tirBlocBase,
      arme:           cat,
      dateTir:        saisie.tirDateTir || seance.dateTir || '',
      armesUtilisees: saisie.armesUtilisees || [],
      signatures:     saisie.tirSignatures || { tireur: null, formateur: null, dateSignature: null },
    } : null;

    resultats.push({
      nid:               saisie.nid   || '',
      badge:             saisie.badge || '',
      nomComplet:        saisie.nomComplet,
      present:           true,
      source:            saisie.ajouteTerrain ? 'terrain' : 'seance',
      nettoyageEffectue: !!saisie.nettoyageEffectue,
      istc:              istcBloc,
      tir:               tirBloc,
      observationsLibres:     saisie.observationsLibres     || '',
      remplaceKeyOriginal:    saisie.remplaceKeyOriginal     || undefined,
      istcSignatureMTCInfo:   saisie.istcSignatureMTCInfo    || undefined,
      tirSignatureMTCInfo:    saisie.tirSignatureMTCInfo     || undefined,
      _cat:       cat,
      _nomF:      _nomFichierSafe(saisie.nomComplet),
      _tireurInfo: tireurInfo,
    });
  }

  for (const saisie of absents) {
    resultats.push({
      nid:               saisie.nid   || '',
      badge:             saisie.badge || '',
      nomComplet:        saisie.nomComplet,
      present:           false,
      status:            saisie.status || 'absent',
      remplacePar:       saisie.remplacePar || undefined,
      armesUtilisees:    [],
      nettoyageEffectue: false,
      istc:              null,
      tir:               null,
      observationsLibres: saisie.observationsLibres || '',
    });
  }

  // Résultats encadrement (saisies enc-* avec catégorie choisie)
  const encadrementResultats = [];
  for (const [k, s] of Object.entries(saisies || {})) {
    if (!k.startsWith('enc-') || !s.isEncadrement || !s.categorieChoisie) continue;
    const role = k.slice(4);
    const enc  = (seance.encadrement || []).find(e => e.role === role);
    if (!enc) continue;
    const cat = s.categorieChoisie;
    const catPourCalc = s.istcCatalogueNonEffectue ? [] : (s.istcCatalogue || []);
    const istcBase = calculerBlocIstc(_templateIstc(cat), s.istcLignes || [], catPourCalc, {}, s.istcObservations || '');
    const tirBase  = calculerBlocTestTir(_templateTestTir(cat), cat, s.testTirSequences || [], !!s.testTirNoSafe, s.testTirCommentaires || '');
    encadrementResultats.push({
      role,
      grade:      enc.grade      || '',
      nom:        enc.nom        || '',
      prenom:     enc.prenom     || '',
      nomComplet: enc.nomComplet || '',
      categorie:  cat,
      istc: { ...istcBase, arme: cat, dateIstc: s.istcDateIstc || seance.dateIstc || '', signatures: s.istcSignatures || {} },
      tir:  { ...tirBase,  arme: cat, dateTir:  s.tirDateTir   || seance.dateTir  || '', signatures: s.tirSignatures  || {} },
    });
  }

  return { resultats, presents, absents, encadrementResultats };
}

/** Construit le JSON résultat (sans les champs internes _*). */
function _buildJsonExport(seance, resultats, encadrementResultats) {
  const exportedAt = new Date().toISOString();
  const tireursNettoyes = resultats.map(r => {
    const { _cat, _nomF, _tireurInfo, ...rest } = r;
    // Retirer les champs undefined pour alléger le JSON
    return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  });
  return {
    version_schema:        '2.1',
    seanceId:              seance.seanceId,
    exportedFromTerrainAt: exportedAt,
    tireurs:               tireursNettoyes,
    encadrementResultats:  encadrementResultats || [],
    signaturesEncadrement: TERRAIN_STATE.signaturesEncadrement || {},
    cloture:               TERRAIN_STATE.cloture || null,
  };
}

/** Affiche le résumé sur l'écran export (appelé par goToExport dans app.js). */
function renderExportSummary() {
  const el = document.getElementById('export-summary');
  if (!el) return;

  const seance = TERRAIN_STATE.seance;
  if (!seance) {
    el.innerHTML = '<p class="t-hint">Aucune séance importée.</p>';
    return;
  }

  const saisies  = Object.values(TERRAIN_STATE.saisies || {}).filter(s => !s.isEncadrement);
  const presents = saisies.filter(s => s.present);
  const termines = presents.filter(_isSaisieTerminee);
  const non      = presents.filter(s => !_isSaisieTerminee(s));

  let html = `<div style="font-size:13px;line-height:2">
    <b>Date :</b> ${seance.dateTir || '—'}<br>
    <b>Lieu :</b> ${seance.lieuLib || seance.lieu || '—'}<br>
    <b>Tireurs présents :</b> ${presents.length}<br>
    <b>Saisies terminées :</b> ${termines.length} / ${presents.length}
  </div>`;

  if (!TERRAIN_STATE.cloture?.cloturee) {
    html += `<p class="t-hint" style="color:var(--t-warning);margin-top:8px">⚠ La séance n'est pas encore clôturée. Complétez la clôture avant d'exporter.</p>`;
  }

  if (non.length) {
    html += `<p class="t-hint" style="color:var(--t-warning)">⚠ ${non.length} tireur(s) sans saisie complète — les PDF seront générés avec les données disponibles.</p>`;
  }

  el.innerHTML = html;
  const mailCard = document.getElementById('mail-card');
  if (mailCard) mailCard.style.display = 'none';
  _setResult('');
  _setProgress('', '');
}

function _setProgress(msg, type) {
  const el = document.getElementById('export-progress');
  if (!el) return;
  el.textContent = msg;
  el.className = 't-status' + (type ? ' ' + type : '');
}

function _setResult(html) {
  const el = document.getElementById('export-result');
  if (el) el.innerHTML = html;
}

function _dlBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
}

/** Export JSON uniquement — télécharge le fichier résultat_*.json. */
async function genererExportJson() {
  const seance = TERRAIN_STATE.seance;
  if (!seance) { alert('Aucune séance importée.'); return; }

  _setProgress('Génération du JSON…', '');
  _setResult('');
  const mailCard = document.getElementById('mail-card');
  if (mailCard) mailCard.style.display = 'none';

  const { resultats, encadrementResultats } = _computeResultats(seance, TERRAIN_STATE.saisies);
  const exportObj = _buildJsonExport(seance, resultats, encadrementResultats);
  const jsonStr       = JSON.stringify(exportObj, null, 2);
  const jsonBlob      = new Blob([jsonStr], { type: 'application/json' });
  const jsonFileName  = `resultat_${seance.seanceId || 'seance'}.json`;

  _dernierExportBlobs = { zipBlob: null, jsonBlob, jsonFileName, zipFileName: null, seance, resultats };

  try { await dbSetMeta({ derniereExportResultatAt: exportObj.exportedFromTerrainAt }); } catch (_) {}

  _dlBlob(jsonBlob, jsonFileName);

  _setResult(`<div style="font-size:13px;margin-top:8px">
    ✓ JSON exporté : <code>${jsonFileName}</code><br>
    ✓ ${resultats.filter(r => r.present).length} tireur(s) présent(s) inclus
  </div>`);
  _setProgress('', '');
  if (mailCard) mailCard.style.display = 'block';
}

/** Export PDF (ZIP) — génère les PDF ISTC + Test tir et les compresse avec le JSON. */
async function genererExportPdf() {
  const seance = TERRAIN_STATE.seance;
  if (!seance) { alert('Aucune séance importée.'); return; }

  _setProgress('Génération des PDF…', '');
  _setResult('');
  const mailCard = document.getElementById('mail-card');
  if (mailCard) mailCard.style.display = 'none';
  _dernierExportBlobs = null;

  const zip    = new JSZip();
  const erreurs = [];
  let nbPdfOk  = 0;

  const { resultats, presents, encadrementResultats } = _computeResultats(seance, TERRAIN_STATE.saisies);

  for (let i = 0; i < presents.length; i++) {
    const saisie = presents[i];
    _setProgress(`(${i + 1}/${presents.length}) ${saisie.nomComplet}…`, '');

    const resultatTireur = resultats.find(r => r.present &&
      (saisie.nid ? r.nid === saisie.nid : r.nomComplet === saisie.nomComplet)
    );
    if (!resultatTireur || !resultatTireur._cat) continue;

    const cat  = resultatTireur._cat;
    const nomF = resultatTireur._nomF;
    const info = resultatTireur._tireurInfo;

    try {
      const bytes = await fillIstcPdf(resultatTireur, info, seance);
      if (bytes) { zip.file(`ISTC_${cat}_${nomF}.pdf`, bytes); nbPdfOk++; }
    } catch (e) {
      erreurs.push(`ISTC ${saisie.nomComplet} : ${e.message}`);
      console.error('fillIstcPdf', e);
    }

    try {
      const bytes = await fillTestTirPdf(resultatTireur, info, seance);
      if (bytes) { zip.file(`TestTir_${cat}_${nomF}.pdf`, bytes); nbPdfOk++; }
    } catch (e) {
      erreurs.push(`TestTir ${saisie.nomComplet} : ${e.message}`);
      console.error('fillTestTirPdf', e);
    }
  }

  // Inclure le JSON dans le ZIP
  const exportObj    = _buildJsonExport(seance, resultats, encadrementResultats);
  const jsonStr      = JSON.stringify(exportObj, null, 2);
  const jsonBlob     = new Blob([jsonStr], { type: 'application/json' });
  const jsonFileName = `resultat_${seance.seanceId || 'seance'}.json`;
  zip.file(jsonFileName, jsonStr);

  _setProgress('Compression ZIP…', '');
  let zipBlob;
  try {
    zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  } catch (e) {
    _setProgress('⚠ Erreur ZIP : ' + e.message, 'error');
    return;
  }

  const dateStr     = (seance.dateTir || exportObj.exportedFromTerrainAt.slice(0, 10)).replace(/-/g, '');
  const zipFileName = `resultats_tir_${dateStr}.zip`;

  _dernierExportBlobs = { zipBlob, jsonBlob, jsonFileName, zipFileName, seance, resultats };

  try { await dbSetMeta({ derniereExportResultatAt: exportObj.exportedFromTerrainAt }); } catch (_) {}

  _dlBlob(zipBlob, zipFileName);

  let resultHtml = `<div style="margin-top:8px;font-size:13px;line-height:1.9">
    ✓ <b>${nbPdfOk}</b> PDF générés (${presents.filter(s => s.categorieChoisie).length * 2} attendus)<br>
    ✓ JSON inclus dans le ZIP<br>
    ✓ ZIP : <code>${zipFileName}</code>
  </div>`;

  if (erreurs.length) {
    resultHtml += `<div class="t-hint" style="color:var(--t-error);margin-top:8px">⚠ Erreurs :<br>${erreurs.map(e => '• ' + e).join('<br>')}</div>`;
  }

  _setResult(resultHtml);
  _setProgress('', '');
  if (mailCard) mailCard.style.display = 'block';
}
