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

// ====== Magyar idő (Europe/Budapest)
function getBudapestNow(){
  const tz="Europe/Budapest";
  const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:tz,
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
  const p=Object.fromEntries(fmt.formatToParts(new Date()).map(v=>[v.type,v.value]));
  const ymd=`${p.year}-${p.month}-${p.day}`;
  return {ymd, iso:`${ymd}T${p.hour}:${p.minute}:${p.second}+02:00`};
}

// ====== fejléc-sor (rögzített)
const HEADER=[
  "Időpont","E-mail","Stílus(ok)","Ének","Nyelv",
  "Brief","Dalszöveg","Link #1","Link #2","Formátum"
];

// ====== napi sheet biztosítása
async function ensureDailySheet(title){
  const gs=sheets();
  const meta=await gs.spreadsheets.get({spreadsheetId:SHEET_ID});
  const exists=meta.data.sheets?.find(s=>s.properties?.title===title);
  if(exists) return exists.properties.sheetId;

  const add=await gs.spreadsheets.batchUpdate({
    spreadsheetId:SHEET_ID,
    requestBody:{requests:[{addSheet:{properties:{title}}}]}
  });
  const sheetId=add.data.replies?.[0]?.addSheet?.properties?.sheetId;

  // Fejléc írása + CF (sárga mp4/wav)
  try{
    await gs.spreadsheets.values.update({
      spreadsheetId:SHEET_ID,
      range:`${title}!A1:J1`,
      valueInputOption:"RAW",
      requestBody:{values:[HEADER]}
    });
    await gs.spreadsheets.batchUpdate({
      spreadsheetId:SHEET_ID,
      requestBody:{requests:[{
        addConditionalFormatRule:{
          rule:{
            ranges:[{sheetId,startRowIndex:1,endRowIndex:1000,startColumnIndex:0,endColumnIndex:10}],
            booleanRule:{
              condition:{type:"CUSTOM_FORMULA",
                values:[{userEnteredValue:'=OR($J1="mp4",$J1="wav")'}]},
              format:{backgroundColor:{red:1,green:1,blue:0.6}}
            }
          },
          index:0
        }
      }]}
    });
  }catch(e){ console.warn("[SHEET setup warn]",e?.message||e); }
  return sheetId;
}

// ====== fő függvény
export async function safeAppendOrderRow(order={}){
  try{
    const gs=sheets();
    const {ymd,iso}=getBudapestNow();
    const sheet=ymd;
    await ensureDailySheet(sheet);

    const {email="",styles="",vocal="",language="hu",
           brief="",lyrics="",link1="",link2="",format=""}=order;

    const row=[[iso,email,styles,vocal,language,brief,lyrics,link1,link2,(format||"").toLowerCase()]];
    await gs.spreadsheets.values.append({
      spreadsheetId:SHEET_ID,
      range:`${sheet}!A:J`,
      valueInputOption:"USER_ENTERED",
      insertDataOption:"INSERT_ROWS",
      requestBody:{values:row}
    });
    console.log("[SHEET OK]",sheet,email);
  }catch(e){ console.error("[SHEET ERR]",e?.message||e); }
}

// régi kompatibilitás
export async function appendOrderRow(o={}){ return safeAppendOrderRow(o); }
