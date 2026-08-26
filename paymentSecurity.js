export const PACKAGE_PRICES = Object.freeze({
  basic: 10500,
  video: 21000,
  premium: 35000
});

export const DELIVERY_OPTIONS = Object.freeze({
  '0': { extra: 0, label: '48 óra (alap)' },
  '3000': { extra: 3000, label: '24 óra (+3 000 Ft)' },
  '6500': { extra: 6500, label: '6 óra (+6 500 Ft)' }
});

const ALLOWED_VOCALS = new Set([
  'female', 'male', 'duet', 'child', 'robot',
  'choir', 'gospel choir', 'instrumental'
]);

function booleanField(value) {
  return value === true || value === 'true' || value === '1' || value === 'on';
}

export function normalizeOrderForPayment(input = {}) {
  const packageName = String(input.package || input.format || '').trim().toLowerCase();
  if (!Object.hasOwn(PACKAGE_PRICES, packageName)) {
    throw new Error('Érvénytelen csomag.');
  }

  const deliveryKey = String(input.delivery_extra ?? '0').trim();
  const delivery = DELIVERY_OPTIONS[deliveryKey];
  if (!delivery) {
    throw new Error('Érvénytelen kézbesítési opció.');
  }

  const email = String(input.email || '').trim();
  const styles = String(input.styles || input.style || '').trim();
  const vocal = String(input.vocal || '').trim().toLowerCase();
  const language = String(input.language || '').trim();
  const brief = String(input.brief || '').trim();
  const title = String(input.title || '').trim();
  const consent = booleanField(input.consent);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (String(input._hp || '').trim()) throw new Error('Érvénytelen kérés.');
  if (!emailOk || email.length > 254) throw new Error('Érvénytelen e-mail-cím.');
  if (!styles || styles.length > 500) throw new Error('A zenei stílus megadása kötelező.');
  if (!ALLOWED_VOCALS.has(vocal)) throw new Error('Érvénytelen énektípus.');
  if (!language || language.length > 100) throw new Error('A nyelv megadása kötelező.');
  if (brief.length < 120 || brief.length > 4000) {
    throw new Error('A leírás hossza 120 és 4000 karakter között lehet.');
  }
  if (title.length > 200) throw new Error('A dal címe túl hosszú.');
  if (!consent) throw new Error('Az adatkezelési hozzájárulás kötelező.');

  return {
    ...input,
    title,
    email,
    styles,
    style: styles,
    vocal,
    language,
    brief,
    consent: true,
    package: packageName,
    delivery_extra: String(delivery.extra),
    delivery_label: delivery.label,
    invoice_company: booleanField(input.invoice_company),
    invoice_company_name: String(input.invoice_company_name || '').trim().slice(0, 200),
    invoice_vat_number: String(input.invoice_vat_number || '').trim().slice(0, 50),
    invoice_address: String(input.invoice_address || '').trim().slice(0, 300)
  };
}

/** A végösszeg kizárólag a szerver rögzített árlistájából származhat. */
export function computeOrderTotal(order = {}) {
  const packageName = String(order.package || order.format || '').trim().toLowerCase();
  const deliveryKey = String(order.delivery_extra ?? '0').trim();
  const base = PACKAGE_PRICES[packageName];
  const delivery = DELIVERY_OPTIONS[deliveryKey];

  if (!Number.isInteger(base) || !delivery) {
    throw new Error('Érvénytelen rendelési árparaméter.');
  }

  return base + delivery.extra;
}

export async function responseJsonPreservingOrderCode(response) {
  const text = await response.text();
  const json = JSON.parse(text || '{}');
  // A Viva orderCode 16 számjegyű lehet, ezért JavaScript Numberként pontatlan lehet.
  const match = text.match(/"orderCode"\s*:\s*(?:"(\d{16})"|(\d{16}))/i);
  if (match) json.orderCode = match[1] || match[2];
  return json;
}

export function validateVivaTransaction(transaction, { transactionId, orderCode, expectedAmount }) {
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(transactionId)) {
    return { ok: false, reason: 'invalid_transaction_id' };
  }
  if (!/^\d{16}$/.test(orderCode)) {
    return { ok: false, reason: 'invalid_order_code' };
  }

  const tx = transaction || {};
  const txOrderCode = String(tx.orderCode ?? tx.OrderCode ?? '').trim();
  const txId = String(tx.transactionId ?? tx.TransactionId ?? '').trim().toLowerCase();
  const statusId = String(tx.statusId ?? tx.StatusId ?? '').trim().toUpperCase();
  const amount = Number(tx.amount ?? tx.Amount);
  const currencyCode = Number(tx.currencyCode ?? tx.CurrencyCode);

  if (txOrderCode !== orderCode) return { ok: false, reason: 'order_code_mismatch' };
  if (txId !== transactionId.toLowerCase()) return { ok: false, reason: 'transaction_id_mismatch' };
  if (statusId !== 'F') return { ok: false, reason: `transaction_status_${statusId || 'missing'}` };
  if (!Number.isFinite(amount) || Math.abs(amount - expectedAmount) > 0.001) {
    return { ok: false, reason: 'amount_mismatch' };
  }
  // ISO 4217: HUF = 348. Más pénznemű tranzakciót nem teljesítünk.
  if (currencyCode !== 348) return { ok: false, reason: 'currency_mismatch' };

  return { ok: true, transaction: tx };
}
