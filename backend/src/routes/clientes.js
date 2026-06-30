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
    const admin = user.profile === 'Administrador' || perms.includes('Administrador') || perms.includes('Administrador (Acesso Total)');
    if (!admin) return res.status(403).json({ error: 'Somente administrador pode excluir clientes.' });
    const existing = await db('clientes').where({ id }).first();
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado.' });
    await db('clientes').where({ id }).delete();
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir cliente:', err);
    res.status(500).json({ error: 'Erro ao excluir cliente.' });
  }
});

module.exports = router;
