/* fill-test-tir.js — remplissage des PDF Test tir FA/PA par overlay pdf-lib.
   /Rotate 90 sur ces 2 gabarits : les coordonnées de coords.js sont dans l'espace du flux
   de contenu non tourné (= celui utilisé par page.drawText par défaut), ne pas transformer. */

async function fillTestTirPdf(resultatTireur, tireur, seanceInfo) {
  const tt = resultatTireur.tir || resultatTireur.testTir; // compat v1
  if (!tt || !tt.template) return null;

  const coords = PDF_COORDS[tt.template];
  if (!coords) throw new Error('Coordonnées inconnues pour le template ' + tt.template);

  const bytes = await loadTemplateBytes(tt.template);
  const pdfDoc = await PDFDocument.load(bytes);
  const page = pdfDoc.getPage(0);
  const fonts = await embedHelvetica(pdfDoc);

  const armesIds = tt.armesUtilisees || resultatTireur.armesUtilisees || [];
  const armeNom = armesIds
    .map(id => (seanceInfo.armesDisponibles || []).find(a => a.id === id)?.nom)
    .filter(Boolean).join(', ');

  drawText(page, tireur.nomComplet, coords.header.nomTireur, fonts.bold, 9);
  drawText(page, tireur.unite, coords.header.unite, fonts.regular, 8);
  drawText(page, armeNom, coords.header.arme, fonts.regular, 9);

  (coords.sequences || []).forEach(c => {
    const seq = (tt.sequences || []).find(s => s.n === c.n);
    if (!seq) return;
    drawText(page, String(seq.score), { x: c.x, y: c.y }, fonts.bold, 10);
  });

  drawText(page, String(tt.totalScore), coords.total, fonts.bold, 11);

  const markCoord = tt.resultatFinal === 'REUSSITE' ? coords.resultatMark.reussite : coords.resultatMark.echec;
  drawResultArrow(page, markCoord);

  if (tt.commentaires && coords.commentaires) {
    drawWrappedText(page, tt.commentaires, coords.commentaires, fonts.regular, 7, 150, 2);
  }

  const tirSig = tt.signatures || resultatTireur.signatures;
  if (tirSig) {
    await drawSignatureImage(pdfDoc, page, tirSig.tireur, coords.signatures.tireur);
    await drawSignatureImage(pdfDoc, page, tirSig.formateur, coords.signatures.formateur);
    drawText(page, tirSig.dateSignature || tt.dateTir || seanceInfo.dateTir, coords.signatures.date, fonts.regular, 8);
  }

  return pdfDoc.save();
}
