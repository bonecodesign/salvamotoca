"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COMMISSION_BPS, quotePayment, createHeldPayment, confirmPayment,
  confirmCompletion, requestTransfer, markTransferred, requestRefund
} = require("../payment-f4.js");

test("F4 calcula comissão, taxa transparente e repasse sem cobrar", () => {
  const quote = quotePayment({ serviceAmountCents: 12000, processingFeeCents: 640 });
  assert.equal(COMMISSION_BPS, 1500);
  assert.deepEqual(quote, {
    serviceAmountCents: 12000, processingFeeCents: 640, customerTotalCents: 12640,
    commissionCents: 1800, providerTransferCents: 10200, commissionBps: 1500
  });
});

test("F4 exige pagamento confirmado e confirmação das duas partes antes do repasse", () => {
  let payment = createHeldPayment({ serviceAmountCents: 10000, processingFeeCents: 500 });
  assert.throws(() => confirmCompletion(payment, "customer"), /pagamento retido/);
  payment = confirmPayment(payment);
  payment = confirmCompletion(payment, "customer");
  assert.equal(payment.paymentStatus, "paid_held");
  assert.throws(() => requestTransfer(payment), /duas partes/);
  payment = confirmCompletion(payment, "provider");
  assert.equal(payment.paymentStatus, "ready_for_transfer");
  payment = requestTransfer(payment);
  assert.equal(markTransferred(payment).paymentStatus, "transferred");
});

test("F4 distingue reembolso automático de divergência sob revisão", () => {
  const held = confirmPayment(createHeldPayment({ serviceAmountCents: 10000, processingFeeCents: 0 }));
  assert.equal(requestRefund(held, "provider_no_show").paymentStatus, "auto_refund_pending");
  assert.equal(requestRefund(held, "service_divergence").paymentStatus, "refund_review_pending");
});

test("F4 recusa valores inválidos e reembolso após repasse", () => {
  assert.throws(() => quotePayment({ serviceAmountCents: 0, processingFeeCents: 0 }), /positivo/);
  assert.throws(() => quotePayment({ serviceAmountCents: 100, processingFeeCents: -1 }), /não negativo/);
  const transferred = markTransferred(requestTransfer(confirmCompletion(confirmCompletion(
    confirmPayment(createHeldPayment({ serviceAmountCents: 10000, processingFeeCents: 0 })), "customer"
  ), "provider")));
  assert.throws(() => requestRefund(transferred, "provider_no_show"), /valor estiver retido/);
});
