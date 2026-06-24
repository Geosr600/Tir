/* coords.js — mapping champ → coordonnées PDF (points, origine bas-gauche), un objet par
   template. Données pures, aucune logique ici.

   ORIGINE DES DONNÉES : extraites automatiquement par décompression des flux de contenu
   des 4 PDF modèles (parsing des opérateurs Tm/Td/Tj/TJ/k/re) — PAS de calibration visuelle
   manuelle (aucun outil de rendu PDF disponible dans cet environnement). La plupart des
   ancres (numéros de ligne, colonnes, cases couleur du bloc Catalogue) sont fiables car
   lues directement dans le flux. Certaines zones restent ESTIMÉES (signalées ci-dessous) et
   DOIVENT être vérifées visuellement (ouvrir un PDF généré et comparer à l'original) avant
   tout déploiement réel — voir calibration-tool.html pour ajuster ces valeurs si besoin.

   Important : test-tir-fa/pa ont /Rotate 90 (CW) dans le PDF source. fill-test-tir.js pousse
   une CTM [0 1 -1 0 W 0] avant tout dessin → les coordonnées ci-dessous pour ces templates
   sont en espace PAYSAGE du viewer (x: 0→842, y: 0→595.22, origine bas-gauche).
   Conversion brut→paysage utilisée : x_l = y_brut, y_l = 595.22 − x_brut. */

const PDF_COORDS = {

  'istc-fa': {
    rotate: 0,
    header: {
      nomTireur: {x:270.7, y:787.3},
      unite:     {x:478,   y:787.3},
      arme:      {x:480,   y:754.7},
      date:      {x:43.3,  y:425.3},
    },
    elimCouleurX: { rouge: 530, vert: 553.3 },
    connaissancesCouleurX: { rouge: 527.3, jaune: 542, vert: 557.3 },
    connaissances: [
      {n:1,  markY:719.3, y:714.7},
      {n:2,  markY:692,   y:688.7},
      {n:3,  markY:665.3, y:660},
      {n:4,  markY:644,   y:640},
      {n:5,  markY:629.3, y:624.7},
      {n:6,  markY:614,   y:610.7},
      {n:7,  markY:600,   y:596.7},
      {n:8,  markY:578.7, y:575.3},
      {n:9,  markY:556.7, y:553.3},
      {n:10, markY:542.7, y:539.3},
      {n:11, markY:528.7, y:525.3},
      {n:12, markY:513.3, y:510.7},
    ],
    commentaireColX: 345.3,
    connSignatures: {
      tireur:    {x:117.3, y:407.3, w:142.7, h:46.7},
      formateur: {x:270,   y:407.3, w:106,   h:38.7},
      mtcNom:    {x:272,   y:427.3},
    },
    catalogueCouleurX: { rouge: 494.7, jaune: 522, vert: 545.3 },
    noSafeColGlobalX: 494.7,
    catalogue: [
      {n:1, markY:307.3, y:302.7, observationColX:345.3},
      {n:2, markY:280.7, y:276,   observationColX:345.3},
      {n:3, markY:255.3, y:251.3, observationColX:345.3},
      {n:4, markY:232.7, y:228.7, observationColX:345.3},
      {n:5, markY:210.7, y:206.7, observationColX:345.3},
    ],
    signatures: {
      date:      {x:39.3,  y:143.3},
      tireur:    {x:106.7, y:126,   w:136.7, h:38},
      formateur: {x:257.3, y:124.7, w:142.7, h:30.7},
      autorite:  {x:447.3, y:136,   w:90,    h:40},
      mtcNom:    {x:258.7, y:142},
    },
  },

  'istc-pa': {
    rotate: 0,
    header: {
      nomTireur: {x:272,   y:797.3},
      unite:     {x:478.7, y:798},
      arme:      {x:480.7, y:774},
      date:      {x:44,    y:434},
    },
    elimCouleurX: { rouge: 529.3, vert: 553.3 },
    connaissancesCouleurX: { rouge: 528.7, jaune: 542, vert: 556.7 },
    connaissances: [
      {n:1,  markY:738,   y:735.3},
      {n:2,  markY:713.3, y:708.7},
      {n:3,  markY:684.7, y:681.3},
      {n:4,  markY:663.3, y:659.3},
      {n:5,  markY:648.7, y:645.3},
      {n:6,  markY:634,   y:630.7},
      {n:7,  markY:619.3, y:616},
      {n:8,  markY:605.3, y:602},
      {n:9,  markY:584,   y:580.7},
      {n:10, markY:562.7, y:559.3},
      {n:11, markY:548,   y:544.7},
      {n:12, markY:533.3, y:530.7},
    ],
    commentaireColX: 345.3,
    connSignatures: {
      tireur:    {x:116.7, y:409.3, w:142,  h:58},
      formateur: {x:268.7, y:407.3, w:108,  h:50},
      mtcNom:    {x:270,   y:434},
    },
    catalogueCouleurX: { rouge: 494, jaune: 522, vert: 546.7 },
    noSafeColGlobalX: 496,
    catalogue: [
      {n:1, markY:286.7, y:282.7, observationColX:345.3},
      {n:2, markY:261.3, y:256.7, observationColX:345.3},
      {n:3, markY:238.7, y:235.3, observationColX:345.3},
      {n:4, markY:216.7, y:212.7, observationColX:345.3},
    ],
    signatures: {
      date:      {x:37.3,  y:150},
      tireur:    {x:102,   y:133.3, w:144.7, h:38.7},
      formateur: {x:258.7, y:130.7, w:137.3, h:30.7},
      autorite:  {x:0,     y:0,     w:90,    h:40}, // à calibrer
      mtcNom:    {x:258.7, y:147.3},
    },
  },

  'test-tir-fa': {
    rotate: 90,
    header: {
      nomTireur: {x:234,   y:524.6},
      unite:     {x:667.3, y:524.6},
      arme:      {x:675.3, y:505.9},
      date:      {x:21.3,  y:146.6},
    },
    scoreX:          758,
    commentaireColX: 542,
    sequences: [
      {n:1, markY:451.9}, {n:2, markY:421.9}, {n:3, markY:393.9}, {n:4, markY:366.6},
      {n:5, markY:338.6}, {n:6, markY:309.9}, {n:7, markY:281.9}, {n:8, markY:254.6},
    ],
    total:        {x:747.3, y:229.9},
    resultatMark: {
      reussite: {x:542,   y:190.6},
      echec:    {x:542.7, y:177.9},
    },
    commentaires: {x:184.7, y:204.6},
    signatures: {
      tireur:    {x:112.7, y:122.6, w:121.3, h:41.3},
      formateur: {x:332,   y:122.6, w:123.3, h:42.7},
      mtcNom:    {x:327.3, y:143.9},
    },
  },

  'test-tir-pa': {
    rotate: 90,
    header: {
      nomTireur: {x:232.7, y:525.2},
      unite:     {x:664,   y:525.2},
      arme:      {x:672,   y:506.6},
      date:      {x:26,    y:219.2},
    },
    scoreX:          757.3,
    commentaireColX: 540,
    sequences: [
      {n:1, markY:456.6}, {n:2, markY:437.9}, {n:3, markY:414.6},
      {n:4, markY:391.9}, {n:5, markY:373.2}, {n:6, markY:350.6}, {n:7, markY:326.6},
    ],
    total:        {x:741.3, y:305.2},
    resultatMark: {
      reussite: {x:542,   y:267.2},
      echec:    {x:542.7, y:254.6},
    },
    commentaires: {x:188,  y:282.6},
    signatures: {
      tireur:    {x:114,   y:197.2, w:133.3, h:44},
      formateur: {x:328.7, y:195.9, w:137.3, h:46.7},
      mtcNom:    {x:333.3, y:217.2},
    },
  },
};
