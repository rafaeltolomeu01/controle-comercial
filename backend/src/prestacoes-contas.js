'use strict';

module.exports = function installPrestacoesContas(deps) {
  const {
    app, db, normalizeRole, isAdminUser, getPermittedSellerIds,
    getUserUnitAccess, requireAllowedUnit, enrichUserWithUnits
  } = deps;

  const money = value => {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  };
  const roundMoney = value => Number(money(value).toFixed(2));
  const isIsoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  const textRole = user => normalizeRole(user && (user.profile || user.role || user.perfil) || '');
  const permissionText = user => (Array.isArray(user && user.permissions) ? user.permissions : []).map(normalizeRole);

  function canOpen(user) {
    const role = textRole(user);
    const permissions = permissionText(user).join(' | ');
    return isAdminUser(user)
      || ['vendedor', 'supervisor', 'gerente', 'financeiro', 'responsavel financeiro'].includes(role)
      || permissions.includes('despesas')
      || permissions.includes('financeiro')
      || permissions.includes('aprovacao de saldo');
  }

  function canClose(user) {
    const role = textRole(user);
    const permissions = permissionText(user).join(' | ');
    return isAdminUser(user)
      || ['financeiro', 'responsavel financeiro'].includes(role)
      || permissions.includes('financeiro')
      || permissions.includes('aprovacao de saldo')
      || permissions.includes('aprovacao de despesas');
  }

  async function assertTargetAccess(actor, targetId, unitId) {
    if (!canOpen(actor)) {
      const error = new Error('Acesso negado ao módulo de prestação de contas.');
      error.status = 403;
      throw error;
    }
    const companyId = actor.empresa_id || '001';
    const allowed = (await getPermittedSellerIds(actor, db)).map(String);
    if (!allowed.includes(String(targetId))) {
      const error = new Error('Acesso negado: usuário fora da sua cadeia de atendimento.');
      error.status = 403;
      throw error;
    }
    const target = await db('usuarios').where({ id: targetId, empresa_id: companyId }).first();
    if (!target) {
      const error = new Error('Usuário não encontrado nesta empresa.');
      error.status = 404;
      throw error;
    }
    const selectedUnit = await db('unidades').where({ id: unitId, empresa_id: companyId }).first();
    if (!selectedUnit) {
      const error = new Error('Unidade não encontrada nesta empresa.');
      error.status = 400;
      throw error;
    }
    await requireAllowedUnit(actor, selectedUnit.id);
    await requireAllowedUnit(await enrichUserWithUnits(target), selectedUnit.id);
    return { target: await enrichUserWithUnits(target), selectedUnit };
  }

  async function buildPreview(actor, input) {
    const targetId = String(input.usuario_id || input.userId || '').trim();
    const unitId = String(input.unit_id || input.unitId || '').trim();
    const periodStart = String(input.periodo_inicio || input.period_start || '').trim();
    const periodEnd = String(input.periodo_fim || input.period_end || '').trim();
    if (!targetId || !unitId || unitId === 'all' || !isIsoDate(periodStart) || !isIsoDate(periodEnd) || periodStart > periodEnd) {
      const error = new Error('Usuário, unidade e período válidos são obrigatórios.');
      error.status = 400;
      throw error;
    }

    const companyId = actor.empresa_id || '001';
    const { target, selectedUnit } = await assertTargetAccess(actor, targetId, unitId);
    const expenses = await db('despesas_reembolsos')
      .where({ empresa_id: companyId, userId: targetId, unitId: selectedUnit.id })
      .where('date', '>=', periodStart).where('date', '<=', periodEnd)
      .orderBy('date', 'asc').orderBy('time', 'asc');
    const requests = await db('despesas_solicitacoes')
      .where({ empresa_id: companyId, usuario_id: targetId, unitId: selectedUnit.id })
      .where('data_solicitacao', '>=', periodStart).where('data_solicitacao', '<=', periodEnd)
      .orderBy('data_solicitacao', 'asc').orderBy('hora_solicitacao', 'asc');

    const requestIds = requests.map(row => row.id);
    const extras = requestIds.length ? await db('despesas_itens_extras').whereIn('solicitacao_id', requestIds) : [];
    const items = requestIds.length ? await db('despesas_solicitacoes_itens').whereIn('solicitacao_id', requestIds) : [];
    const approvals = requestIds.length ? await db('despesas_aprovacoes').whereIn('solicitacao_id', requestIds) : [];

    const requestedValue = request => {
      const extraTotal = extras.filter(row => String(row.solicitacao_id) === String(request.id))
        .reduce((sum, row) => sum + money(row.valor), 0);
      return roundMoney(money(request.valor_hotel_alim) + money(request.valor_abastecimento) + extraTotal);
    };
    const approvedValue = request => {
      const requestItems = items.filter(row => String(row.solicitacao_id) === String(request.id));
      if (!requestItems.length) return normalizeRole(request.status).includes('aprov') ? requestedValue(request) : 0;
      return roundMoney(requestItems.reduce((sum, item) => {
        const status = normalizeRole(item.status || '');
        if (status.includes('reprov') || status.includes('correc') || status === 'pendente') return sum;
        return sum + money(item.valor_aprovado);
      }, 0));
    };

    const balanceEvents = requests.map(request => {
      const requestItems = items.filter(row => String(row.solicitacao_id) === String(request.id));
      const categoryText = normalizeRole(requestItems.map(row => row.categoria).join(' '));
      const direct = categoryText.includes('diretamente');
      const removal = direct && (categoryText.includes('remov') || approvedValue(request) < 0);
      const approval = approvals.filter(row => String(row.solicitacao_id) === String(request.id)).sort((a, b) => money(b.id) - money(a.id))[0];
      return {
        id: request.id,
        type: direct ? (removal ? 'saldo_retirado' : 'saldo_adicionado') : 'solicitacao_saldo',
        date: request.data_solicitacao,
        time: request.hora_solicitacao,
        requested: requestedValue(request),
        approved: approvedValue(request),
        status: request.status,
        description: request.justificativa || '',
        approval_date: approval && approval.data_aprovacao || requestItems.find(row => row.data_aprovacao)?.data_aprovacao || null,
        approval_time: approval && approval.hora_aprovacao || null,
        approver: approval && approval.gerente_id || requestItems.find(row => row.usuario_aprovador)?.usuario_aprovador || null
      };
    });

    const approvedExpenses = [];
    const unapprovedExpenses = [];
    expenses.forEach(expense => {
      const item = {
        id: expense.id,
        code: `DP-${expense.id}`,
        date: expense.date,
        time: expense.time,
        purpose: expense.finalidade || '',
        operation: expense.operacao || '',
        description: expense.descreva || expense.observation || '',
        value: roundMoney(expense.value),
        status: expense.status || 'Pendente',
        receipt: expense.foto_comprovante || null,
        odometer: expense.foto_odometro || null
      };
      if (normalizeRole(expense.status || '').includes('aprov')) approvedExpenses.push(item);
      else unapprovedExpenses.push(item);
    });

    const calculatedBalance = roundMoney(balanceEvents
      .filter(event => normalizeRole(event.status || '').includes('aprov'))
      .reduce((sum, event) => sum + money(event.approved), 0));
    const approvedExpensesTotal = roundMoney(approvedExpenses.reduce((sum, item) => sum + money(item.value), 0));
    const unapprovedExpensesTotal = roundMoney(unapprovedExpenses.reduce((sum, item) => sum + money(item.value), 0));

    return {
      recipient: { id: target.id, name: target.name, profile: target.profile, unitIds: target.unitIds || [] },
      unit: { id: selectedUnit.id, name: selectedUnit.name },
      period_start: periodStart,
      period_end: periodEnd,
      permissions: { can_close: canClose(actor), seller_locked: textRole(actor) === 'vendedor' },
      balance_events: balanceEvents,
      calculated_balance: calculatedBalance,
      approved_expenses: approvedExpenses,
      approved_expenses_total: approvedExpensesTotal,
      unapproved_expenses: unapprovedExpenses,
      unapproved_expenses_count: unapprovedExpenses.length,
      unapproved_expenses_total: unapprovedExpensesTotal,
      difference: roundMoney(calculatedBalance - approvedExpensesTotal)
    };
  }

  function handleError(res, error, fallback) {
    console.error(fallback, error);
    res.status(error.status || 500).json({ error: error.status ? error.message : fallback });
  }

  app.get('/api/prestacoes-contas/recipients', async (req, res) => {
    try {
      if (!canOpen(req.user)) return res.status(403).json({ error: 'Acesso negado ao módulo.' });
      const companyId = req.user.empresa_id || '001';
      const unitId = String(req.query.unit_id || req.query.unitId || '').trim();
      const allowedIds = (await getPermittedSellerIds(req.user, db)).map(String);
      const users = allowedIds.length
        ? await db('usuarios').where({ empresa_id: companyId }).whereIn('id', allowedIds).whereNot('status', 'INATIVO').orderBy('name', 'asc')
        : [];
      const scoped = [];
      for (const user of users) {
        const enriched = await enrichUserWithUnits(user);
        if (unitId && unitId !== 'all' && !enriched.allowAllUnits && !(enriched.unitIds || []).map(String).includes(unitId)) continue;
        scoped.push({ id: enriched.id, name: enriched.name, profile: enriched.profile, unitIds: enriched.unitIds || [] });
      }
      res.json({
        recipients: scoped,
        seller_locked: textRole(req.user) === 'vendedor',
        can_close: canClose(req.user),
        current_user_id: req.user.id
      });
    } catch (error) {
      handleError(res, error, 'Erro ao carregar usuários da prestação de contas.');
    }
  });

  app.get('/api/prestacoes-contas/preview', async (req, res) => {
    try {
      res.json(await buildPreview(req.user, req.query));
    } catch (error) {
      handleError(res, error, 'Erro ao calcular a prestação de contas.');
    }
  });

  app.get('/api/prestacoes-contas', async (req, res) => {
    try {
      if (!canOpen(req.user)) return res.status(403).json({ error: 'Acesso negado ao módulo.' });
      const allowedIds = (await getPermittedSellerIds(req.user, db)).map(String);
      let query = db('prestacoes_contas as pc')
        .leftJoin('usuarios as u', 'pc.usuario_id', 'u.id')
        .leftJoin('unidades as un', 'pc.unit_id', 'un.id')
        .select('pc.*', 'u.name as usuario_nome', 'u.profile as usuario_perfil', 'un.name as unidade_nome')
        .where('pc.empresa_id', req.user.empresa_id || '001').whereIn('pc.usuario_id', allowedIds);
      const unitId = String(req.query.unit_id || '').trim();
      if (unitId && unitId !== 'all') {
        await requireAllowedUnit(req.user, unitId);
        query = query.where('pc.unit_id', unitId);
      }
      res.json(await query.orderBy('pc.id', 'desc').limit(200));
    } catch (error) {
      handleError(res, error, 'Erro ao listar apurações salvas.');
    }
  });

  app.get('/api/prestacoes-contas/:id', async (req, res) => {
    try {
      const row = await db('prestacoes_contas').where({ id: req.params.id, empresa_id: req.user.empresa_id || '001' }).first();
      if (!row) return res.status(404).json({ error: 'Apuração não encontrada.' });
      await assertTargetAccess(req.user, row.usuario_id, row.unit_id);
      const items = await db('prestacoes_contas_itens').where({ prestacao_id: row.id }).orderBy('id', 'asc');
      const snapshot = JSON.parse(row.snapshot_json || '{}');
      snapshot.permissions = { can_close: canClose(req.user), seller_locked: textRole(req.user) === 'vendedor' };
      res.json({ ...row, snapshot, items });
    } catch (error) {
      handleError(res, error, 'Erro ao carregar a apuração.');
    }
  });

  app.post('/api/prestacoes-contas', async (req, res) => {
    if (!canClose(req.user)) return res.status(403).json({ error: 'Somente administradores e aprovadores financeiros podem salvar uma apuração.' });
    try {
      const preview = await buildPreview(req.user, req.body || {});
      const overrideProvided = req.body.saldo_considerado !== undefined && req.body.saldo_considerado !== null && req.body.saldo_considerado !== '';
      const considered = overrideProvided ? roundMoney(req.body.saldo_considerado) : preview.calculated_balance;
      const reason = String(req.body.motivo_ajuste_saldo || '').trim();
      if (considered !== preview.calculated_balance && !reason) {
        return res.status(400).json({ error: 'Informe o motivo para considerar um saldo diferente do calculado.' });
      }
      const now = new Date().toISOString();
      const snapshot = { ...preview, considered_balance: considered, closing_note: String(req.body.observacao || '').trim(), balance_adjustment_reason: reason };
      let newId;
      try {
        newId = await db.transaction(async trx => {
          const latest = await trx('prestacoes_contas')
            .where({ empresa_id: req.user.empresa_id || '001', unit_id: preview.unit.id, usuario_id: preview.recipient.id,
              periodo_inicio: preview.period_start, periodo_fim: preview.period_end })
            .max({ max_version: 'versao' }).first();
          const version = Number(latest && latest.max_version || 0) + 1;
          const inserted = await trx('prestacoes_contas').insert({
            empresa_id: req.user.empresa_id || '001', unit_id: preview.unit.id, usuario_id: preview.recipient.id,
            periodo_inicio: preview.period_start, periodo_fim: preview.period_end, versao: version,
            saldo_calculado: preview.calculated_balance, saldo_considerado: considered,
            despesas_aprovadas: preview.approved_expenses_total,
            diferenca: roundMoney(considered - preview.approved_expenses_total),
            despesas_nao_aprovadas_qtd: preview.unapproved_expenses_count,
            despesas_nao_aprovadas_valor: preview.unapproved_expenses_total,
            status: 'Apurada', observacao: req.body.observacao || null, motivo_ajuste_saldo: reason || null,
            snapshot_json: JSON.stringify(snapshot), criado_por: req.user.id, apurada_em: now,
            created_at: now, updated_at: now
          }).returning('id');
          const id = typeof inserted[0] === 'object' ? inserted[0].id : inserted[0];
          const rows = [];
          preview.balance_events.forEach(event => rows.push({
            prestacao_id: id, tipo: event.type, origem_tabela: 'despesas_solicitacoes', origem_id: String(event.id),
            data_evento: event.date || null, hora_evento: event.time || null,
            descricao: event.description || event.type, valor: event.approved, status: event.status,
            detalhes_json: JSON.stringify(event), created_at: now
          }));
          preview.approved_expenses.forEach(expense => rows.push({
            prestacao_id: id, tipo: 'despesa_aprovada', origem_tabela: 'despesas_reembolsos', origem_id: String(expense.id),
            data_evento: expense.date || null, hora_evento: expense.time || null,
            descricao: `${expense.code} - ${expense.purpose || expense.description || 'Despesa'}`, valor: expense.value, status: expense.status,
            detalhes_json: JSON.stringify(expense), created_at: now
          }));
          preview.unapproved_expenses.forEach(expense => rows.push({
            prestacao_id: id, tipo: 'despesa_nao_aprovada', origem_tabela: 'despesas_reembolsos', origem_id: String(expense.id),
            data_evento: expense.date || null, hora_evento: expense.time || null,
            descricao: `${expense.code} - ${expense.purpose || expense.description || 'Despesa'}`, valor: expense.value, status: expense.status,
            detalhes_json: JSON.stringify(expense), created_at: now
          }));
          if (rows.length) await trx('prestacoes_contas_itens').insert(rows);
          await trx('auditoria_logs').insert({
            usuario_id: req.user.id, acao: 'APUROU_PRESTACAO_CONTAS',
            detalhes: `Apuração #${id}, versão ${version}, salva para ${preview.recipient.name}, unidade ${preview.unit.name}, período ${preview.period_start} a ${preview.period_end}.`,
            empresa_id: req.user.empresa_id || '001', created_at: now, updated_at: now
          }).catch(() => {});
          return id;
        });
      } catch (dbError) {
        if (String(dbError.code) === '23505' || /unique|UNIQUE/i.test(String(dbError.message))) {
          return res.status(409).json({ error: 'Outra apuração foi salva ao mesmo tempo. Atualize o histórico e tente novamente.' });
        }
        throw dbError;
      }
      res.status(201).json({ success: true, id: newId, snapshot });
    } catch (error) {
      handleError(res, error, 'Erro ao salvar a prestação de contas.');
    }
  });
};
