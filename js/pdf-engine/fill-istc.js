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

  const armesIds = resultatTireur.tir?.armesUtilisees || resultatTireur.armesUtilisees || [];
  const armeNom = armesIds
    .map(id => (seanceInfo.armesDisponibles || []).find(a => a.id === id)?.nom)
    .filter(Boolean).join(', ');

  drawText(page, tireur.nomComplet, coords.header.nomTireur, fonts.bold, 9);
  drawText(page, tireur.unite, coords.header.unite, fonts.regular, 8);
  drawText(page, armeNom, coords.header.arme, fonts.regular, 9);
  if (coords.header.date) drawText(page, istc.dateIstc || seanceInfo.dateIstc || seanceInfo.dateTir || '', coords.header.date, fonts.regular, 8);

  (coords.connaissances || []).forEach(c => {
    const ligne = (istc.lignes || []).find(l => l.n === c.n);
    if (!ligne || !ligne.couleur) return;
    // Lignes 1-3 éliminatoires : seulement vert + rouge (pas de jaune dans l'app ni le PDF).
    const colX = (c.n <= 3 ? coords.elimCouleurX : coords.connaissancesCouleurX) || coords.connaissancesCouleurX;
    const x = colX[ligne.couleur];
    if (x === undefined) return;
    drawColorMark(page, { x, y: c.markY !== undefined ? c.markY : c.y }, ligne.couleur);
    const commentaire = (istc.commentairesParLigne || {})[c.n];
    if (commentaire) drawWrappedText(page, commentaire, { x: coords.commentaireColX, y: c.y }, fonts.regular, 7, 120, 1);
  });

  (coords.catalogue || []).forEach(c => {
    const ligne = (istc.catalogueTirs || []).find(l => l.n === c.n);
    if (!ligne) return;
    if (ligne.couleur) {
      const catX = coords.catalogueCouleurX;
      const cx = catX ? catX[ligne.couleur] : c[ligne.couleur]?.x;
      const cy = c.markY !== undefined ? c.markY : (c[ligne.couleur]?.y ?? c.y);
      if (cx !== undefined) drawColorMark(page, { x: cx, y: cy }, ligne.couleur);
    }
    const obs = (istc.catalogueCommentairesParLigne || {})[c.n] || '';
    if (obs) drawWrappedText(page, obs, { x: c.observationColX, y: c.y }, fonts.regular, 7, 150, 1);
  });

  // Signatures Partie 1 — Connaissances (milieu de page)
  const connSig = istc.connaissancesSignatures;
  if (connSig && coords.connSignatures) {
    await drawSignatureImage(pdfDoc, page, connSig.tireur,    coords.connSignatures.tireur);
    await drawSignatureImage(pdfDoc, page, connSig.formateur, coords.connSignatures.formateur);
  }
  const connMtc = istc.connaissancesMTCInfo;
  if (connMtc && (connMtc.grade || connMtc.nom) && coords.connSignatures?.mtcNom) {
    const label = [connMtc.grade, connMtc.nom, connMtc.prenom].filter(Boolean).join(' ').toUpperCase();
    drawText(page, label, coords.connSignatures.mtcNom, fonts.regular, 7);
  }

  // Date tir d'instruction (Partie 2)
  if (istc.catalogueDateTir && coords.signatures.date) {
    drawText(page, istc.catalogueDateTir, coords.signatures.date, fonts.regular, 8);
  }

  // Signatures Partie 2 — Catalogue / Tir instruction (bas de page)
  const istcSig = istc.signatures || resultatTireur.signatures;
  if (istcSig) {
    await drawSignatureImage(pdfDoc, page, istcSig.tireur,    coords.signatures.tireur);
    await drawSignatureImage(pdfDoc, page, istcSig.formateur, coords.signatures.formateur);
  }
  const istcMtc = istc.istcSignatureMTCInfo;
  if (istcMtc && (istcMtc.grade || istcMtc.nom) && coords.signatures.mtcNom) {
    const label = [istcMtc.grade, istcMtc.nom, istcMtc.prenom].filter(Boolean).join(' ').toUpperCase();
    drawText(page, label, coords.signatures.mtcNom, fonts.regular, 7);
  }

  return pdfDoc.save();
}
