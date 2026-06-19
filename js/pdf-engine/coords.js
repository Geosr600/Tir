/* coords.js — mapping champ → coordonnées PDF (points, origine bas-gauche), un objet par
   template. Données pures, aucune logique ici.

   ORIGINE DES DONNÉES : extraites automatiquement par décompression des flux de contenu
   des 4 PDF modèles (parsing des opérateurs Tm/Td/Tj/TJ/k/re) — PAS de calibration visuelle
   manuelle (aucun outil de rendu PDF disponible dans cet environnement). La plupart des
   ancres (numéros de ligne, colonnes, cases couleur du bloc Catalogue) sont fiables car
   lues directement dans le flux. Certaines zones restent ESTIMÉES (signalées ci-dessous) et
   DOIVENT être vérifées visuellement (ouvrir un PDF généré et comparer à l'original) avant
   tout déploiement réel — voir calibration-tool.html pour ajuster ces valeurs si besoin.

   Important : test-tir-fa/pa ont /Rotate 90 dans le PDF source. Les coordonnées ci-dessous
   sont dans l'espace du FLUX DE CONTENU NON TOURNÉ (= celui dans lequel pdf-lib écrit par
   défaut via page.drawText/drawRectangle) — ne pas les transformer, la rotation /Rotate
   s'applique uniformément à l'affichage par le lecteur PDF, contenu original + overlay.
   Conséquence visuelle : ce qui est une "colonne" à l'écran correspond à un X variable (pas
   un Y variable) dans ces coordonnées — c'est normal, ne pas "corriger". */

const PDF_COORDS = {

  'istc-fa': {
    rotate: 0,
    header: {
      // Le libellé "Identité du tireur (...) : Unité :" est un seul run de texte (non scindé)
      // dans ce PDF — positions ESTIMÉES par analogie avec istc-pa (même gabarit, colonnes alignées).
      nomTireur: { x: 268, y: 788.3 },   // estimé
      unite:     { x: 475, y: 788.3 },   // estimé
      // "ARME :" est sur la ligne du titre de section (même y), valeur écrite juste après
      // le libellé sur la même ligne — vérifié empiriquement (génération + extraction texte).
      arme:      { x: 480, y: 755.3 },
    },
    // Cases couleur directement dessinées sur chaque ligne (pas de légende séparée) :
    // x fixes par couleur, y = celui de la ligne (même rangée).
    connaissancesCouleurX: { rouge: 520.42, jaune: 535.29, vert: 550.16 },
    connaissances: [
      {n:1,  y:714.20}, {n:2,  y:688.54}, {n:3,  y:660.23}, {n:4,  y:638.88},
      {n:5,  y:624.37}, {n:6,  y:609.97}, {n:7,  y:595.58}, {n:8,  y:574.11},
      {n:9,  y:552.76}, {n:10, y:538.37}, {n:11, y:523.86}, {n:12, y:509.46},
    ],
    commentaireColX: 390.88,
    noSafeColGlobalX: 491.39,
    // Catalogue : seules 4 rangées confirmées dans le flux (la 5e, "Réglage", n'a pas été
    // localisée avec certitude — ligne omise du remplissage plutôt que mal positionnée).
    catalogue: [
      {n:1, y:301.73, rouge:{x:482.04,y:265.63,w:27.95,h:28.31}, jaune:{x:510.46,y:265.63,w:24.35,h:28.31}, vert:{x:535.29,y:265.63,w:24.35,h:28.31}, observationColX:311.24},
      {n:2, y:250.40, rouge:{x:482.04,y:243.08,w:27.95,h:21.95}, jaune:{x:510.46,y:243.08,w:24.35,h:21.95}, vert:{x:535.29,y:243.08,w:24.35,h:21.95}, observationColX:311.24},
      {n:3, y:227.85, rouge:{x:482.04,y:220.53,w:27.95,h:21.95}, jaune:{x:510.46,y:220.53,w:24.35,h:21.95}, vert:{x:535.29,y:220.53,w:24.35,h:21.95}, observationColX:311.24},
      {n:4, y:205.30, rouge:{x:482.04,y:197.98,w:27.95,h:22.07}, jaune:{x:510.46,y:197.98,w:24.35,h:22.07}, vert:{x:535.29,y:197.98,w:24.35,h:22.07}, observationColX:311.24},
    ],
    // Bloc signatures retenu : le plus bas de page (après la section Catalogue), donc le
    // bilan final de la fiche. Un 2e bloc existe vers y≈458 (probablement signature
    // intermédiaire après la seule section Connaissances) — non utilisé pour l'instant.
    signatures: {
      date:      { x: 57,  y: 173 },
      tireur:    { x: 148, y: 173, w: 90, h: 40 },
      formateur: { x: 299, y: 173, w: 90, h: 40 },
      autorite:  { x: 452, y: 173, w: 90, h: 40 },
    },
  },

  'istc-pa': {
    rotate: 0,
    header: {
      nomTireur: { x: 268, y: 798.0 },
      unite:     { x: 475, y: 798.0 },
      arme:      { x: 480, y: 774.8 }, // même principe que istc-fa : sur la ligne du titre de section
    },
    connaissancesCouleurX: { rouge: 520.42, jaune: 535.29, vert: 550.16 },
    connaissances: [
      {n:1,  y:733.63}, {n:2,  y:707.97}, {n:3,  y:679.66}, {n:4,  y:658.31},
      {n:5,  y:643.80}, {n:6,  y:629.40}, {n:7,  y:615.01}, {n:8,  y:600.50},
      {n:9,  y:579.15}, {n:10, y:557.80}, {n:11, y:543.41}, {n:12, y:528.90},
    ],
    commentaireColX: 390.88,
    noSafeColGlobalX: 491.39,
    // Ligne 1 sans cases couleur dessinées dans ce gabarit (différent de istc-fa) — omise.
    catalogue: [
      {n:2, y:256.51, rouge:{x:482.04,y:249.20,w:27.95,h:22.07}, jaune:{x:510.46,y:249.20,w:24.35,h:22.07}, vert:{x:535.29,y:249.20,w:24.35,h:22.07}, observationColX:311.24},
      {n:3, y:233.96, rouge:{x:482.04,y:226.77,w:27.95,h:21.95}, jaune:{x:510.46,y:226.77,w:24.35,h:21.95}, vert:{x:535.29,y:226.77,w:24.35,h:21.95}, observationColX:311.24},
      {n:4, y:211.54, rouge:{x:482.04,y:204.22,w:27.95,h:21.95}, jaune:{x:510.46,y:204.22,w:24.35,h:21.95}, vert:{x:535.29,y:204.22,w:24.35,h:21.95}, observationColX:311.24},
    ],
    signatures: {
      date:      { x: 57,  y: 179 },
      tireur:    { x: 148, y: 179, w: 90, h: 40 },
      formateur: { x: 299, y: 179, w: 90, h: 40 },
      autorite:  { x: 452, y: 179, w: 90, h: 40 },
    },
  },

  'test-tir-fa': {
    rotate: 90,
    header: {
      nomTireur: { x: 76,  y: 18  },
      unite:     { x: 76,  y: 630 },
      arme:      { x: 81,  y: 700 }, // dans la case ARME (box x:76.5 y:625.4 w:20.0 h:159.8)
    },
    // x variable par séquence, y constant (colonne Score) — conséquence de /Rotate 90.
    sequences: [
      {n:1, x:145.0, y:540.8}, {n:2, x:172.8, y:540.8}, {n:3, x:200.9, y:540.8}, {n:4, x:229.0, y:540.8},
      {n:5, x:257.0, y:540.8}, {n:6, x:285.1, y:540.8}, {n:7, x:313.2, y:540.8}, {n:8, x:341.6, y:540.8},
    ],
    total:    { x: 368.9, y: 731.8 },
    // Cases REUSSITE/ECHEC pré-imprimées (puces décoratives, pas des cases vides) : repère
    // visuel positionné juste devant le libellé concerné plutôt que dans la puce elle-même.
    resultatMark: { reussite: { x: 388, y: 552 }, echec: { x: 401, y: 552 } },
    // ZONE INCERTAINE — colonnes/rangées de signature déduites des bordures de tableau,
    // correspondance exacte non confirmée visuellement. À valider avant déploiement réel.
    signatures: {
      date:      { x: 396, y: 57 },
      tireur:    { x: 447, y: 57, w: 50, h: 40 },
      formateur: { x: 504, y: 57, w: 50, h: 40 },
      autorite:  { x: 561, y: 57, w: 50, h: 40 },
    },
  },

  'test-tir-pa': {
    rotate: 90,
    header: {
      nomTireur: { x: 76,  y: 18  },
      unite:     { x: 76,  y: 627 },
      arme:      { x: 81,  y: 700 },
    },
    sequences: [
      {n:1, x:140.1, y:540.8}, {n:2, x:158.1, y:540.8}, {n:3, x:181.1, y:540.8},
      {n:4, x:204.4, y:540.8}, {n:5, x:222.4, y:540.8}, {n:6, x:245.2, y:540.8}, {n:7, x:269.7, y:540.8},
    ],
    total:    { x: 293.7, y: 730.0 },
    resultatMark: { reussite: { x: 313, y: 552 }, echec: { x: 326, y: 552 } },
    signatures: {
      date:      { x: 321, y: 57 },
      tireur:    { x: 372, y: 57, w: 50, h: 40 },
      formateur: { x: 429, y: 57, w: 50, h: 40 },
      autorite:  { x: 486, y: 57, w: 50, h: 40 },
    },
  },
};
