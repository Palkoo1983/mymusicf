import { google } from "googleapis";

const SERVICE_EMAIL  = process.env.GOOGLE_SERVICE_EMAIL;
const PRIVATE_KEY_RAW= process.env.GOOGLE_PRIVATE_KEY || "";
const SHEET_ID       = process.env.GOOGLE_SHEET_ID;

function getAuth(){
  const key = PRIVATE_KEY_RAW.replace(/\\n/g,"\n");
  return new google.auth.JWT(
    SERVICE_EMAIL,null,key,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
}
function sheets(){ return google.sheets({version:"v4",auth:getAuth()}); }

// ——— Magyar idő (Europe/Budapest)
function getBudapestNow(){
  const tz="Europe/Budapest";
  const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:tz,
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
  const p=Object.fromEntries(fmt.formatToParts(new Date()).map(v=>[v.type,v.value]));
  const ymd=`${p.year}-${p.month}-${p.day}`;
  // csak kozmetika, a Sheetnek mindegy
  const off = new Intl.DateTimeFormat("en",{ timeZone:tz, timeZoneName:"shortOffset", hour:"2-digit" })
    .formatToParts(new Date()).find(x=>x.type==="timeZoneName")?.value?.replace("GMT","+") || "+00:00";
  const iso = `${ymd}T${p.hour}:${p.minute}:${p.second}${off.includes(":")?off:(off.length===2?off+"0:00":off)}`;
  return { ymd, iso };
}

// ——— Fejléc
const HEADER=[
  "Időpont","E-mail","Stílus(ok)","Ének","Nyelv",
  "Brief","Dalszöveg","Link #1","Link #2","Formátum"
];

// ——— Napi sheet biztosítása (új lapnál fejléc + CF)
async function ensureDailySheet(title){
  const gs=sheets();
  const meta=(await gs.spreadsheets.get({ spreadsheetId:SHEET_ID })).data;
  const existing=meta.sheets?.find(s=>s.properties?.title===title);
  if (existing) return existing.properties.sheetId;

  const add=await gs.spreadsheets.batchUpdate({
    spreadsheetId:SHEET_ID,
    requestBody:{ requests:[{ addSheet:{ properties:{ title } } }] }
  });
  const sheetId=add.data.replies?.[0]?.addSheet?.properties?.sheetId;

  // Fejléc kiírás
  try{
    await gs.spreadsheets.values.update({
      spreadsheetId:SHEET_ID,
      range:`${title}!A1:J1`,
      valueInputOption:"RAW",
      requestBody:{ values:[HEADER] }
    });
  }catch(e){ console.warn("[SHEET header warn]", e?.message||e); }

  // Feltételes formázás: A2:J, =$J2 in [mp4|wav] → sárga
  try{
    await gs.spreadsheets.batchUpdate({
      spreadsheetId:SHEET_ID,
      requestBody:{ requests:[{
        addConditionalFormatRule:{
          rule:{
            ranges:[{ sheetId, startRowIndex:1, startColumnIndex:0, endColumnIndex:10 }], // A2:J
            booleanRule:{
              condition:{ type:"CUSTOM_FORMULA",
                values:[{ userEnteredValue:'=OR($J2="mp4",$J2="wav")' }] },
              format:{ backgroundColor:{ red:1, green:1, blue:0.6 } }
            }
          },
          index:0
        }
      }] }
    });
  }catch(e){ console.warn("[SHEET CF warn]", e?.message||e); }

  return sheetId;
}

// ——— Fejléc pótlása, ha a lap már létezik, de üres az A1:J1
async function ensureHeaderExists(title){
  const gs=sheets();
  try{
    const r=await gs.spreadsheets.values.get({
      spreadsheetId:SHEET_ID,
      range:`${title}!A1:J1`
    });
    const row=r.data.values?.[0]||[];
    const hasAny=row.some(v=>(v||"").toString().trim()!=="");
    if (!hasAny){
      await gs.spreadsheets.values.update({
        spreadsheetId:SHEET_ID,
        range:`${title}!A1:J1`,
        valueInputOption:"RAW",
        requestBody:{ values:[HEADER] }
      });
    }
  }catch(e){
    try{
      await gs.spreadsheets.values.update({
        spreadsheetId:SHEET_ID,
        range:`${title}!A1:J1`,
        valueInputOption:"RAW",
        requestBody:{ values:[HEADER] }
      });
    }catch(e2){ console.warn("[SHEET header ensure warn]", e2?.message||e2); }
  }
}

// ——— Fő függvény: mindig A1-ből induló append (A–J)
export async function safeAppendOrderRow(order={}){
  try{
    const gs=sheets();
    const { ymd, iso } = getBudapestNow();
    const title=ymd;

    await ensureDailySheet(title);
    await ensureHeaderExists(title);

    const {
      email="", styles="", vocal="", language="hu",
      brief="", lyrics="", link1="", link2="", format=""
    } = order;

    const values=[[ iso, email, styles, vocal, language, brief, lyrics, link1, link2, (format||"").toLowerCase() ]];

    await gs.spreadsheets.values.append({
      spreadsheetId:SHEET_ID,
      range:`${title}!A1`,           // <— KULCS: A1 alapú append → A-tól ír
      valueInputOption:"USER_ENTERED",
      insertDataOption:"INSERT_ROWS",
      requestBody:{ values, majorDimension:"ROWS" }
    });

    console.log("[SHEET OK]", title, email);
  }catch(e){
    console.error("[SHEET ERR]", e?.message||e);
  }
}

// visszafelé kompatibilitás
export async function appendOrderRow(o={}){ return safeAppendOrderRow(o); }
