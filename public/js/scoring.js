/**
 * Scoring Module - Regra oficial do Score do Cliente
 * Escala: 0 a 100 pontos.
 */
const Scoring = {
  normalizeMoney(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = String(value).trim();
    if (!raw) return 0;
    const normalized = raw
      .replace(/R\$\s?/gi, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  },

  getPaymentDays(payment) {
    const p = String(payment || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!p) return null;
    if (p.includes('vista')) return 0;
    const m = p.match(/(\d{1,3})/);
    if (m) return Number(m[1]);
    if (p.includes('boleto') || p.includes('prazo')) return 28;
    return null;
  },

  classify(score) {
    if (score >= 90) return '⭐ Excelente';
    if (score >= 75) return '🟢 Muito Bom';
    if (score >= 60) return '🟡 Bom';
    if (score >= 40) return '🟠 Regular';
    return '🔴 Baixo';
  },

  calculate(client) {
    let score = 0;
    const details = [];

    const firstOrder = this.normalizeMoney(client.firstOrderValue || client.first_order_value || client.valorPrimeiroPedido);
    let valuePoints = 0;
    if (firstOrder <= 0) valuePoints = 0;
    else if (firstOrder <= 500) valuePoints = 10;
    else if (firstOrder <= 1000) valuePoints = 20;
    else if (firstOrder <= 2000) valuePoints = 35;
    else valuePoints = 50;
    score += valuePoints;
    details.push(`${valuePoints} pts - Valor do primeiro pedido`);

    const days = this.getPaymentDays(client.firstOrderPayment || client.first_order_payment || client.formaPagamento);
    let paymentPoints = 10;
    if (days === 0) paymentPoints = 30;
    else if (days !== null && days <= 14) paymentPoints = 25;
    else if (days !== null && days <= 28) paymentPoints = 20;
    else paymentPoints = 10;
    score += paymentPoints;
    details.push(`${paymentPoints} pts - Forma de pagamento`);

    const hasBonus = String(client.hasBonus || client.has_bonus || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const bonusValue = this.normalizeMoney(client.bonusValue || client.bonus_value || client.valorBonificacao);
    let bonusPercent = firstOrder > 0 ? (bonusValue / firstOrder) * 100 : 0;
    if (!hasBonus.includes('sim') || bonusValue <= 0) bonusPercent = 0;
    let bonusPoints = 20;
    if (bonusPercent === 0) bonusPoints = 20;
    else if (bonusPercent <= 5) bonusPoints = 18;
    else if (bonusPercent <= 10) bonusPoints = 15;
    else if (bonusPercent <= 15) bonusPoints = 10;
    else if (bonusPercent <= 20) bonusPoints = 5;
    else bonusPoints = 0;
    score += bonusPoints;
    details.push(`${bonusPoints} pts - Bonificação (${bonusPercent.toFixed(2)}%)`);

    score = Math.max(0, Math.min(100, Math.round(score)));
    return { score, classification: this.classify(score), details, bonusPercent };
  }
};
window.Scoring = Scoring;
