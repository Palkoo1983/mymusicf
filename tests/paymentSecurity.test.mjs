import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  computeOrderTotal,
  normalizeOrderForPayment,
  responseJsonPreservingOrderCode,
  validateVivaTransaction
} from '../paymentSecurity.js';

const validOrder = {
  email: 'vevo@example.hu',
  styles: 'pop-rock',
  vocal: 'male',
  language: 'magyar',
  brief: 'Ez egy kellően részletes, személyes dalszövegleírás, amely biztosan hosszabb százhúsz karakternél, és minden fontos emléket tartalmaz.',
  consent: true,
  package: 'basic',
  delivery_extra: '0'
};

const transactionId = 'cb21a7f5-8828-48f6-be1e-d228afb26aa6';
const orderCode = '9827007426346074';

test('a szerver a rögzített csomag- és kézbesítési árakból számol', () => {
  const expected = {
    basic: [10500, 13500, 17000],
    video: [21000, 24000, 27500],
    premium: [35000, 38000, 41500]
  };
  const deliveries = ['0', '3000', '6500'];

  for (const [packageName, totals] of Object.entries(expected)) {
    deliveries.forEach((deliveryExtra, index) => {
      assert.equal(computeOrderTotal({ package: packageName, delivery_extra: deliveryExtra }), totals[index]);
    });
  }
});

test('a manipulált vagy ismeretlen árparaméter elutasításra kerül', () => {
  assert.throws(
    () => normalizeOrderForPayment({ ...validOrder, delivery_extra: '-10000' }),
    /Érvénytelen kézbesítési opció/
  );
  assert.throws(
    () => normalizeOrderForPayment({ ...validOrder, delivery_extra: '1' }),
    /Érvénytelen kézbesítési opció/
  );
  assert.throws(
    () => normalizeOrderForPayment({ ...validOrder, package: 'vip' }),
    /Érvénytelen csomag/
  );
});

test('a kötelező rendelési adatok szerveroldalon is ellenőrzöttek', () => {
  assert.throws(() => normalizeOrderForPayment({ ...validOrder, brief: 'rövid' }), /120 és 4000/);
  assert.throws(() => normalizeOrderForPayment({ ...validOrder, consent: false }), /hozzájárulás/);
  assert.throws(() => normalizeOrderForPayment({ ...validOrder, email: 'hibás' }), /e-mail/);

  const normalized = normalizeOrderForPayment({
    ...validOrder,
    package: 'VIDEO',
    delivery_extra: '3000',
    delivery_label: 'hamis címke'
  });
  assert.equal(normalized.package, 'video');
  assert.equal(normalized.delivery_label, '24 óra (+3 000 Ft)');
  assert.equal(computeOrderTotal(normalized), 24000);
});

test('a 16 számjegyű Viva orderCode szövegként, pontosságvesztés nélkül marad meg', async () => {
  const response = new Response(`{"orderCode":${orderCode}}`, {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
  const parsed = await responseJsonPreservingOrderCode(response);
  assert.equal(parsed.orderCode, orderCode);
  assert.equal(typeof parsed.orderCode, 'string');
});

test('csak a teljesen egyező, befejezett HUF-tranzakció fogadható el', () => {
  // A Viva Retrieve Transaction válasza nem tartalmaz transactionId mezőt:
  // az azonosító magát a lekért API-erőforrást választja ki az URL-ben.
  const transaction = {
    orderCode,
    statusId: 'F',
    amount: 10500,
    currencyCode: 348
  };

  assert.equal(
    validateVivaTransaction(transaction, { transactionId, orderCode, expectedAmount: 10500 }).ok,
    true
  );
  assert.equal(
    validateVivaTransaction({ ...transaction, statusId: 'A' }, { transactionId, orderCode, expectedAmount: 10500 }).reason,
    'transaction_status_A'
  );
  assert.equal(
    validateVivaTransaction({ ...transaction, amount: 500 }, { transactionId, orderCode, expectedAmount: 10500 }).reason,
    'amount_mismatch'
  );
  assert.equal(
    validateVivaTransaction({ ...transaction, orderCode: '1127872549911101' }, { transactionId, orderCode, expectedAmount: 10500 }).reason,
    'order_code_mismatch'
  );
  assert.equal(
    validateVivaTransaction({ ...transaction, currencyCode: 978 }, { transactionId, orderCode, expectedAmount: 10500 }).reason,
    'currency_mismatch'
  );
  assert.equal(
    validateVivaTransaction(transaction, { transactionId: 'not-a-uuid', orderCode, expectedAmount: 10500 }).reason,
    'invalid_transaction_id'
  );
});

test('a szerverben a generálás belső kulccsal védett és a tesztlevél-végpont megszűnt', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const generateRoute = source.indexOf("app.post('/api/generate_song'");
  const generateGuard = source.indexOf("constantTimeTokenMatch(req.get('X-Enzenem-Internal')", generateRoute);
  const successRoute = source.indexOf('app.get("/api/payment/success"');
  const verifyCall = source.indexOf('verifyVivaPayment({ transactionId, orderCode, expectedAmount })', successRoute);
  const fulfillmentCall = source.indexOf('postJsonWithTimeout(apiUrl, o', successRoute);

  assert.ok(generateRoute > -1 && generateGuard > generateRoute);
  assert.equal(source.includes("app.get('/api/test-mail'"), false);
  assert.ok(successRoute > -1 && verifyCall > successRoute && fulfillmentCall > verifyCall);
});
