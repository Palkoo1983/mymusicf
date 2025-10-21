/* utils.js */
export function normalizeOrder(raw = {}) {
  const pick = (v) => (v == null ? "" : String(v).trim());
  return {
    email: pick(raw.email),
    style: pick(raw.style),
    vocalist: pick(raw.vocalist),
    language: pick(raw.language || "magyar"),
    brief: pick(raw.brief),
    format: pick(raw.format || "mp3").toLowerCase()
  };
}

export function detectSpecialModes(order) {
  const style = (order.style || "").toLowerCase();
  const voc   = (order.vocalist || "").toLowerCase();
  const s = (t) => style.includes(t) || voc.includes(t);

  const isChildSong = s("gyerek") || s("child");
  const isRobot     = s("robot");
  const isDuet      = s("duett") || s("duet");
  return { isChildSong, isRobot, isDuet };
}

export function pickVocalMode(vocalist, flags) {
  if (flags?.isRobot) return "robot";
  if (flags?.isDuet)  return "duet";
  const v = (vocalist || "").toLowerCase();
  if (v.includes("nő")) return "female";
  if (v.includes("ferfi") || v.includes("férfi")) return "male";
  if (v.includes("duett") || v.includes("duet")) return "duet";
  if (v.includes("robot")) return "robot";
  return "female";
}
