/**
 * Scoring Module - Cálculo automático de pontuação de potencial comercial
 * Escala: 0 a 100 pontos
 * Classificação: 0-39 Baixo | 40-69 Médio | 70-100 Alto
 */
const Scoring = {
  /**
   * Calcula o score de potencial comercial de um cliente
   * @param {Object} client - Dados do cliente
   * @returns {{ score: number, classification: string, details: string[] }}
   */
  calculate(client) {
    let score = 0;
    const details = [];

    // 1. Localização: Centro aumenta pontuação (+15)
    if (client.locationType === 'Centro') {
      score += 15;
      details.push('+15 - Ponto no centro comercial');
    } else if (client.locationType === 'Bairro') {
      score += 8;
      details.push('+8 - Ponto em bairro');
    } else if (client.locationType === 'Zona rural') {
      score += 0;
      details.push('+0 - Zona rural (menor potencial)');
    }

    // 2. Pavimentação: Asfaltada ou Calçada aumenta pontuação
    if (client.pavementType === 'Asfaltada') {
      score += 10;
      details.push('+10 - Rua asfaltada (boa logística)');
    } else if (client.pavementType === 'Calçada') {
      score += 8;
      details.push('+8 - Rua calçada');
    } else if (client.pavementType === 'Estrada de chão') {
      score -= 5;
      details.push('-5 - Estrada de chão (dificulta logística)');
    }

    // 3. Estratégia de marca
    if (client.dualBrandPreference === 'Vai tirar concorrente para colocar Amaretto') {
      score += 20;
      details.push('+20 - Vai trocar concorrente pela Amaretto (exclusividade)');
    } else if (client.dualBrandPreference === 'Vai trabalhar com ambas as marcas') {
      score += 12;
      details.push('+12 - Vai trabalhar com ambas as marcas');
    }

    // 4. Experiência com sorvete/picolé
    const iceExp = (client.iceCreamExperience || '').toLowerCase();
    if (iceExp.startsWith('sim') || iceExp.includes('trabalha')) {
      score += 10;
      details.push('+10 - Já trabalha com sorvete/picolé (mercado conhecido)');
    }

    // 5. Média prevista mensal
    const avg = parseFloat(client.predictedAverage) || 0;
    if (avg >= 5000) {
      score += 15;
      details.push(`+15 - Média prevista alta (R$ ${avg.toFixed(2)})`);
    } else if (avg >= 2000) {
      score += 10;
      details.push(`+10 - Média prevista média (R$ ${avg.toFixed(2)})`);
    } else if (avg >= 500) {
      score += 5;
      details.push(`+5 - Média prevista baixa (R$ ${avg.toFixed(2)})`);
    }

    // 6. Valor da primeira compra
    const firstOrder = parseFloat(client.firstOrderValue) || 0;
    if (firstOrder >= 3000) {
      score += 15;
      details.push(`+15 - Primeira compra alta (R$ ${firstOrder.toFixed(2)})`);
    } else if (firstOrder >= 1000) {
      score += 8;
      details.push(`+8 - Primeira compra razoável (R$ ${firstOrder.toFixed(2)})`);
    } else if (firstOrder >= 300) {
      score += 3;
      details.push(`+3 - Primeira compra modesta (R$ ${firstOrder.toFixed(2)})`);
    }

    // 7. Concorrência próxima (atenção/risco)
    const competitor = (client.nearbyCompetitor || '').toLowerCase();
    if (competitor.startsWith('sim') || competitor.includes('sim,')) {
      score -= 5;
      details.push('-5 - Concorrência próxima detectada');
    } else {
      score += 5;
      details.push('+5 - Sem concorrência próxima');
    }

    // Garantir que o score fique entre 0 e 100
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Classificação
    let classification = 'Baixo potencial';
    if (score >= 70) {
      classification = 'Alto potencial';
    } else if (score >= 40) {
      classification = 'Médio potencial';
    }

    return { score, classification, details };
  }
};

window.Scoring = Scoring;
