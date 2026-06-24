/* fill-test-tir.js — remplissage des PDF Test tir FA/PA par overlay pdf-lib.
   /Rotate 90 (CW) sur ces 2 gabarits : on pousse une CTM [0 1 -1 0 W 0] avant tout dessin
   pour que le repère de travail soit l'espace paysage du viewer. Toutes les coordonnées de
   coords.js pour test-tir-fa/pa sont donc en espace PAYSAGE (x: 0→842, y: 0→595). */

async function fillTestTirPdf(resultatTireur, tireur, seanceInfo) {
  const tt = resultatTireur.tir || resultatTireur.testTir; // compat v1
  if (!tt || !tt.template) return null;

  const coords = PDF_COORDS[tt.template];
  if (!coords) throw new Error('Coordonnées inconnues pour le template ' + tt.template);

  const bytes = await loadTemplateBytes(tt.template);
  const pdfDoc = await PDFDocument.load(bytes);
  const page = pdfDoc.getPage(0);
  const fonts = await embedHelvetica(pdfDoc);

  // Pour /Rotate 90 (CW) : pousser CTM qui mappe espace paysage → flux brut.
  // Formule : x_brut = W - y_paysage, y_brut = x_paysage → CTM [0 1 -1 0 W 0].
  // Après ce push, tous les draw* utilisent des coords paysage et le texte apparaît horizontal.
  const { pushGraphicsState, popGraphicsState, concatTransformationMatrix } = PDFLib;
  const useRotCTM = (coords.rotate === 90);
  if (useRotCTM) {
    const W = page.getSize().width; // 595.22 (largeur brute MediaBox)
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(0, 1, -1, 0, W, 0)
    );
  }

  const armesIds = tt.armesUtilisees || resultatTireur.armesUtilisees || [];
  const armeNom = armesIds
    .map(id => (seanceInfo.armesDisponibles || []).find(a => a.id === id)?.nom)
    .filter(Boolean).join(', ');

  drawText(page, tireur.nomComplet, coords.header.nomTireur, fonts.bold, 9);
  drawText(page, tireur.unite, coords.header.unite, fonts.regular, 8);
  drawText(page, armeNom, coords.header.arme, fonts.regular, 9);
  if (coords.header.date) drawText(page, tt.dateTir || seanceInfo.dateTir || '', coords.header.date, fonts.regular, 8);

  (coords.sequences || []).forEach(c => {
    const seq = (tt.sequences || []).find(s => s.n === c.n);
    if (!seq) return;
    const sx = coords.scoreX !== undefined ? coords.scoreX : c.x;
    const sy = c.markY !== undefined ? c.markY : c.y;
    drawText(page, String(seq.score), { x: sx, y: sy }, fonts.bold, 10);
    const comm = (tt.commentairesParSequence || {})[c.n];
    if (comm && coords.commentaireColX && sy) {
      drawWrappedText(page, comm, { x: coords.commentaireColX, y: sy }, fonts.regular, 7, 200, 1);
    }
  });

  drawText(page, String(tt.totalScore), coords.total, fonts.bold, 11);

  const markCoord = tt.resultatFinal === 'REUSSITE' ? coords.resultatMark.reussite : coords.resultatMark.echec;
  drawText(page, 'X', markCoord, fonts.bold, 14);

  // Commentaires : par séquence (v3) ou commentaire global (v2 compat)
  const commSeq = tt.commentairesParSequence || {};
  const commSeqTexte = Object.keys(commSeq).length
    ? Object.entries(commSeq).filter(([,v])=>v).map(([n,v])=>`Séq ${n} : ${v}`).join(' / ')
    : '';
  const commFinal = tt.noSafe ? 'NO SAFE' : (tt.commentaires || '');
  if (commFinal && coords.commentaires) {
    drawWrappedText(page, commFinal, coords.commentaires, fonts.bold, 8, 200, 3);
  }

  const tirSig = tt.signatures || resultatTireur.signatures;
  if (tirSig) {
    await drawSignatureImage(pdfDoc, page, tirSig.tireur,    coords.signatures.tireur);
    await drawSignatureImage(pdfDoc, page, tirSig.formateur, coords.signatures.formateur);
  }
  const tirMtc = tt.tirSignatureMTCInfo;
  if (tirMtc && (tirMtc.grade || tirMtc.nom) && coords.signatures.mtcNom) {
    const label = [tirMtc.grade, tirMtc.nom, tirMtc.prenom].filter(Boolean).join(' ').toUpperCase();
    drawText(page, label, coords.signatures.mtcNom, fonts.regular, 7);
  }

  if (useRotCTM) {
    page.pushOperators(popGraphicsState());
  }

  return pdfDoc.save();
}
