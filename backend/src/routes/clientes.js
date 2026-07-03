// backend/src/routes/clientes.js
const express = require('express');
const router = express.Router();

// Helper to get client data (placeholder, adjust table/fields as needed)
async function getClientFullData(db, clientId) {
  const client = await db('clientes').where({ id: clientId }).first();
  if (!client) return null;

  // Related data
  const equipamentos = await db('equipamentos_solicitados')
    .where({ cliente_id: clientId })
    .select('*');
  const pagamentos = await db('pagamentos')
    .where({ cliente_id: clientId })
    .select('*');
  const analiseVendedor = await db('analises_vendedor')
    .where({ cliente_id: clientId })
    .first();
  const fotos = await db('cliente_fotos')
    .where({ cliente_id: clientId })
    .select('path as url', 'tipo');

  return {
    ...client,
    equipamentos,
    pagamentos,
    analiseVendedor,
    fotos
  };
}

// GET /api/clientes/:id/ficha - returns full client record for approved clients
router.get('/api/clientes/:id/ficha', async (req, res) => {
  const { id } = req.params;
  const db = req.app.get('db'); // assume db attached to app
  try {
    const data = await getClientFullData(db, id);
    if (!data) return res.status(404).json({ error: 'Cliente não encontrado' });
    // Only approved clients should be accessible
    if (data.status !== 'Aprovado') {
      return res.status(403).json({ error: 'Cliente ainda não aprovado' });
    }
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar ficha do cliente' });
  }
});



// DELETE /api/clientes/:id - exclusão de cliente (somente administrador)
router.delete('/api/clientes/:id', async (req, res) => {
  const { id } = req.params;
  const db = req.app.get('db');
  try {
    const user = req.user || {};
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    const profileNorm = String(user.profile || '').toLowerCase();
    const admin = profileNorm.includes('admin') || perms.some(p => String(p).toLowerCase().includes('admin'));
    if (!admin) return res.status(403).json({ error: 'Somente administrador pode excluir clientes.' });
    const existing = await db('clientes').where({ id }).first();

    // Remove também da lista sincronizada do frontend (app_kv_store), senão o cliente volta
    // ao abrir em outro aparelho ou depois de uma sincronização.
    const companyId = (existing && existing.empresa_id) || user.empresa_id || user.company_id || '001';
    const stores = await db('app_kv_store')
      .where(function() {
        this.where('store_key', 'clients')
            .orWhere('store_key', 'like', '%_clients');
      })
      .modify(q => {
        if (companyId) q.where({ company_id: companyId });
      });
    for (const row of stores) {
      let data = [];
      try { data = JSON.parse(row.data_json || '[]'); } catch (_) { data = []; }
      if (!Array.isArray(data)) continue;
      const next = data.filter(c => String(c && c.id) !== String(id));
      if (next.length !== data.length) {
        await db('app_kv_store').where({ company_id: row.company_id, store_key: row.store_key }).update({
          data_json: JSON.stringify(next),
          updated_by: user.id || 'admin',
          updated_at: new Date().toISOString()
        });
      }
    }

    if (existing) await db('clientes').where({ id }).delete();
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir cliente:', err);
    res.status(500).json({ error: 'Erro ao excluir cliente.' });
  }
});

module.exports = router;
