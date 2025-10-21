/* notifier.js – admin értesítések */
import fetch from "node-fetch";

const RESEND_ONLY = String(process.env.RESEND_ONLY || "true").toLowerCase() === "true";
const RESEND_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM  = process.env.MAIL_FROM || "no-reply@enzenem.hu";
const NOTIFY_TO  = process.env.NOTIFY_TO || "paulsdiamond@gmail.com";

export async function sendAdminNotice(subject, text) {
  if (!RESEND_ONLY || !RESEND_KEY) {
    console.warn("[ADMIN NOTICE]", subject, text);
    return;
  }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: MAIL_FROM, to: [NOTIFY_TO], subject, text })
    });
  } catch (e) {
    console.warn("Resend error:", e);
  }
}
