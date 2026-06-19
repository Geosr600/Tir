/* fill-istc.js — remplissage des PDF ISTC FA/PA par overlay pdf-lib.
   Ne modifie jamais la mise en page d'origine : uniquement des drawText/drawColorMark/
   drawSignatureImage par-dessus le PDF existant. */

async function fillIstcPdf(resultatTireur, tireur, seanceInfo) {
  const istc = resultatTireur.istc;
  if (!istc || !istc.template) return null;

  const coords = PDF_COORDS[istc.template];
  if (!coords) throw new Error('Coordonnées inconnues pour le template ' + istc.template);

  const bytes = await loadTemplateBytes(istc.template);
  const pdfDoc = await PDFDocument.load(bytes);
  const page = pdfDoc.getPage(0);
  const fonts = await embedHelvetica(pdfDoc);

  const armeNom = (resultatTireur.armesUtilisees || [])
    .map(id => (seanceInfo.armesDisponibles || []).find(a => a.id === id)?.nom)
    .filter(Boolean).join(', ');

  drawText(page, tireur.nomComplet, coords.header.nomTireur, fonts.bold, 9);
  drawText(page, tireur.unite, coords.header.unite, fonts.regular, 8);
  drawText(page, armeNom, coords.header.arme, fonts.regular, 9);

  (coords.connaissances || []).forEach(c => {
    const ligne = (istc.lignes || []).find(l => l.n === c.n);
    if (!ligne || !ligne.couleur) return;
    const x = coords.connaissancesCouleurX[ligne.couleur];
    drawColorMark(page, { x, y: c.y }, ligne.couleur);
    const commentaire = (istc.commentairesParLigne || {})[c.n];
    if (commentaire) drawWrappedText(page, commentaire, { x: coords.commentaireColX, y: c.y }, fonts.regular, 7, 120, 1);
  });

  (coords.catalogue || []).forEach(c => {
    const ligne = (istc.catalogueTirs || []).find(l => l.n === c.n);
    if (!ligne) return;
    if (ligne.couleur && c[ligne.couleur]) drawColorMark(page, c[ligne.couleur], ligne.couleur);
    if (ligne.noSafe) drawNoSafeMark(page, { x: coords.noSafeColGlobalX, y: c.y });
    if (ligne.observation) drawWrappedText(page, ligne.observation, { x: c.observationColX, y: c.y }, fonts.regular, 7, 150, 1);
  });

  const istcSig = resultatTireur.istc?.signatures || resultatTireur.signatures;
  if (istcSig) {
    await drawSignatureImage(pdfDoc, page, istcSig.tireur, coords.signatures.tireur);
    await drawSignatureImage(pdfDoc, page, istcSig.formateur, coords.signatures.formateur);
    drawText(page, istcSig.dateSignature || seanceInfo.dateIstc || seanceInfo.dateTir, coords.signatures.date, fonts.regular, 8);
  }

  return pdfDoc.save();
}
