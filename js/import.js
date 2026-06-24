/* import.js — import du seance_export.json (input file classique, pas de File System
   Access API — indisponible sur Safari iOS et non fiable sur navigateur mobile Android). */

const IMPORT_FORMAT_VERSION_MAX = 2;

function _categorieParDefaut(seance) {
  return (seance.typeArme === 'FA' || seance.typeArme === 'PA') ? seance.typeArme : null;
}

/**
 * Construit un bloc vide (les 3 parties) pour une arme et une catégorie données.
 * Si une seule arme est disponible pour la catégorie, elle est pré-sélectionnée.
 */
function buildBlocVide(categorie, armeId, seance) {
  const dateTir  = (seance && seance.dateTir)  || '';
  const dateIstc = (seance && seance.dateIstc) || '';
  // Auto-sélection si une seule arme disponible pour cette catégorie
  if (categorie && !armeId && seance) {
    const armesForCat = ((seance.armesDisponibles || []).filter(a => a.categorie === categorie));
    if (armesForCat.length === 1) armeId = armesForCat[0].id;
  }
  return {
    categorie,
    armeId: armeId || '',
    // Partie 1 — Connaissances
    connaissancesPresent:              true,
    istcLignes:                        categorie ? Array.from({ length: NB_LIGNES_CONNAISSANCES }, (_, i) => ({ n: i + 1, couleur: 'vert' })) : [],
    connaissancesCommentairesParLigne: {},
    istcCommentairesParLigne:          {},
    istcDateIstc:                      dateIstc,
    connaissancesSignatures:           { tireur: null, formateur: null, dateSignature: null },
    connaissancesMTCInfo:              null,
    // Partie 2 — Catalogue
    cataloguePresent:                  true,
    istcCatalogueNonEffectue:          false,
    istcCatalogue:                     buildCatalogueVide(categorie),
    catalogueCommentairesParLigne:     {},
    istcObservations:                  '',
    istcSignatures:                    { tireur: null, formateur: null, dateSignature: null },
    istcSignatureMTCInfo:              null,
    // Partie 3 — Test tir
    testTirPresent:                    true,
    testTirSequences:                  buildSequencesVides(categorie),
    testTirNoSafe:                     false,
    testTirCommentairesParSequence:    {},
    tirDateTir:                        dateTir,
    tirSignatures:                     { tireur: null, formateur: null, dateSignature: null },
    tirSignatureMTCInfo:               null,
  };
}

/** Construit l'objet de saisie par défaut (vide) pour un tireur fraîchement importé. */
function buildDefaultSaisie(tireur, seance) {
  const typeArme   = seance.typeArme;
  const armesDispo = seance.armesDisponibles || [];

  let blocs;
  if (typeArme === 'PAFA') {
    // PAFA : un bloc vide, l'utilisateur choisit catégorie + arme
    blocs = [buildBlocVide('', '', seance)];
  } else {
    // Mono-catégorie : un bloc pré-rempli avec la première arme de la séance
    const cat = typeArme; // 'FA' ou 'PA'
    const premArmeId = (tireur.armesPrevues || [])[0]
      || ((armesDispo.find(a => a.categorie === cat) || {}).id)
      || '';
    blocs = [buildBlocVide(cat, premArmeId, seance)];
  }

  return {
    nid:               tireur.nid   || '',
    badge:             tireur.badge || '',
    nomComplet:        tireur.nomComplet,
    present:           true,
    nettoyageEffectue: !!tireur.nettoyagePrevu,
    blocs,
    observationsLibres: '',
  };
}

/**
 * Migre une saisie ancienne (v2/v3/v3.1 — champs plats ou testTirTests[]) vers v4 (blocs[]).
 * Idempotent : si blocs[] existe déjà, retourne sans modifier.
 */
function migrerBlocsV4(s) {
  if (!s) return s;
  if (Array.isArray(s.blocs) && s.blocs.length > 0) return s;

  const cat = s.categorieChoisie;

  // v3.1 : testTirTests[] existe → créer un bloc par test (Part 3), ISTC partagé sur le 1er
  const tests = Array.isArray(s.testTirTests) && s.testTirTests.length ? s.testTirTests : null;
  if (cat && tests) {
    s.blocs = tests.map((tt, i) => ({
      categorie: cat,
      armeId:    tt.armeId || '',
      // Part 1 — du premier bloc uniquement, les suivants sont vierges
      connaissancesPresent:              i === 0 ? s.connaissancesPresent !== false : true,
      istcLignes:                        i === 0 ? (s.istcLignes || []) : Array.from({ length: NB_LIGNES_CONNAISSANCES }, (_, j) => ({ n: j + 1, couleur: 'vert' })),
      connaissancesCommentairesParLigne: i === 0 ? (s.connaissancesCommentairesParLigne || {}) : {},
      istcCommentairesParLigne:          i === 0 ? (s.istcCommentairesParLigne || {})          : {},
      istcDateIstc:                      s.istcDateIstc || '',
      connaissancesSignatures:           i === 0 ? (s.connaissancesSignatures || { tireur: null, formateur: null, dateSignature: null }) : { tireur: null, formateur: null, dateSignature: null },
      connaissancesMTCInfo:              i === 0 ? (s.connaissancesMTCInfo || null) : null,
      // Part 2
      cataloguePresent:          i === 0 ? s.cataloguePresent !== false : true,
      istcCatalogueNonEffectue:  i === 0 ? !!s.istcCatalogueNonEffectue : false,
      istcCatalogue:             i === 0 ? (s.istcCatalogue || []) : buildCatalogueVide(cat),
      catalogueCommentairesParLigne: i === 0 ? (s.catalogueCommentairesParLigne || {}) : {},
      istcObservations:          i === 0 ? (s.istcObservations || '') : '',
      istcSignatures:            i === 0 ? (s.istcSignatures || { tireur: null, formateur: null, dateSignature: null }) : { tireur: null, formateur: null, dateSignature: null },
      istcSignatureMTCInfo:      i === 0 ? (s.istcSignatureMTCInfo || null) : null,
      // Part 3 — depuis chaque testTirTest
      testTirPresent:                 tt.testTirPresent !== false,
      testTirSequences:               tt.testTirSequences || [],
      testTirNoSafe:                  !!tt.testTirNoSafe,
      testTirCommentairesParSequence: tt.testTirCommentairesParSequence || {},
      tirDateTir:   tt.tirDateTir || s.tirDateTir || '',
      tirSignatures: tt.tirSignatures || { tireur: null, formateur: null, dateSignature: null },
      tirSignatureMTCInfo: tt.tirSignatureMTCInfo || null,
    }));
  } else if (cat) {
    // v2/v3 : champs plats → un seul bloc
    s.blocs = [{
      categorie: cat,
      armeId:    (s.armesUtilisees || [])[0] || '',
      connaissancesPresent:              s.connaissancesPresent !== false,
      istcLignes:                        s.istcLignes || [],
      connaissancesCommentairesParLigne: s.connaissancesCommentairesParLigne || {},
      istcCommentairesParLigne:          s.istcCommentairesParLigne || {},
      istcDateIstc:                      s.istcDateIstc || '',
      connaissancesSignatures:           s.connaissancesSignatures || { tireur: null, formateur: null, dateSignature: null },
      connaissancesMTCInfo:              s.connaissancesMTCInfo || null,
      cataloguePresent:                  s.cataloguePresent !== false,
      istcCatalogueNonEffectue:          !!s.istcCatalogueNonEffectue,
      istcCatalogue:                     s.istcCatalogue || [],
      catalogueCommentairesParLigne:     s.catalogueCommentairesParLigne || {},
      istcObservations:                  s.istcObservations || '',
      istcSignatures:                    s.istcSignatures || { tireur: null, formateur: null, dateSignature: null },
      istcSignatureMTCInfo:              s.istcSignatureMTCInfo || null,
      testTirPresent:                    s.testTirPresent !== false,
      testTirSequences:                  s.testTirSequences || [],
      testTirNoSafe:                     !!s.testTirNoSafe,
      testTirCommentairesParSequence:    s.testTirCommentairesParSequence || {},
      tirDateTir:    s.tirDateTir   || '',
      tirSignatures: s.tirSignatures || { tireur: null, formateur: null, dateSignature: null },
      tirSignatureMTCInfo: s.tirSignatureMTCInfo || null,
    }];
  } else {
    s.blocs = [];
  }
  return s;
}

/**
 * Migre une saisie v2 (ancienne structure) vers v3 en ajoutant les champs manquants.
 * Appelé avant migrerBlocsV4.
 */
function migrerSaisieV2(s) {
  if (!s) return s;
  if (s.connaissancesPresent === undefined) s.connaissancesPresent = s.present !== false;
  if (s.cataloguePresent     === undefined) s.cataloguePresent     = s.present !== false;
  if (s.testTirPresent       === undefined) s.testTirPresent       = s.present !== false;
  if (!s.connaissancesCommentairesParLigne) s.connaissancesCommentairesParLigne = s.istcCommentairesParLigne || {};
  if (!s.catalogueCommentairesParLigne)     s.catalogueCommentairesParLigne     = {};
  if (!s.testTirCommentairesParSequence)    s.testTirCommentairesParSequence    = {};
  if (Array.isArray(s.istcCatalogue)) {
    s.istcCatalogue = s.istcCatalogue.map(l => {
      if (l.noSafe && l.couleur !== 'rouge') { l = { ...l, couleur: 'rouge' }; }
      const { noSafe, ...rest } = l;
      return rest;
    });
  }
  return s;
}

function buildSequencesVides(categorie) {
  return (SEQUENCES[categorie] || []).map(s => ({ n: s.n, score: 0 }));
}

function buildCatalogueVide(categorie) {
  const lignes = CATALOGUE_LIBELLES[categorie] || CATALOGUE_LIBELLES.FA || [];
  return lignes.map(l => ({ n: l.n, couleur: 'vert' }));
}

function _isSaisieTerminee(s) {
  if (!s.present) return true;
  const blocs = s.blocs || [];
  if (blocs.length === 0) return false;
  if (blocs.some(b => !b.categorie)) return false;
  const anyScore = blocs.some(b =>
    b.testTirPresent !== false && (b.testTirSequences || []).some(sq => sq.score > 0)
  );
  const allTirNonRealise = blocs.every(b => b.testTirPresent === false);
  return anyScore || allTirNonRealise;
}

function setImportStatus(msg, type) {
  const el = document.getElementById('import-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 't-status' + (type ? ' ' + type : '');
}

function _lireTexte(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

async function handleImportFile(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;

  setImportStatus('Lecture du fichier…', '');
  let seance;
  try {
    const text = await _lireTexte(file);
    seance = JSON.parse(text);
  } catch (e) {
    setImportStatus('⚠ Fichier illisible ou JSON invalide.', 'error');
    return;
  }

  if (!seance.seanceId || !Array.isArray(seance.tireurs)) {
    setImportStatus('⚠ Ce fichier ne ressemble pas à un export de séance valide.', 'error');
    return;
  }
  if ((seance.formatVersion || 0) > IMPORT_FORMAT_VERSION_MAX) {
    setImportStatus('⚠ Ce fichier provient d\'une version plus récente de l\'application principale, non supportée ici.', 'error');
    return;
  }

  const seanceExistante = TERRAIN_STATE.seance;
  const remplaceSeance = seanceExistante && seanceExistante.seanceId !== seance.seanceId;
  if (remplaceSeance) {
    const ok = confirm(
      'Une séance est déjà en cours sur cet appareil (' + (seanceExistante.dateTir || '') + ').\n\n' +
      'Importer cette nouvelle séance EFFACERA les saisies en cours non exportées.\n\nContinuer ?'
    );
    if (!ok) { setImportStatus('Import annulé.', ''); return; }
    await dbClearAll();
    TERRAIN_STATE.saisies              = {};
    TERRAIN_STATE.signaturesEncadrement = {};
    TERRAIN_STATE.tireursAjoutes        = [];
  }

  await dbSaveSeance(seance);
  TERRAIN_STATE.seance = seance;

  for (const t of seance.tireurs) {
    const key = personKey(t);
    if (!TERRAIN_STATE.saisies[key]) {
      const saisie = buildDefaultSaisie(t, seance);
      TERRAIN_STATE.saisies[key] = saisie;
      await dbSaveSaisie(key, saisie);
    } else {
      const migre = migrerBlocsV4(migrerSaisieV2(TERRAIN_STATE.saisies[key]));
      TERRAIN_STATE.saisies[key] = migre;
      await dbSaveSaisie(key, migre);
    }
  }

  setImportStatus('✓ Séance importée : ' + (seance.tireurs.length) + ' tireur(s).', 'ok');
  setTimeout(goToListe, 600);
}

function renderResumeSeanceCard() {
  const card    = document.getElementById('resume-seance-card');
  const content = document.getElementById('resume-seance-content');
  const seance  = TERRAIN_STATE.seance;
  if (!seance) { card.style.display = 'none'; return; }

  const nbTireurs  = (seance.tireurs || []).length;
  const saisies    = Object.values(TERRAIN_STATE.saisies || {}).filter(s => !s.isEncadrement);
  const nbTermines = saisies.filter(_isSaisieTerminee).length;

  content.innerHTML = `
    <div style="font-size:13px;line-height:2">
      <b>Date du tir :</b> ${seance.dateTir || '—'}<br>
      <b>Lieu :</b> ${seance.lieuLib || seance.lieu || '—'}<br>
      <b>Arme :</b> ${seance.typeArmeLib || seance.typeArme || '—'}<br>
      <b>Tireurs :</b> ${nbTermines} / ${nbTireurs} saisie(s) terminée(s)
    </div>`;
  card.style.display = 'block';
}

async function confirmResetSeance() {
  if (!confirm('Effacer la séance en cours et toutes les saisies non exportées ?')) return;
  await dbClearAll();
  TERRAIN_STATE.seance               = null;
  TERRAIN_STATE.saisies              = {};
  TERRAIN_STATE.cloture              = null;
  TERRAIN_STATE.signaturesEncadrement = {};
  TERRAIN_STATE.tireursAjoutes        = [];
  document.getElementById('resume-seance-card').style.display = 'none';
  setImportStatus('Séance effacée. Importez un nouveau fichier.', '');
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('import-file-input');
  if (input) input.addEventListener('change', handleImportFile);
});
