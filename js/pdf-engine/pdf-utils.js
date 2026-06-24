/* pdf-utils.js — helpers communs de remplissage PDF par overlay (pdf-lib), réutilisés par
   fill-istc.js et fill-test-tir.js. Aucune modification de la mise en page d'origine :
   uniquement des dessins (texte/formes/image) par-dessus le PDF existant. */

const { PDFDocument, StandardFonts, rgb } = PDFLib;

// Couleurs RGB dérivées des CMYK confirmées dans les PDF sources (conversion C/M/Y/K → RGB
// standard) — rouge=faute de sécurité, jaune=erreur de gestuelle, vert=gestuelle fluide.
const COULEUR_RGB = {
  rouge: rgb(1, 0.007, 0),
  jaune: rgb(0.938, 1, 0.035),
  vert:  rgb(0.532, 1, 0.123),
};
const NOIR = rgb(0.1, 0.1, 0.18);

async function loadTemplateBytes(templateName) {
  // Données embarquées : fonctionne sans serveur (file://) et hors-ligne
  if (typeof PDF_TEMPLATE_DATA !== 'undefined' && PDF_TEMPLATE_DATA[templateName]) {
    const b64    = PDF_TEMPLATE_DATA[templateName];
    const binary = atob(b64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  // Fallback fetch (mode PWA servi par un serveur HTTP)
  const url = './assets/pdf-templates/' + templateName + '.pdf';
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error('Modèle PDF inaccessible (' + templateName + '). Vérifiez que le fichier pdf-templates-data.js est bien inclus.');
  }
  if (!res.ok) throw new Error('Modèle PDF introuvable HTTP ' + res.status + ' : ' + templateName);
  return res.arrayBuffer();
}

async function embedHelvetica(pdfDoc) {
  return {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
}

/** Texte simple, taille par défaut adaptée aux cellules de tableau étroites. */
function drawText(page, text, coord, font, size) {
  if (!text || !coord) return;
  page.drawText(String(text), { x: coord.x, y: coord.y, size: size || 9, font, color: NOIR });
}

/** Retour à la ligne manuel simple (les zones commentaires des PDF sont petites). */
function drawWrappedText(page, text, coord, font, size, maxWidth, maxLines) {
  if (!text || !coord) return;
  const sz = size || 8;
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  words.forEach(w => {
    const test = cur ? cur + ' ' + w : w;
    if (font.widthOfTextAtSize(test, sz) > (maxWidth || 140) && cur) {
      lines.push(cur); cur = w;
    } else {
      cur = test;
    }
  });
  if (cur) lines.push(cur);
  const limited = lines.slice(0, maxLines || 3);
  limited.forEach((line, i) => {
    page.drawText(line, { x: coord.x, y: coord.y - i * (sz + 2), size: sz, font, color: NOIR });
  });
}

/** Coche la case correspondant à la couleur : croix vectorielle noire (X).
    Pour les cases catalogue (w/h fournis), X centré dans la cellule.
    Pour les cases connaissances (sans w/h), X centré sur le point de coordonnée. */
function drawColorMark(page, coord, couleur) {
  if (!coord || !couleur) return;
  if (coord.w !== undefined && coord.h !== undefined) {
    const cx = coord.x + coord.w / 2;
    const cy = coord.y + coord.h / 2;
    const r  = Math.min(Math.abs(coord.w), Math.abs(coord.h)) / 2 - 3;
    page.drawLine({ start: { x: cx - r, y: cy - r }, end: { x: cx + r, y: cy + r }, thickness: 1.5, color: NOIR });
    page.drawLine({ start: { x: cx - r, y: cy + r }, end: { x: cx + r, y: cy - r }, thickness: 1.5, color: NOIR });
  } else {
    const { x, y } = coord;
    const r = 4;
    page.drawLine({ start: { x: x - r, y: y - r }, end: { x: x + r, y: y + r }, thickness: 1.5, color: NOIR });
    page.drawLine({ start: { x: x - r, y: y + r }, end: { x: x + r, y: y - r }, thickness: 1.5, color: NOIR });
  }
}

/** Croix vectorielle (pas de glyphe Unicode hors WinAnsi) pour marquer "NO SAFE". */
function drawNoSafeMark(page, coord) {
  if (!coord) return;
  const { x, y } = coord;
  const r = 5;
  page.drawLine({ start: { x: x - r, y: y - r }, end: { x: x + r, y: y + r }, thickness: 1.6, color: COULEUR_RGB.rouge });
  page.drawLine({ start: { x: x - r, y: y + r }, end: { x: x + r, y: y - r }, thickness: 1.6, color: COULEUR_RGB.rouge });
}

/** Petite flèche pleine (triangle vectoriel — ► n'existe pas en WinAnsi) pointant vers la
    ligne REUSSITE/ECHEC retenue. */
function drawResultArrow(page, coord) {
  if (!coord) return;
  const { x, y } = coord;
  const s = 5;
  page.drawSvgPath('M0,0 L0,' + (2*s) + ' L' + (s*1.6) + ',' + s + ' Z', { x, y: y - s, color: NOIR });
}

/** Image de signature (PNG dataURL issu du canvas tactile) redimensionnée dans la zone donnée. */
async function drawSignatureImage(pdfDoc, page, dataUrl, coord) {
  if (!dataUrl || !coord) return;
  try {
    const pngBytes = _dataUrlToBytes(dataUrl);
    const img = await pdfDoc.embedPng(pngBytes);
    const w = coord.w || 80, h = coord.h || 35;
    page.drawImage(img, { x: coord.x, y: coord.y, width: w, height: h });
  } catch (e) {
    console.warn('drawSignatureImage: échec embed signature', e);
  }
}

function _dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
