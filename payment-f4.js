/*
 * F4 — regras puras de pagamento protegido.
 *
 * Não importa SDK, não chama Stripe e não executa cobrança ou transferência.
 * A integração real deverá usar estes estados somente após webhook validado no
 * backend e com a flag operacional liberada em PR próprio.
 */
"use strict";

const COMMISSION_BPS = 1500;
const AUTO_REFUND_REASONS = new Set([
  "provider_cancelled_before_service",
  "provider_no_show"
]);

function money(value, name, allowZero) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(`${name} deve ser inteiro em centavos${allowZero ? " não negativo" : " positivo"}.`);
  }
  return value;
}

function quotePayment({ serviceAmountCents, processingFeeCents }) {
  money(serviceAmountCents, "Valor do serviço");
  money(processingFeeCents, "Taxa de processamento", true);
  const commissionCents = Math.round(serviceAmountCents * COMMISSION_BPS / 10000);
  const providerTransferCents = serviceAmountCents - commissionCents;
  return Object.freeze({
    serviceAmountCents,
    processingFeeCents,
    customerTotalCents: serviceAmountCents + processingFeeCents,
    commissionCents,
    providerTransferCents,
    commissionBps: COMMISSION_BPS
  });
}

function createHeldPayment(input) {
  const amounts = quotePayment(input);
  return {
    ...amounts,
    paymentStatus: "awaiting_payment_confirmation",
    customerConfirmedCompletion: false,
    providerConfirmedCompletion: false,
    refundReason: null
  };
}

function confirmPayment(payment) {
  if (payment.paymentStatus !== "awaiting_payment_confirmation") {
    throw new Error("Somente um pagamento aguardando confirmação pode ser retido.");
  }
  return { ...payment, paymentStatus: "paid_held" };
}

function confirmCompletion(payment, role) {
  if (payment.paymentStatus !== "paid_held") {
    throw new Error("A conclusão só pode ser confirmada depois do pagamento retido.");
  }
  if (role !== "customer" && role !== "provider") {
    throw new Error("Confirmação inválida: use customer ou provider.");
  }
  const next = {
    ...payment,
    customerConfirmedCompletion: payment.customerConfirmedCompletion || role === "customer",
    providerConfirmedCompletion: payment.providerConfirmedCompletion || role === "provider"
  };
  if (next.customerConfirmedCompletion && next.providerConfirmedCompletion) {
    next.paymentStatus = "ready_for_transfer";
  }
  return next;
}

function requestTransfer(payment) {
  if (payment.paymentStatus !== "ready_for_transfer") {
    throw new Error("O repasse exige confirmação de conclusão das duas partes.");
  }
  return { ...payment, paymentStatus: "transfer_pending" };
}

function markTransferred(payment) {
  if (payment.paymentStatus !== "transfer_pending") {
    throw new Error("Transferência não está pendente.");
  }
  return { ...payment, paymentStatus: "transferred" };
}

function requestRefund(payment, reason) {
  if (!["paid_held", "ready_for_transfer"].includes(payment.paymentStatus)) {
    throw new Error("Reembolso só pode ser solicitado enquanto o valor estiver retido.");
  }
  if (typeof reason !== "string" || !reason.trim()) {
    throw new Error("Motivo de reembolso obrigatório.");
  }
  return {
    ...payment,
    paymentStatus: AUTO_REFUND_REASONS.has(reason) ? "auto_refund_pending" : "refund_review_pending",
    refundReason: reason
  };
}

module.exports = {
  COMMISSION_BPS,
  AUTO_REFUND_REASONS,
  quotePayment,
  createHeldPayment,
  confirmPayment,
  confirmCompletion,
  requestTransfer,
  markTransferred,
  requestRefund
};
