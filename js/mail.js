/* mail.js — préparation du mail de résultats de séance.
   Stratégie :
   1. Si navigator.canShare({files}) est disponible (Android Chrome, iOS Safari ≥ 16.4)
      et que la taille du ZIP est raisonnable (< 20 Mo) → navigator.share() avec fichiers.
   2. Sinon → ouverture d'un brouillon mailto: avec le résumé dans le corps + téléchargement
      automatique du ZIP (l'utilisateur le joindra manuellement).
   Note : un mailto: ne peut jamais porter de pièces jointes — c'est une limite absolue des
   navigateurs, non contournable. */

const SHARE_SIZE_MAX = 20 * 1024 * 1024; // 20 Mo

function _buildResumeMail(seance, resultats) {
  const ligne = (label, val) => `${label} : ${val || '—'}`;

  const presents = (resultats || []).filter(r => r.present);
  const absents  = (resultats || []).filter(r => !r.present);

  const lignesResultats = presents.map(r => {
    const istcRes  = r.istc?.resultatFinal  || '—';
    const tirRes   = r.tir?.resultatFinal || '—';
    const score    = r.tir ? `${r.tir.totalScore}/${r.tir.totalMax}` : '—';
    return `  • ${r.nomComplet} — ISTC : ${istcRes} | Tir : ${tirRes} (${score})`;
  });

  const corps = [
    `RÉSULTATS DE SÉANCE DE TIR`,
    ``,
    ligne('Date', seance.dateTir),
    ligne('Lieu', seance.lieuLib || seance.lieu),
    ligne('Arme', seance.typeArmeLib || seance.typeArme),
    ligne('Unité', seance.unite),
    ``,
    `RÉSULTATS (${presents.length} tireur(s) présent(s)) :`,
    ...lignesResultats,
    absents.length ? `\nAbsents (${absents.length}) : ${absents.map(r => r.nomComplet).join(', ')}` : '',
    ``,
    `Le fichier résultat_seance.json est disponible pour réimport dans l\'application principale.`,
    `Les PDF individuels sont dans le ZIP joint.`,
  ].filter(l => l !== undefined).join('\n');

  return corps;
}

function _buildDestinataires(seance) {
  const encadrement = seance.encadrement || [];
  const emails = encadrement
    .map(e => e.email)
    .filter(Boolean)
    .join(',');
  return emails;
}

async function preparerMail() {
  if (!_dernierExportBlobs) {
    alert('Générez d\'abord les PDF et le JSON (bouton "Générer PDF + JSON").');
    return;
  }

  const { zipBlob, jsonBlob, jsonFileName, zipFileName, seance, resultats } = _dernierExportBlobs;
  const corps = _buildResumeMail(seance, resultats);
  const sujet = `Résultats séance de tir — ${seance.dateTir || ''} — ${seance.lieuLib || seance.lieu || ''}`;
  const destinataires = _buildDestinataires(seance);

  // Tentative Web Share API avec fichiers
  const zipFile  = new File([zipBlob], zipFileName,  { type: 'application/zip' });
  const jsonFile = new File([jsonBlob], jsonFileName, { type: 'application/json' });

  const peutPartagerFichiers =
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [zipFile] }) &&
    zipBlob.size < SHARE_SIZE_MAX;

  if (peutPartagerFichiers) {
    try {
      await navigator.share({
        title:  sujet,
        text:   corps,
        files:  [zipFile, jsonFile],
      });
      return; // succès → fini
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn('navigator.share a échoué, fallback mailto:', e);
        // tombe dans le fallback ci-dessous
      } else {
        return; // l'utilisateur a annulé le partage
      }
    }
  }

  // Fallback : mailto: + téléchargement ZIP
  const sujetEncode = encodeURIComponent(sujet);
  const corpsEncode = encodeURIComponent(
    corps + '\n\n[Joindre manuellement le fichier ' + zipFileName + ' téléchargé]'
  );
  const mailto = `mailto:${destinataires}?subject=${sujetEncode}&body=${corpsEncode}`;

  // Télécharger le ZIP si pas déjà fait (l'utilisateur doit le joindre manuellement)
  if (zipBlob) {
    const url = URL.createObjectURL(zipBlob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = zipFileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }

  // Ouvrir le brouillon mail
  window.location.href = mailto;
}
