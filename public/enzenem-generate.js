/* src/enzenem-generate.js – OpenAI lyrics */
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL  = process.env.OPENAI_MODEL || "gpt-4.1-mini";

export async function generateLyrics({ brief, language="magyar", isChildSong=false, mustDuet=false }) {
  const sys = `Te magyar dalszövegíró vagy. 3 vers + 2 refrén. Tartsd a megadott nyelvet. Ne használj értelmetlen szavakat.`;
  const user = `
Cél: ünnepi családi dal Palihoz és Dórihoz.
Nyelv: ${language}.
Hangulat: vegyes – lírai és táncolós.
Szerkezet: Verse 1 / Chorus / Verse 2 / Chorus / Bridge / Final Chorus.
Követelmények:
- Mindig magyar nyelv.
- Konkrét, hétköznapi képek (töltött káposzta, októberi hangulat, pálinka).
- ${isChildSong ? "Gyerekdal mód: egyszerű szókincs, 3–6 szavas sorok, játékos ismétlés." : "Normál pop-nyelv."}
- ${mustDuet ? "Duett: refrénben két hang (Pali és Dóri), felváltva/együtt." : "Szóló is jó."}

Brief:
${brief}
  `.trim();

  const resp = await client.responses.create({
    model: MODEL,
    input: [{ role: "system", content: sys }, { role: "user", content: user }]
  });

  const out = resp.output_text || "";
  if (!out) throw new Error("EMPTY_LYRICS");
  return out;
}
