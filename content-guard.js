// content-guard.js
// Univerzális védőréteg a dalszöveg-generáláshoz (lexikon + tiltólista + szanitizálás)

const HUNGARIAN_STOPWORDS = new Set([
  "és","vagy","hogy","ami","mert","mint","de","ha","is","meg","az","a","egy",
  "vagyis","ám","ámde","egyben","hiszen","ugyan","szóval","valamint","illetve",
  "én","te","ő","mi","ti","ők","énnekem","tőled","neki","nekem","velem","vele"
]);

// Globális tiltólista – ezek SOHA ne szivárogjanak be, kivéve ha a brief tényleg kéri (lásd lent)
const FORBIDDEN_GLOBAL = [
  "céges","ceges","évzáró","evzaro","corporate","company","company party",
  "tempó","tempo","dob","dobok","ritmus","drum","drums"
];

// ---------- Lexikonépítés ----------
function buildAllowedLexicon({ brief, style, vocals, language, names = [] }) {
  const raw = [brief, style, vocals, language, ...(names || [])]
    .filter(Boolean).join(" ").toLowerCase();

  const tokens = raw
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s\-]/gu, " ")
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !HUNGARIAN_STOPWORDS.has(t));

  return Array.from(new Set(tokens.filter(Boolean)));
}

function buildForbiddenLexicon(extraForbidden = [], allowedLexicon = []) {
  const base = new Set([
    ...FORBIDDEN_GLOBAL,
    ...(extraForbidden || []).map(s => s.toLowerCase())
  ]);

  // Ha a briefben tényleg szerepel egy korábban tiltott szó, engedjük (eltávolítjuk a tiltólistáról)
  allowedLexicon.forEach(w => base.delete(String(w).toLowerCase()));

  return Array.from(base);
}

// ---------- Szanitizálás ----------
function sanitizeLyricsText(lyrics, forbiddenList) {
  let out = String(lyrics || "");
  forbiddenList.forEach(word => {
    const re = new RegExp(`\\b${escapeRegex(word)}\\b`, "gi");
    out = out.replace(re, "");
  });

  // Hézagok normalizálása
  out = out.replace(/[ \t]{2,}/g, " ")
           .replace(/\n{3,}/g, "\n\n")
           .trim();
  return out;
}

function containsForbidden(text, forbidden) {
  const lc = String(text || "").toLowerCase();
  return forbidden.some(w =>
    new RegExp(`\\b${escapeRegex(w)}\\b`, "i").test(lc)
  );
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  buildAllowedLexicon,
  buildForbiddenLexicon,
  sanitizeLyricsText,
  containsForbidden
};
