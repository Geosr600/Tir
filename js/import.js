/* import.js — import du seance_export.json (input file classique, pas de File System
   Access API — indisponible sur Safari iOS et non fiable sur navigateur mobile Android). */

const IMPORT_FORMAT_VERSION_MAX = 1;

function _categorieParDefaut(seance) {
  // PAFA : pas de catégorie unique évidente, l'utilisateur choisira sur la fiche du tireur.
  return (seance.typeArme === 'FA' || seance.typeArme === 'PA') ? seance.typeArme : null;
}

/** Construit l'objet de saisie par défaut (vide) pour un tireur fraîchement importé. */
function buildDefaultSaisie(tireur, seance) {
  const categorie = _categorieParDefaut(seance);
  return {
    nid: tireur.nid || '',
    badge: tireur.badge || '',
    nomComplet: tireur.nomComplet,
    present: true,
    categorieChoisie: categorie,
    armesUtilisees: categorie ? (tireur.armesPrevues || []).slice(0, 1) : [],
    nettoyageEffectue: !!tireur.nettoyagePrevu,
    istcLignes: Array.from({ length: NB_LIGNES_CONNAISSANCES }, (_, i) => ({ n: i + 1, couleur: 'vert' })),
    istcCommentairesParLigne: {},
    istcCatalogue: buildCatalogueVide(categorie),
    istcObservations: '',
    istcDateIstc: seance.dateIstc || '',
    istcSignatures: { tireur: null, formateur: null, dateSignature: null },
    testTirSequences: categorie ? buildSequencesVides(categorie) : [],
    testTirNoSafe: false,
    testTirCommentaires: '',
    tirDateTir: seance.dateTir || '',
    tirSignatures: { tireur: null, formateur: null, dateSignature: null },
    observationsLibres: '',
  };
}

function buildSequencesVides(categorie) {
  return (SEQUENCES[categorie] || []).map(s => ({ n: s.n, score: 0 }));
}

function buildCatalogueVide(categorie) {
  const lignes = CATALOGUE_LIBELLES[categorie] || CATALOGUE_LIBELLES.FA;
  return lignes.map(l => ({ n: l.n, couleur: 'vert', noSafe: false, observation: '' }));
}

function setImportStatus(msg, type) {
  const el = document.getElementById('import-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 't-status' + (type ? ' ' + type : '');
}

function _lireTexte(file) {
  // file.text() indisponible sur iOS < 14 — fallback FileReader universel
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
  event.target.value = ''; // permet de réimporter le même fichier si besoin
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
    TERRAIN_STATE.saisies = {};
  }

  await dbSaveSeance(seance);
  TERRAIN_STATE.seance = seance;

  // N'initialise que les tireurs qui n'ont pas déjà une saisie en cours (réimport de la
  // même séance après mise à jour côté appli principale : on ne perd pas le travail fait).
  for (const t of seance.tireurs) {
    const key = personKey(t);
    if (!TERRAIN_STATE.saisies[key]) {
      const saisie = buildDefaultSaisie(t, seance);
      TERRAIN_STATE.saisies[key] = saisie;
      await dbSaveSaisie(key, saisie);
    }
  }

  setImportStatus('✓ Séance importée : ' + (seance.tireurs.length) + ' tireur(s).', 'ok');
  setTimeout(goToListe, 600);
}

function renderResumeSeanceCard() {
  const card = document.getElementById('resume-seance-card');
  const content = document.getElementById('resume-seance-content');
  const seance = TERRAIN_STATE.seance;
  if (!seance) { card.style.display = 'none'; return; }

  const nbTireurs = (seance.tireurs || []).length;
  const saisies = Object.values(TERRAIN_STATE.saisies || {});
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

function _isSaisieTerminee(s) {
  if (!s.present) return true; // absent = rien à saisir, considéré "traité"
  if (!s.categorieChoisie) return false;
  // ISTC : toutes les lignes sont par défaut vertes → considéré fait dès que catégorie choisie.
  // Test tir : au moins un score saisi (score > 0) indique un passage réel.
  const tirFait = (s.testTirSequences || []).some(l => l.score > 0);
  return tirFait;
}

async function confirmResetSeance() {
  if (!confirm('Effacer la séance en cours et toutes les saisies non exportées ?')) return;
  await dbClearAll();
  TERRAIN_STATE.seance = null;
  TERRAIN_STATE.saisies = {};
  document.getElementById('resume-seance-card').style.display = 'none';
  setImportStatus('Séance effacée. Importez un nouveau fichier.', '');
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('import-file-input');
  if (input) input.addEventListener('change', handleImportFile);
});
