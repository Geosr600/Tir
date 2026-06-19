/* regles.js — règles métier pures (ISTC + Test tir), sans accès DOM.
   Utilisé à la fois par saisie.js (affichage temps réel) et export.js (valeur figée
   au moment de la génération PDF/JSON) — une seule source de vérité. */

const SEUIL_REUSSITE        = { FA: 12, PA: 7 };
const TOTAL_MAX              = { FA: 20, PA: 12 };
const NB_SEQUENCES_TEST_TIR  = { FA: 8, PA: 7 };
const NB_LIGNES_CONNAISSANCES = 12;
const LIGNES_ELIMINATOIRES    = [1, 2, 3];
const NB_LIGNES_CATALOGUE     = { FA: 5, PA: 4 };

/* ── Libellés des 12 lignes de connaissances ISTC ─────────────────── */

const ISTC_LIBELLES = {
  FA: [
    { n:  1, libelle: "Les 4 règles élémentaires de sécurité" },
    { n:  2, libelle: "Les opérations de sécurité (OS) / les opérations de désarmement" },
    { n:  3, libelle: "Les commandements de tir techniques / ordres de tir tactiques" },
    { n:  4, libelle: "Les munitions" },
    { n:  5, libelle: "Les genres et positions de tir" },
    { n:  6, libelle: "Citer et exécuter les 03 manipulations de base" },
    { n:  7, libelle: "Résoudre un incident de tir, détente active" },
    { n:  8, libelle: "Résoudre un incident de tir, détente molle avec analyse" },
    { n:  9, libelle: "Exécuter un changement de chargeur tactique" },
    { n: 10, libelle: "Exécuter un changement de chargeur d'urgence" },
    { n: 11, libelle: "Le réglage des organes de visée / aide à la visée" },
    { n: 12, libelle: "Démonter et remonter l'arme" },
  ],
  PA: [
    { n:  1, libelle: "Les 4 règles élémentaires de sécurité" },
    { n:  2, libelle: "Les opérations de sécurité (OS), les opérations de désarmement" },
    { n:  3, libelle: "Les commandements de tir techniques / ordres de tir tactiques" },
    { n:  4, libelle: "Les munitions" },
    { n:  5, libelle: "Le dégainer / rengainer" },
    { n:  6, libelle: "Les genres et positions de tir" },
    { n:  7, libelle: "Citer et exécuter les 03 manipulations de base" },
    { n:  8, libelle: "Résoudre un incident de tir, détente active" },
    { n:  9, libelle: "Résoudre un incident de tir, détente molle avec analyse" },
    { n: 10, libelle: "Exécuter un changement de chargeur tactique" },
    { n: 11, libelle: "Exécuter un changement de chargeur d'urgence" },
    { n: 12, libelle: "Démonter et remonter l'arme" },
  ],
};

/* ── Libellés du Catalogue des Tirs d'Instruction ─────────────────── */

const CATALOGUE_LIBELLES = {
  FA: [
    { n: 1, cartouches: 40, libelle: "Accoutumance et fondamentaux" },
    { n: 2, cartouches: 10, libelle: "Réglage (fusil / aide à la visée)" },
    { n: 3, cartouches: 10, libelle: "Positions de tir" },
    { n: 4, cartouches: 10, libelle: "Changements de chargeur" },
    { n: 5, cartouches: 10, libelle: "Incidents de tir et leurs résolutions" },
  ],
  PA: [
    { n: 1, cartouches: 50, libelle: "Prise en main / position tir debout / plusieurs distances dont dégainer" },
    { n: 2, cartouches: 10, libelle: "Positions de tir à genou(x)" },
    { n: 3, cartouches: 10, libelle: "Changements de chargeur" },
    { n: 4, cartouches: 10, libelle: "Incidents de tir et leurs résolutions" },
  ],
};

/* ── Séquences des tests de tir avec tous les paramètres PDF ────────
   scoreMax : points attribués à la séquence (somme = TOTAL_MAX[cat])
   cartouches : descriptif imprimé sur le PDF (informatif, pas de calcul ici)  */

const SEQUENCES = {
  FA: [
    { n: 1, libelle: "Tir couché à bras francs, coup par coup, zone X — revenir en position contact entre les 2 tirs",      temps: "7''", distance: "25m", cartouches: "02×01",          scoreMax: 2 },
    { n: 2, libelle: "Tir à genoux, coup par coup, zone X — revenir en position contact entre les 2 tirs",                  temps: "5''", distance: "25m", cartouches: "02×01",          scoreMax: 2 },
    { n: 3, libelle: "Tir debout, coup par coup, zone X — revenir en position contact entre les 2 tirs",                    temps: "3''", distance: "25m", cartouches: "02×01",          scoreMax: 2 },
    { n: 4, libelle: "Tir debout, \"doublette\", zone X + DE / CCU (à l'issue de la séquence, hors temps)",                 temps: "7''", distance: "15m", cartouches: "01×02 + 01 DE", scoreMax: 3 },
    { n: 5, libelle: "Départ position de patrouille, tir 2 genoux au sol, \"doublette\" zone X",                            temps: "6''", distance: "15m", cartouches: "01×02",          scoreMax: 2 },
    { n: 6, libelle: "Départ position de patrouille, debout, \"doublette\" zone X + DE",                                    temps: "4''", distance: "15m", cartouches: "01×02 + 01 DE", scoreMax: 3 },
    { n: 7, libelle: "Réaction sur un incident de tir, détente active — coup par coup, debout, zone X",                     temps: "5''", distance: "15m", cartouches: "01×01",          scoreMax: 1 },
    { n: 8, libelle: "Cibles multiples ([1+2+1] zone X + 1 DE côté droit)",                                                 temps: "8''", distance: "15m", cartouches: "01×05",          scoreMax: 5 },
  ],
  PA: [
    { n: 1, libelle: "Debout, zone X, stade 1",                                                                              temps: "5''", distance: "10m", cartouches: "01×01",          scoreMax: 1 },
    { n: 2, libelle: "Debout, zone X, stade 2",                                                                              temps: "4''", distance: "10m", cartouches: "01×01",          scoreMax: 1 },
    { n: 3, libelle: "Debout, doublette zone X + DE / CCU (à l'issue de la séquence, hors temps demandé)",                  temps: "6''", distance: "10m", cartouches: "01×02 + 01 DE", scoreMax: 3 },
    { n: 4, libelle: "01 genou, zone X",                                                                                     temps: "4''", distance: "07m", cartouches: "01×01",          scoreMax: 1 },
    { n: 5, libelle: "02 genoux, zone X",                                                                                    temps: "4''", distance: "07m", cartouches: "01×01",          scoreMax: 1 },
    { n: 6, libelle: "Tir coup par coup sur menaces multiples, debout, zone X + DE",                                         temps: "6''", distance: "05m", cartouches: "01×02 + 01 DE", scoreMax: 3 },
    { n: 7, libelle: "Dégainer, tir en \"doublette\" debout, zone X",                                                        temps: "3''", distance: "05m", cartouches: "01×02",          scoreMax: 2 },
  ],
};

/**
 * Détermine si l'ISTC est éliminatoire :
 * - une ligne 1 à 3 du bloc "Connaissances" notée rouge, OU
 * - une ligne du "Catalogue des Tirs d'Instruction" notée rouge ou avec NO SAFE coché.
 * L'accumulation de jaunes/erreurs de gestuelle (lignes 4+) n'est jamais éliminatoire.
 */
function calculerEliminatoireIstc(lignesConnaissances, catalogueTirs) {
  const eliminationConnaissances = (lignesConnaissances || []).some(
    l => LIGNES_ELIMINATOIRES.includes(l.n) && l.couleur === 'rouge'
  );
  const eliminationCatalogue = (catalogueTirs || []).some(
    l => l.couleur === 'rouge' || l.noSafe === true
  );
  return eliminationConnaissances || eliminationCatalogue;
}

/** Résultat final ISTC : REUSSITE si non éliminatoire, ECHEC sinon. */
function calculerResultatIstc(eliminatoire) {
  return eliminatoire ? 'ECHEC' : 'REUSSITE';
}

/** Somme des scores des séquences d'un test tir (champ `score` de chaque ligne). */
function calculerTotalTestTir(sequences) {
  return (sequences || []).reduce((sum, s) => sum + (Number(s.score) || 0), 0);
}

/**
 * Résultat final du test tir selon le type d'arme :
 * - FA : réussite si score total >= 12 (sur 20)
 * - PA : réussite si score total >= 7 (sur 12)
 * - dans tous les cas, "no safe" force l'échec quel que soit le score.
 */
function calculerResultatTestTir(typeArme, totalScore, noSafe) {
  if (noSafe) return 'ECHEC';
  const seuil = SEUIL_REUSSITE[typeArme];
  if (seuil === undefined) return 'ECHEC';
  return totalScore >= seuil ? 'REUSSITE' : 'ECHEC';
}

/**
 * Construit l'objet `istc` complet (lignes + dérivés) à partir d'une saisie brute.
 * `lignesConnaissances`/`catalogueTirs` : tableaux déjà saisis par l'utilisateur.
 */
function calculerBlocIstc(template, lignesConnaissances, catalogueTirs, commentairesParLigne, observationsGenerales) {
  const eliminatoire = calculerEliminatoireIstc(lignesConnaissances, catalogueTirs);
  return {
    template,
    lignes: lignesConnaissances,
    commentairesParLigne: commentairesParLigne || {},
    catalogueTirs,
    eliminatoire,
    resultatFinal: calculerResultatIstc(eliminatoire),
    observationsGenerales: observationsGenerales || '',
  };
}

/**
 * Construit l'objet `testTir` complet (séquences + dérivés) à partir d'une saisie brute.
 * `typeArme` : 'FA' | 'PA'.
 */
function calculerBlocTestTir(template, typeArme, sequences, noSafe, commentaires) {
  const totalScore = calculerTotalTestTir(sequences);
  return {
    template,
    sequences,
    totalScore,
    totalMax: TOTAL_MAX[typeArme],
    noSafe: !!noSafe,
    resultatFinal: calculerResultatTestTir(typeArme, totalScore, !!noSafe),
    commentaires: commentaires || '',
  };
}
