/* export.js — génération du resultat_seance.json + 1 PDF ISTC + 1 PDF Test tir par tireur
   présent, assemblage dans un ZIP via JSZip, déclenchement des téléchargements.
   Expose window._dernierExportBlobs pour mail.js. */

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

/** Affiche le résumé sur l'écran export (appelé par goToExport dans app.js). */
function renderExportSummary() {
  const el = document.getElementById('export-summary');
  if (!el) return;

  const seance = TERRAIN_STATE.seance;
  if (!seance) {
    el.innerHTML = '<p class="t-hint">Aucune séance importée.</p>';
    return;
  }

  const saisies  = Object.values(TERRAIN_STATE.saisies || {});
  const presents = saisies.filter(s => s.present);
  const termines = presents.filter(_isSaisieTerminee);
  const non      = presents.filter(s => !_isSaisieTerminee(s));

  let html = `<div style="font-size:13px;line-height:2">
    <b>Date :</b> ${seance.dateTir || '—'}<br>
    <b>Lieu :</b> ${seance.lieuLib || seance.lieu || '—'}<br>
    <b>Tireurs présents :</b> ${presents.length}<br>
    <b>Saisies terminées :</b> ${termines.length} / ${presents.length}
  </div>`;

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

/** Génère les PDF + JSON + ZIP pour tous les tireurs présents, puis déclenche les téléchargements. */
async function genererExportComplet() {
  const seance = TERRAIN_STATE.seance;
  if (!seance) { alert('Aucune séance importée.'); return; }

  _setProgress('Génération en cours…', '');
  _setResult('');
  const mailCard = document.getElementById('mail-card');
  if (mailCard) mailCard.style.display = 'none';
  _dernierExportBlobs = null;

  const zip      = new JSZip();
  const resultats = [];
  const erreurs  = [];

  const saisies  = Object.values(TERRAIN_STATE.saisies || {});
  const presents = saisies.filter(s => s.present);
  const absents  = saisies.filter(s => !s.present);

  let nbPdfOk = 0;

  for (let i = 0; i < presents.length; i++) {
    const saisie = presents[i];
    _setProgress(`(${i + 1}/${presents.length}) ${saisie.nomComplet}…`, '');

    const cat      = saisie.categorieChoisie; // 'FA' | 'PA' | null
    const srcTireur = _findTireurSeance(saisie, seance.tireurs);
    const tireurInfo = {
      nomComplet: saisie.nomComplet,
      unite: srcTireur?.unite || seance.unite || '',
    };

    const istcBlocBase = calculerBlocIstc(
      cat ? _templateIstc(cat) : null,
      saisie.istcLignes               || [],
      saisie.istcCatalogue            || [],
      saisie.istcCommentairesParLigne || {},
      saisie.istcObservations         || ''
    );
    const istcBloc = cat ? {
      ...istcBlocBase,
      arme:       cat,
      dateIstc:   saisie.istcDateIstc || seance.dateIstc || '',
      signatures: saisie.istcSignatures || { tireur: null, formateur: null, dateSignature: null },
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
      arme:          cat,
      dateTir:       saisie.tirDateTir || seance.dateTir || '',
      armesUtilisees: saisie.armesUtilisees || [],
      signatures:    saisie.tirSignatures || { tireur: null, formateur: null, dateSignature: null },
    } : null;

    const resultatTireur = {
      nid:               saisie.nid    || '',
      badge:             saisie.badge  || '',
      nomComplet:        saisie.nomComplet,
      present:           true,
      nettoyageEffectue: !!saisie.nettoyageEffectue,
      istc:              istcBloc,
      tir:               tirBloc,
      observationsLibres: saisie.observationsLibres || '',
    };
    resultats.push(resultatTireur);

    if (!cat) continue; // catégorie non choisie → JSON seulement, pas de PDF

    const nomF = _nomFichierSafe(saisie.nomComplet);

    // PDF ISTC
    try {
      const bytes = await fillIstcPdf(resultatTireur, tireurInfo, seance);
      if (bytes) { zip.file(`ISTC_${cat}_${nomF}.pdf`, bytes); nbPdfOk++; }
    } catch (e) {
      erreurs.push(`ISTC ${saisie.nomComplet} : ${e.message}`);
      console.error('fillIstcPdf', e);
    }

    // PDF Test tir
    try {
      const bytes = await fillTestTirPdf(resultatTireur, tireurInfo, seance);
      if (bytes) { zip.file(`TestTir_${cat}_${nomF}.pdf`, bytes); nbPdfOk++; }
    } catch (e) {
      erreurs.push(`TestTir ${saisie.nomComplet} : ${e.message}`);
      console.error('fillTestTirPdf', e);
    }
  }

  // Absents : présents dans le JSON, pas de PDF
  for (const saisie of absents) {
    resultats.push({
      nid:               saisie.nid    || '',
      badge:             saisie.badge  || '',
      nomComplet:        saisie.nomComplet,
      present:           false,
      armesUtilisees:    [],
      nettoyageEffectue: false,
      istc:              null,
      tir:               null,
      observationsLibres: saisie.observationsLibres || '',
    });
  }

  // resultat_seance.json
  const exportedAt = new Date().toISOString();
  const resultatJson = {
    version_schema:        '2.0',
    seanceId:              seance.seanceId,
    exportedFromTerrainAt: exportedAt,
    tireurs:               resultats,
    cloture:               TERRAIN_STATE.cloture || null,
  };

  const jsonStr      = JSON.stringify(resultatJson, null, 2);
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

  const dateStr     = (seance.dateTir || exportedAt.slice(0, 10)).replace(/-/g, '');
  const zipFileName = `resultats_tir_${dateStr}.zip`;

  // Stockage pour mail.js
  _dernierExportBlobs = { zipBlob, jsonBlob, jsonFileName, zipFileName, seance, resultats };

  // Sauvegarde de l'horodatage en IndexedDB
  try { await dbSetMeta({ derniereExportResultatAt: exportedAt }); } catch (_) {}

  // Téléchargements (léger décalage pour ne pas bloquer deux dialogs simultanés)
  _dlBlob(jsonBlob, jsonFileName);
  setTimeout(() => _dlBlob(zipBlob, zipFileName), 500);

  // Résultat affiché
  let resultHtml = `<div style="margin-top:8px;font-size:13px;line-height:1.9">
    ✓ <b>${presents.length}</b> tireur(s) exporté(s) dans le JSON<br>
    ✓ <b>${nbPdfOk}</b> PDF générés (${presents.filter(s => s.categorieChoisie).length * 2} attendus)<br>
    ✓ JSON : <code>${jsonFileName}</code><br>
    ✓ ZIP : <code>${zipFileName}</code>
  </div>`;

  if (erreurs.length) {
    resultHtml += `<div class="t-hint" style="color:var(--t-error);margin-top:8px">⚠ Erreurs de génération :<br>${erreurs.map(e => '• ' + e).join('<br>')}</div>`;
  }

  _setResult(resultHtml);
  _setProgress('', '');
  if (mailCard) mailCard.style.display = 'block';
}
