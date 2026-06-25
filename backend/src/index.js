const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const knex = require('knex');
const config = require('../knexfile');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'secret-key-controle-comercial';
const configFilePath = path.join(__dirname, 'emails_config.json');

const db = knex(process.env.NODE_ENV === 'production' ? config.production : config.development);

const insertAndGetId = async (tableName, record, idColumn = 'id') => {
  if (db.client.config.client === 'sqlite3') {
    const [insertedId] = await db(tableName).insert(record);
    return insertedId;
  } else {
    const [res] = await db(tableName).insert(record).returning(idColumn);
    return typeof res === 'object' ? res[idColumn] : res;
  }
};

async function initDb() {
  // Check if in production and DATABASE_URL is missing
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured in production environment!");
  }

  // Verify connection
  console.log('Database: Connecting and verifying connection...');
  await db.raw('SELECT 1');
  console.log('Database: Connection verified.');

  // Run migrations programmatically
  console.log('Database: Running migrations...');
  await db.migrate.latest();
  console.log('Database: Migrations completed.');

  // 1. Alter usuarios table to support email, phone, photo
  const hasEmail = await db.schema.hasColumn('usuarios', 'email');
  if (!hasEmail) {
    await db.schema.table('usuarios', table => {
      table.string('email').nullable();
      table.string('phone').nullable();
      table.text('photo').nullable(); // base64 representation of profile photo
    });
    console.log('Database: Colunas email, phone e photo adicionadas à tabela usuarios.');
  }

  // 2. Create despesas_reembolsos table
  const hasReembolsos = await db.schema.hasTable('despesas_reembolsos');
  if (!hasReembolsos) {
    await db.schema.createTable('despesas_reembolsos', function(table) {
      table.string('id').primary();
      table.string('empresa_id').notNullable();
      table.string('userId').notNullable();
      table.string('unitId').notNullable();
      table.string('date').notNullable();
      table.string('time').notNullable();
      table.string('finalidade').notNullable();
      table.string('operacao').notNullable();
      table.string('descreva').nullable();
      table.string('veiculo').nullable();
      table.integer('km').nullable();
      table.text('foto_odometro').nullable();
      table.text('foto_comprovante').nullable();
      table.decimal('value', 10, 2).nullable();
      table.text('observation').nullable();
      table.string('status').notNullable().defaultTo('Pendente');
      table.timestamps(true, true);
    });
    console.log('Database: Tabela despesas_reembolsos criada com sucesso.');
  }

  // 3. Create exchange_products table
  const hasExchangeProducts = await db.schema.hasTable('exchange_products');
  if (!hasExchangeProducts) {
    await db.schema.createTable('exchange_products', function(table) {
      table.increments('id').primary();
      table.string('company_id').notNullable();
      table.string('unit_id').notNullable().defaultTo('all');
      table.string('codigo').notNullable();
      table.string('produto').notNullable();
      table.string('categoria').notNullable().defaultTo('Outros');
      table.decimal('preco_total', 10, 2).nullable();
      table.string('unidade').nullable();
      table.integer('quantidade_na_caixa').nullable();
      table.decimal('valor_unitario', 10, 2).nullable();
      table.boolean('active').notNullable().defaultTo(true);
      table.timestamps(true, true);
      table.unique(['company_id', 'unit_id', 'codigo']);
    });
    console.log('Database: Tabela exchange_products criada com sucesso.');
  } else {
    const hasUnitId = await db.schema.hasColumn('exchange_products', 'unit_id');
    if (!hasUnitId) {
      await db.schema.table('exchange_products', table => {
        table.string('unit_id').notNullable().defaultTo('all');
      });
      console.log('Database: Coluna unit_id adicionada à tabela exchange_products.');
    }
  }

  // 4. Create exchange_simulations table
  const hasExchangeSimulations = await db.schema.hasTable('exchange_simulations');
  if (!hasExchangeSimulations) {
    await db.schema.createTable('exchange_simulations', function(table) {
      table.increments('id').primary();
      table.string('company_id').notNullable();
      table.string('seller_id').notNullable();
      table.string('cliente_codigo').notNullable();
      table.string('cliente_nome_fantasia').notNullable();
      table.decimal('total', 10, 2).notNullable().defaultTo(0);
      table.text('generated_message').nullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Database: Tabela exchange_simulations criada com sucesso.');
  }

  // 5. Create exchange_simulation_items table
  const hasExchangeSimulationItems = await db.schema.hasTable('exchange_simulation_items');
  if (!hasExchangeSimulationItems) {
    await db.schema.createTable('exchange_simulation_items', function(table) {
      table.increments('id').primary();
      table.integer('simulation_id').unsigned().notNullable().references('id').inTable('exchange_simulations').onDelete('CASCADE');
      table.integer('product_id').nullable();
      table.string('codigo').notNullable();
      table.string('produto').notNullable();
      table.string('categoria').nullable();
      table.string('tipo').notNullable(); // caixa, fracionado
      table.integer('quantidade').notNullable();
      table.decimal('valor_base', 10, 2).notNullable();
      table.decimal('total_item', 10, 2).notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Database: Tabela exchange_simulation_items criada com sucesso.');
  }

  // 6. Create user_hierarchy_links table
  const hasUserHierarchyLinks = await db.schema.hasTable('user_hierarchy_links');
  if (!hasUserHierarchyLinks) {
    await db.schema.createTable('user_hierarchy_links', function(table) {
      table.increments('id').primary();
      table.string('company_id').notNullable();
      table.string('parent_user_id').notNullable();
      table.string('child_user_id').notNullable();
      table.string('relation_type').notNullable(); // supervisor_seller, manager_supervisor
      table.timestamps(true, true);
      table.unique(['company_id', 'parent_user_id', 'child_user_id', 'relation_type']);
    });
    console.log('Database: Tabela user_hierarchy_links criada com sucesso.');
  }

  // 7. Create chamados_tecnicos table (histórico real dos chamados mecânicos)
  const hasChamadosTecnicos = await db.schema.hasTable('chamados_tecnicos');
  if (!hasChamadosTecnicos) {
    await db.schema.createTable('chamados_tecnicos', function(table) {
      table.string('id').primary();
      table.string('empresa_id').notNullable();
      table.string('unitId').notNullable().defaultTo('all');
      table.string('userId').notNullable();
      table.string('equipmentSerial').notNullable();
      table.string('equipmentType').nullable();
      table.string('client').nullable();
      table.string('fantasyName').nullable();
      table.string('city').nullable();
      table.string('address').nullable();
      table.string('title').notNullable();
      table.string('priority').notNullable().defaultTo('Média');
      table.text('observations').nullable();
      table.string('defectPhoto').nullable();
      table.string('defectVideo').nullable();
      table.string('status').notNullable().defaultTo('Aberto');
      table.string('mechanic').nullable();
      table.string('date').nullable();
      table.string('startTime').nullable();
      table.string('endTime').nullable();
      table.text('faultDescription').nullable();
      table.text('solutionDescription').nullable();
      table.string('eqStatusAfter').nullable();
      table.string('gasCharge').nullable();
      table.text('additionalNotes').nullable();
      table.text('parts').notNullable().defaultTo('[]');
      table.text('services').notNullable().defaultTo('[]');
      table.string('fotoAntes').nullable();
      table.string('fotoDepois').nullable();
      table.string('fotoPlaqueta').nullable();
      table.string('videoAtendimento').nullable();
      table.timestamps(true, true);
    });
    console.log('Database: Tabela chamados_tecnicos criada com sucesso.');
  } else {
    // Garante compatibilidade com bancos antigos que já tinham a tabela, mas sem todas as colunas novas.
    const chamadoColumns = {
      empresa_id: t => t.string('empresa_id').notNullable().defaultTo('001'),
      unitId: t => t.string('unitId').notNullable().defaultTo('all'),
      userId: t => t.string('userId').notNullable().defaultTo('demo_user'),
      equipmentSerial: t => t.string('equipmentSerial').notNullable().defaultTo(''),
      equipmentType: t => t.string('equipmentType').nullable(),
      client: t => t.string('client').nullable(),
      fantasyName: t => t.string('fantasyName').nullable(),
      city: t => t.string('city').nullable(),
      address: t => t.string('address').nullable(),
      title: t => t.string('title').notNullable().defaultTo('Chamado mecânico'),
      priority: t => t.string('priority').notNullable().defaultTo('Média'),
      observations: t => t.text('observations').nullable(),
      defectPhoto: t => t.string('defectPhoto').nullable(),
      defectVideo: t => t.string('defectVideo').nullable(),
      status: t => t.string('status').notNullable().defaultTo('Aberto'),
      mechanic: t => t.string('mechanic').nullable(),
      date: t => t.string('date').nullable(),
      startTime: t => t.string('startTime').nullable(),
      endTime: t => t.string('endTime').nullable(),
      faultDescription: t => t.text('faultDescription').nullable(),
      solutionDescription: t => t.text('solutionDescription').nullable(),
      eqStatusAfter: t => t.string('eqStatusAfter').nullable(),
      gasCharge: t => t.string('gasCharge').nullable(),
      additionalNotes: t => t.text('additionalNotes').nullable(),
      parts: t => t.text('parts').notNullable().defaultTo('[]'),
      services: t => t.text('services').notNullable().defaultTo('[]'),
      fotoAntes: t => t.string('fotoAntes').nullable(),
      fotoDepois: t => t.string('fotoDepois').nullable(),
      fotoPlaqueta: t => t.string('fotoPlaqueta').nullable(),
      videoAtendimento: t => t.string('videoAtendimento').nullable()
    };
    for (const [col, addColumn] of Object.entries(chamadoColumns)) {
      const exists = await db.schema.hasColumn('chamados_tecnicos', col);
      if (!exists) {
        await db.schema.table('chamados_tecnicos', table => addColumn(table));
        console.log(`Database: Coluna ${col} adicionada à tabela chamados_tecnicos.`);
      }
    }
  }

  // Normalizar usuários antigos no banco de dados
  const allUsers = await db('usuarios');
  for (const u of allUsers) {
    let needsUpdate = false;
    const updates = {};

    if (!u.empresa_id) {
      updates.empresa_id = '001';
      needsUpdate = true;
    }
    if (!u.unitId) {
      updates.unitId = u.profile === 'Administrador' ? 'all' : '1';
      needsUpdate = true;
    }
    if (!u.status) {
      updates.status = 'LIBERADO';
      needsUpdate = true;
    }
    if (!u.profile) {
      updates.profile = 'Vendedor';
      needsUpdate = true;
    }

    if (needsUpdate) {
      await db('usuarios').where({ id: u.id }).update(updates);
      console.log(`Database: Usuário ${u.username} normalizado com sucesso.`);
    }
  }

  // Remover todos os usuários mock/falsos padrão com senha '123'
  await db('usuarios')
    .whereIn('username', ['admin', 'supervisor', 'financeiro', 'conferente', 'resp_eq', 'mecanico', 'vendedor1', 'vendedor2', 'vendedor3'])
    .andWhere('password', '123')
    .delete();
  console.log('Database: Usuários mock removidos.');

  // Seed default company
  const hasCompany = await db('empresas').where({ id: '12.345.678/0001-90' }).first();
  if (!hasCompany) {
    await db('empresas').insert({
      id: '12.345.678/0001-90',
      name: 'Distribuidora JDS',
      cnpj: '12.345.678/0001-90',
      phone: '(11) 3200-9876',
      email: 'contato@distribuidorajds.com.br'
    });
    console.log('Database: Empresa JDS seed cadastrada.');
  }

  const hasCompanyFallback = await db('empresas').where({ id: 'Distribuidora JDS' }).first();
  if (!hasCompanyFallback) {
    await db('empresas').insert({
      id: 'Distribuidora JDS',
      name: 'Distribuidora JDS',
      cnpj: '12.345.678/0001-90',
      phone: '(11) 3200-9876',
      email: 'contato@distribuidorajds.com.br'
    });
  }

  // Seed default units
  const hasUnit1 = await db('unidades').where({ id: '1' }).first();
  if (!hasUnit1) {
    await db('unidades').insert({
      id: '1',
      name: 'Distribuidora Minas Gerais',
      empresa_id: '12.345.678/0001-90'
    });
  }
  const hasUnit2 = await db('unidades').where({ id: '2' }).first();
  if (!hasUnit2) {
    await db('unidades').insert({
      id: '2',
      name: 'Distribuidora Espírito Santo',
      empresa_id: '12.345.678/0001-90'
    });
  }

  // Seed default admin user admin@controlecampo.com if not exists
  const initialAdminPerms = JSON.stringify([
    "Dashboard", "Clientes", "Produtos", "Estoque", "Financeiro", 
    "Solicitação de Saldo", "Aprovação de Saldo", "Despesas", 
    "Aprovação de Despesas", "Relatórios", "Usuários", "Configurações", "Administrador"
  ]);

  const hasAdminCnpj = await db('usuarios')
    .where({ username: 'admin', empresa_id: '12.345.678/0001-90' })
    .first();

  if (!hasAdminCnpj) {
    await db('usuarios').insert({
      id: 'admin_initial_cnpj',
      name: 'Administrador sistema',
      username: 'admin',
      email: 'admin@controlecampo.com',
      password: '123456',
      profile: 'Administrador',
      unitId: 'all',
      status: 'LIBERADO',
      empresa_id: '12.345.678/0001-90',
      permissions: initialAdminPerms,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    console.log('Database: Admin inicial CNPJ cadastrado.');
  } else if (hasAdminCnpj.email !== 'admin@controlecampo.com' || hasAdminCnpj.password !== '123456') {
    await db('usuarios')
      .where({ username: 'admin', empresa_id: '12.345.678/0001-90' })
      .update({
        email: 'admin@controlecampo.com',
        password: '123456',
        name: 'Administrador sistema',
        profile: 'Administrador',
        status: 'LIBERADO',
        permissions: initialAdminPerms
      });
    console.log('Database: Admin inicial CNPJ atualizado com novas credenciais.');
  }

  const hasAdminName = await db('usuarios')
    .where({ username: 'admin', empresa_id: 'Distribuidora JDS' })
    .first();

  if (!hasAdminName) {
    await db('usuarios').insert({
      id: 'admin_initial_name',
      name: 'Administrador sistema',
      username: 'admin',
      email: 'admin@controlecampo.com',
      password: '123456',
      profile: 'Administrador',
      unitId: 'all',
      status: 'LIBERADO',
      empresa_id: 'Distribuidora JDS',
      permissions: initialAdminPerms,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    console.log('Database: Admin inicial Nome cadastrado.');
  } else if (hasAdminName.email !== 'admin@controlecampo.com' || hasAdminName.password !== '123456') {
    await db('usuarios')
      .where({ username: 'admin', empresa_id: 'Distribuidora JDS' })
      .update({
        email: 'admin@controlecampo.com',
        password: '123456',
        name: 'Administrador sistema',
        profile: 'Administrador',
        status: 'LIBERADO',
        permissions: initialAdminPerms
      });
    console.log('Database: Admin inicial Nome atualizado com novas credenciais.');
  }
}

const app = express();
app.set('db', db);

// CORS configurável: em domínio próprio, defina FRONTEND_URL=https://seudominio.com.br
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    // Permite chamadas locais, arquivo aberto no navegador e, quando configurado, apenas os domínios autorizados.
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origem não autorizada pelo CORS'));
  },
  credentials: true
}));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, X-User-Profile, X-Company-Id, X-Company-Name, X-Unit-Id');
    return res.sendStatus(204);
  }
  next();
});

app.use(bodyParser.json({ limit: process.env.JSON_LIMIT || '25mb' }));

// Servir o frontend junto com o backend. Assim o projeto pode rodar em um domínio só.
const FRONTEND_ROOT = path.join(__dirname, '..', '..');
app.use(express.static(FRONTEND_ROOT, {
  index: false,
  maxAge: 0,
  etag: false,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

const multer = require('multer');

// Configure Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const companyId = req.user ? req.user.empresa_id : '001';
    const uploadPath = path.join(__dirname, '..', 'uploads', companyId);
    
    // Create directory recursively if it doesn't exist
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter (only allow images and safe documents)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf|docx|xlsx/;
  const isMimeValid = allowedTypes.test(file.mimetype.toLowerCase());
  const isExtValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());

  if (isMimeValid && isExtValid) {
    return cb(null, true);
  }
  cb(new Error('Tipo de arquivo não permitido. Apenas imagens e documentos (PDF, DOCX, XLSX) são aceitos.'));
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Servir arquivos estáticos da pasta uploads
const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(UPLOADS_ROOT));

// Real JWT Authentication Middleware
app.use(async (req, res, next) => {
  // IMPORTANTE: autenticação JWT só deve proteger rotas de API.
  // O frontend (/ , /index.html e hashes como /#login) precisa ser entregue sem token;
  // quem bloqueia o painel é o JS do frontend validando /api/me depois.
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  const publicPaths = ['/api/login', '/api/usuarios/login', '/api/usuarios/register'];
  
  if (publicPaths.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acesso negado: Token de autenticação ausente.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if the user is still active in the database
    const user = await db('usuarios').where({ id: decoded.id }).first();
    if (!user) {
      return res.status(404).json({ error: 'Acesso negado: Usuário não cadastrado.' });
    }

    if (user.status === 'AGUARDANDO LIBERAÇÃO') {
      return res.status(403).json({ error: 'Acesso negado: Seu acesso aguarda aprovação gerencial.' });
    }
    if (user.status === 'INATIVO') {
      return res.status(403).json({ error: 'Acesso negado: Seu acesso foi desativado por um administrador.' });
    }

    req.user = {
      id: user.id,
      name: user.name,
      username: user.username,
      profile: user.profile,
      empresa_id: user.empresa_id,
      empresa_name: req.header('X-Company-Name') || user.empresa_id || '001',
      unitId: user.unitId || 'all',
      permissions: JSON.parse(user.permissions || '[]')
    };
    next();
  } catch (err) {
    console.error('JWT Auth verification failed:', err.message);
    return res.status(401).json({ error: 'Sessão expirada ou inválida. Por favor, faça login novamente.' });
  }
});

// Secure endpoint for physical file uploads
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Erro de upload: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const companyId = req.user ? req.user.empresa_id : '001';
    const fileUrl = `/uploads/${companyId}/${req.file.filename}`;
    res.json({ success: true, url: fileUrl });
  });
});

// Helper to check company and role access to a request
async function getRequestAndVerifyAccess(id, user) {
  const request = await db('despesas_solicitacoes').where({ id }).first();
  if (!request) return { errorStatus: 404, errorMessage: 'Solicitação não encontrada' };
  
  if (request.empresa_id !== user.empresa_id) {
    return { errorStatus: 403, errorMessage: 'Acesso negado: empresa divergente' };
  }
  
  const isAdmin = user.profile === 'Administrador' || (user.permissions || []).includes('Administrador');
  if (!isAdmin) {
    const allowedIds = await getPermittedSellerIds(user, db);
    if (!allowedIds.map(String).includes(String(request.usuario_id))) {
      return { errorStatus: 403, errorMessage: 'Acesso negado: esta solicitação não pertence à sua cadeia de atendimento' };
    }
  }
  
  return { request };
}

// Middleware to restrict all /api/despesas endpoints to responsible profiles or allowed permissions
app.use('/api/despesas', (req, res, next) => {
  const perms = req.user.permissions || [];
  const isAllowed = ['Administrador', 'Gerente', 'Supervisor', 'Vendedor', 'Financeiro'].includes(req.user.profile) ||
                    perms.includes('Administrador') ||
                    perms.includes('Despesas') ||
                    perms.includes('Solicitação de Saldo') ||
                    perms.includes('Aprovação de Saldo') ||
                    perms.includes('Financeiro') ||
                    perms.includes('Aprovação de Despesas');
  
  if (!isAllowed) {
    return res.status(403).json({ error: 'Acesso negado: sem permissão para acessar despesas/saldo.' });
  }
  next();
});

// Create new balance request
app.post('/api/despesas', async (req, res) => {
  const {
    empresa_id,
    solicitante,
    justificativa,
    valor_hotel_alim,
    valor_abastecimento,
    rota_destino,
    placa_veiculo,
    extras
  } = req.body;

  const targetEmpresaId = req.user.empresa_id;
  if (!targetEmpresaId) {
    return res.status(400).json({ error: 'Acesso negado: empresa do usuário não vinculada.' });
  }

  if (!solicitante || !justificativa) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }

  const now = new Date();
  const data_solicitacao = now.toISOString().split('T')[0];
  const hora_solicitacao = now.toTimeString().split(' ')[0];

  const newReq = {
    empresa_id: targetEmpresaId,
    solicitante,
    justificativa,
    data_solicitacao,
    hora_solicitacao,
    usuario_id: req.user.id,
    status: 'Pendente',
    valor_hotel_alim: valor_hotel_alim || 0,
    valor_abastecimento: valor_abastecimento || 0,
    rota_destino: rota_destino || '',
    placa_veiculo: placa_veiculo || '',
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };

  try {
    const id = await insertAndGetId('despesas_solicitacoes', newReq, 'id');
    
    // Insert items into despesas_solicitacoes_itens
    const itemsToInsert = [];
    
    // 1. Hospedagem
    if (valor_hotel_alim > 0) {
      let noites = Math.round(valor_hotel_alim / 120.00);
      itemsToInsert.push({
        solicitacao_id: id,
        categoria: 'Hospedagem',
        valor_solicitado: valor_hotel_alim,
        quantidade_solicitada: noites || 1,
        status: 'pendente'
      });
    }

    // 2. Abastecimento
    if (valor_abastecimento > 0) {
      itemsToInsert.push({
        solicitacao_id: id,
        categoria: 'Abastecimento',
        valor_solicitado: valor_abastecimento,
        quantidade_solicitada: null,
        status: 'pendente'
      });
    }

    // 3. Extras
    if (Array.isArray(extras) && extras.length) {
      const extraRows = extras.map(it => ({
        solicitacao_id: id,
        valor: it.valor || 0,
        descricao: it.descricao || '',
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      }));
      await db('despesas_itens_extras').insert(extraRows);

      extras.forEach(ext => {
        itemsToInsert.push({
          solicitacao_id: id,
          categoria: ext.descricao,
          valor_solicitado: ext.valor,
          quantidade_solicitada: null,
          status: 'pendente'
        });
      });
    }

    if (itemsToInsert.length) {
      await db('despesas_solicitacoes_itens').insert(itemsToInsert);
    }

    // Audit log
    const totalSolicitadoVal = Number(valor_hotel_alim || 0) + Number(valor_abastecimento || 0) + (extras ? extras.reduce((sum, e) => sum + Number(e.valor), 0) : 0);
    await db('auditoria_logs').insert({
      usuario_id: req.user.id,
      acao: 'SOLICITOU_SALDO',
      detalhes: `Solicitação de saldo #${id} criada por ${solicitante} no valor total de R$ ${totalSolicitadoVal.toFixed(2)}`,
      empresa_id: targetEmpresaId
    });

    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gravar solicitação' });
  }
});

// List all expense requests for user's company (applying filters & roles)
app.get('/api/despesas', async (req, res) => {
  try {
    const actorPerms = req.user.permissions || [];
    const isActorAdmin = req.user.profile === 'Administrador' || actorPerms.includes('Administrador');

    let query = db('despesas_solicitacoes')
      .leftJoin('usuarios', 'despesas_solicitacoes.usuario_id', '=', 'usuarios.id')
      .select('despesas_solicitacoes.*', 'usuarios.unitId as unitId');

    if (!isActorAdmin) {
      query = query.where('despesas_solicitacoes.empresa_id', req.user.empresa_id);

      // Apply unit isolation
      if (req.user.unitId && req.user.unitId !== 'all') {
        query = query.where('usuarios.unitId', req.user.unitId);
      } else if (req.query.unitId && req.query.unitId !== 'all') {
        query = query.where('usuarios.unitId', req.query.unitId);
      }
    } else {
      if (req.query.unitId && req.query.unitId !== 'all') {
        query = query.where('usuarios.unitId', req.query.unitId);
      }
    }

    // Apply hierarchy limitation: vendedor -> só dele; supervisor -> vendedores vinculados; gerente -> supervisores/vendedores da cadeia.
    if (!isActorAdmin) {
      const permittedIds = await getPermittedSellerIds(req.user, db);
      query = query.whereIn('despesas_solicitacoes.usuario_id', permittedIds);
    }

    // Apply filters
    if (req.query.status) {
      query = query.where('despesas_solicitacoes.status', req.query.status);
    }
    if (req.query.solicitante) {
      query = query.where('despesas_solicitacoes.solicitante', 'like', `%${req.query.solicitante}%`);
    }
    if (req.query.data_inicio) {
      query = query.where('despesas_solicitacoes.data_solicitacao', '>=', req.query.data_inicio);
    }
    if (req.query.data_fim) {
      query = query.where('despesas_solicitacoes.data_solicitacao', '<=', req.query.data_fim);
    }

    const requests = await query.orderBy('id', 'desc');

    // Load extras and item approvals for all requests
    const ids = requests.map(r => r.id);
    let allExtras = [];
    let allItems = [];
    if (ids.length) {
      allExtras = await db('despesas_itens_extras').whereIn('solicitacao_id', ids);
      allItems = await db('despesas_solicitacoes_itens').whereIn('solicitacao_id', ids);
    }

    const results = requests.map(reqRow => {
      const extras = allExtras.filter(e => e.solicitacao_id === reqRow.id);
      const items = allItems.filter(i => i.solicitacao_id === reqRow.id);
      const totalExtras = extras.reduce((sum, e) => sum + Number(e.valor || 0), 0);
      const totalGeral = Number(reqRow.valor_hotel_alim || 0) + Number(reqRow.valor_abastecimento || 0) + totalExtras;
      const totalAprovado = items.length
        ? items.reduce((sum, item) => {
            const status = String(item.status || '').toLowerCase();
            if (status === 'reprovado') return sum;
            return sum + Number(item.valor_aprovado || 0);
          }, 0)
        : (reqRow.status === 'Aprovada' ? totalGeral : 0);
      return {
        ...reqRow,
        extras,
        totalGeral,
        totalAprovado
      };
    });

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar solicitações' });
  }
});

// Get summary metrics for Dashboard
app.get('/api/despesas/summary', async (req, res) => {
  try {
    const actorPerms = req.user.permissions || [];
    const isActorAdmin = req.user.profile === 'Administrador' || actorPerms.includes('Administrador');

    let query = db('despesas_solicitacoes')
      .leftJoin('usuarios', 'despesas_solicitacoes.usuario_id', '=', 'usuarios.id')
      .select('despesas_solicitacoes.*', 'usuarios.unitId as unitId');

    if (!isActorAdmin) {
      query = query.where('despesas_solicitacoes.empresa_id', req.user.empresa_id);

      // Apply unit isolation
      if (req.user.unitId && req.user.unitId !== 'all') {
        query = query.where('usuarios.unitId', req.user.unitId);
      } else if (req.query.unitId && req.query.unitId !== 'all') {
        query = query.where('usuarios.unitId', req.query.unitId);
      }
    } else {
      if (req.query.unitId && req.query.unitId !== 'all') {
        query = query.where('usuarios.unitId', req.query.unitId);
      }
    }

    if (req.user.profile === 'Vendedor') {
      query = query.where('despesas_solicitacoes.usuario_id', req.user.id);
    }

    // Apply the same filters used by /api/despesas so dashboard metrics can follow the visible list.
    if (req.query.status) {
      query = query.where('despesas_solicitacoes.status', req.query.status);
    }
    if (req.query.solicitante) {
      query = query.where('despesas_solicitacoes.solicitante', 'like', `%${req.query.solicitante}%`);
    }
    if (req.query.data_inicio) {
      query = query.where('despesas_solicitacoes.data_solicitacao', '>=', req.query.data_inicio);
    }
    if (req.query.data_fim) {
      query = query.where('despesas_solicitacoes.data_solicitacao', '<=', req.query.data_fim);
    }

    const requests = await query;
    const ids = requests.map(r => r.id);
    
    let allExtras = [];
    let allItems = [];
    if (ids.length) {
      allExtras = await db('despesas_itens_extras').whereIn('solicitacao_id', ids);
      allItems = await db('despesas_solicitacoes_itens').whereIn('solicitacao_id', ids);
    }

    let totalSolicitado = 0;
    let totalAprovado = 0;
    let totalRejeitado = 0;
    let countPendente = 0;

    requests.forEach(r => {
      const extras = allExtras.filter(e => e.solicitacao_id === r.id);
      const items = allItems.filter(i => i.solicitacao_id === r.id);
      const totalExtras = extras.reduce((sum, e) => sum + Number(e.valor || 0), 0);
      const totalGeral = Number(r.valor_hotel_alim || 0) + Number(r.valor_abastecimento || 0) + totalExtras;
      const totalAprovadoItens = items.reduce((sum, item) => {
        const statusItem = String(item.status || '').toLowerCase();
        if (statusItem === 'reprovado') return sum;
        return sum + Number(item.valor_aprovado || 0);
      }, 0);

      totalSolicitado += totalGeral;
      if (r.status === 'Aprovada' || r.status === 'Aprovada (não valor total)') {
        // Para aprovação parcial, soma somente o valor realmente liberado nos itens.
        // Se for uma solicitação antiga sem itens, mantém compatibilidade usando o total solicitado.
        totalAprovado += items.length ? totalAprovadoItens : totalGeral;
      } else if (r.status === 'Rejeitada') {
        totalRejeitado += totalGeral;
      } else if (r.status === 'Pendente') {
        countPendente++;
      }
    });

    res.json({
      totalSolicitado,
      totalAprovado,
      totalRejeitado,
      countPendente,
      countTotal: requests.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar resumo de despesas' });
  }
});

// Get detailed request by ID (with extras, approvals, and items)
app.get('/api/despesas/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { request, errorStatus, errorMessage } = await getRequestAndVerifyAccess(id, req.user);
    if (errorMessage) {
      return res.status(errorStatus).json({ error: errorMessage });
    }

    const extras = await db('despesas_itens_extras').where({ solicitacao_id: id });
    const aprovacoes = await db('despesas_aprovacoes').where({ solicitacao_id: id }).orderBy('id', 'desc');
    const itens = await db('despesas_solicitacoes_itens').where({ solicitacao_id: id });

    const totalExtras = extras.reduce((sum, e) => sum + Number(e.valor), 0);
    const totalGeral = Number(request.valor_hotel_alim) + Number(request.valor_abastecimento) + totalExtras;

    res.json({
      ...request,
      extras,
      aprovacoes,
      itens,
      totalGeral
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao detalhar solicitação' });
  }
});

// Update existing pending request
app.put('/api/despesas/:id', async (req, res) => {
  const { id } = req.params;
  const {
    solicitante,
    justificativa,
    valor_hotel_alim,
    valor_abastecimento,
    rota_destino,
    placa_veiculo,
    extras
  } = req.body;

  try {
    const { request, errorStatus, errorMessage } = await getRequestAndVerifyAccess(id, req.user);
    if (errorMessage) {
      return res.status(errorStatus).json({ error: errorMessage });
    }

    if (request.status !== 'Pendente') {
      return res.status(400).json({ error: 'Apenas solicitações Pendentes podem ser editadas.' });
    }

    const now = new Date();
    await db('despesas_solicitacoes').where({ id }).update({
      solicitante: solicitante || request.solicitante,
      justificativa: justificativa || request.justificativa,
      valor_hotel_alim: valor_hotel_alim !== undefined ? valor_hotel_alim : request.valor_hotel_alim,
      valor_abastecimento: valor_abastecimento !== undefined ? valor_abastecimento : request.valor_abastecimento,
      rota_destino: rota_destino !== undefined ? rota_destino : request.rota_destino,
      placa_veiculo: placa_veiculo !== undefined ? placa_veiculo : request.placa_veiculo,
      updated_at: now.toISOString()
    });

    // Update items in despesas_solicitacoes_itens
    await db('despesas_solicitacoes_itens').where({ solicitacao_id: id }).delete();
    await db('despesas_itens_extras').where({ solicitacao_id: id }).delete();

    const itemsToInsert = [];
    const valHotel = valor_hotel_alim !== undefined ? valor_hotel_alim : request.valor_hotel_alim;
    const valAbas = valor_abastecimento !== undefined ? valor_abastecimento : request.valor_abastecimento;

    if (valHotel > 0) {
      let noites = Math.round(valHotel / 120.00);
      itemsToInsert.push({
        solicitacao_id: id,
        categoria: 'Hospedagem',
        valor_solicitado: valHotel,
        quantidade_solicitada: noites || 1,
        status: 'pendente'
      });
    }

    if (valAbas > 0) {
      itemsToInsert.push({
        solicitacao_id: id,
        categoria: 'Abastecimento',
        valor_solicitado: valAbas,
        quantidade_solicitada: null,
        status: 'pendente'
      });
    }

    if (Array.isArray(extras)) {
      if (extras.length) {
        const extraRows = extras.map(it => ({
          solicitacao_id: id,
          valor: it.valor || 0,
          descricao: it.descricao || '',
          created_at: now.toISOString(),
          updated_at: now.toISOString()
        }));
        await db('despesas_itens_extras').insert(extraRows);

        extras.forEach(ext => {
          itemsToInsert.push({
            solicitacao_id: id,
            categoria: ext.descricao,
            valor_solicitado: ext.valor,
            quantidade_solicitada: null,
            status: 'pendente'
          });
        });
      }
    }

    if (itemsToInsert.length) {
      await db('despesas_solicitacoes_itens').insert(itemsToInsert);
    }

    // Audit log
    await db('auditoria_logs').insert({
      usuario_id: req.user.id,
      acao: 'ALTEROU_VALORES',
      detalhes: `Solicitação de saldo #${id} foi alterada/atualizada por ${req.user.name || req.user.id}`,
      empresa_id: req.user.empresa_id
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar solicitação' });
  }
});

// Approve/Reject a request by individual items
app.post('/api/despesas/:id/approval', async (req, res) => {
  const { id } = req.params;
  const { items, observacao } = req.body; // items is array of evaluations, observacao is general note

  const allowedProfiles = ['Administrador', 'Supervisor', 'Financeiro'];
  if (!allowedProfiles.includes(req.user.profile) && !req.user.permissions.includes('Aprovação de Saldo')) {
    return res.status(403).json({ error: 'Acesso negado: perfil sem privilégio de aprovação.' });
  }

  try {
    const { request, errorStatus, errorMessage } = await getRequestAndVerifyAccess(id, req.user);
    if (errorMessage) {
      return res.status(errorStatus).json({ error: errorMessage });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'A avaliação detalhada dos itens é obrigatória.' });
    }

    const now = new Date();
    const data_aprovacao = now.toISOString().split('T')[0];
    const hora_aprovacao = now.toTimeString().split(' ')[0];

    let allApprovedIntegral = true;
    let allReproved = true;
    let totalAprovado = 0;

    for (const evalItem of items) {
      const dbItem = await db('despesas_solicitacoes_itens')
        .where({ id: evalItem.id, solicitacao_id: id })
        .first();

      if (!dbItem) continue;

      const valAprovado = parseFloat(evalItem.valor_aprovado) || 0;
      const qtyAprovada = evalItem.quantidade_aprovada !== undefined && evalItem.quantidade_aprovada !== null ?
        parseInt(evalItem.quantidade_aprovada, 10) : null;

      const isReducedVal = valAprovado < dbItem.valor_solicitado;
      const isReducedQty = dbItem.quantidade_solicitada !== null && qtyAprovada < dbItem.quantidade_solicitada;

      let itemStatus = evalItem.status; // aprovado, aprovado parcialmente, reprovado
      if (itemStatus === 'aprovado' && (isReducedVal || isReducedQty)) {
        itemStatus = 'aprovado parcialmente';
      }

      if (itemStatus !== 'reprovado') {
        allReproved = false;
        if (itemStatus === 'aprovado parcialmente') {
          allApprovedIntegral = false;
        }
        totalAprovado += valAprovado;
      } else {
        allApprovedIntegral = false;
      }

      // Update item in database
      await db('despesas_solicitacoes_itens')
        .where({ id: evalItem.id })
        .update({
          valor_aprovado: valAprovado,
          quantidade_aprovada: qtyAprovada,
          status: itemStatus,
          justificativa: evalItem.justificativa || '',
          data_aprovacao,
          usuario_aprovador: req.user.name || req.user.id
        });

      // Record audit log for individual item
      const actionType = itemStatus === 'reprovado' ? 'REPROVOU_ITEM' : (itemStatus === 'aprovado parcialmente' ? 'ALTEROU_VALOR' : 'APROVOU_ITEM');
      await db('auditoria_logs').insert({
        usuario_id: req.user.id,
        acao: actionType,
        detalhes: `Item ${dbItem.categoria} da solicitação #${id} avaliado como ${itemStatus.toUpperCase()} (Solicitado: R$ ${dbItem.valor_solicitado.toFixed(2)}, Aprovado: R$ ${valAprovado.toFixed(2)}${dbItem.quantidade_solicitada ? ', Solicitado Qtd: ' + dbItem.quantidade_solicitada + ', Aprovado Qtd: ' + qtyAprovada : ''}). Justificativa: "${evalItem.justificativa || '-'}"`,
        empresa_id: req.user.empresa_id
      });
    }

    // Determine general status
    let generalStatus = 'Pendente';
    if (allReproved) {
      generalStatus = 'Rejeitada';
    } else if (allApprovedIntegral) {
      generalStatus = 'Aprovada';
    } else {
      generalStatus = 'Aprovada (não valor total)';
    }

    // Update main request status
    await db('despesas_solicitacoes').where({ id }).update({
      status: generalStatus,
      updated_at: now.toISOString()
    });

    // Insert legacy approval log for backwards compatibility
    await db('despesas_aprovacoes').insert({
      solicitacao_id: id,
      gerente_id: req.user.id,
      data_aprovacao,
      hora_aprovacao,
      observacao: observacao || `Avaliação detalhada concluída. Total Aprovado: R$ ${totalAprovado.toFixed(2)}`,
      status: generalStatus,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    });

    // Auditoria Geral
    await db('auditoria_logs').insert({
      usuario_id: req.user.id,
      acao: generalStatus === 'Rejeitada' ? 'REPROVOU_ITEM' : 'APROVOU_ITEM',
      detalhes: `Solicitação #${id} finalizada com status geral ${generalStatus.toUpperCase()} por ${req.user.name || req.user.id}. Total Aprovado Geral: R$ ${totalAprovado.toFixed(2)}`,
      empresa_id: req.user.empresa_id
    });

    // Log notification details
    const formattedItemsLog = items.map(evalItem => {
      const qStr = evalItem.quantidade_aprovada !== null && evalItem.quantidade_aprovada !== undefined ? `, Aprovado: ${evalItem.quantidade_aprovada} diárias` : '';
      return `${evalItem.categoria}:\nSolicitado: R$ ${evalItem.valor_solicitado || ''}\nAprovado: R$ ${evalItem.valor_aprovado}${qStr}\nMotivo: ${evalItem.justificativa || '-'}`;
    }).join('\n\n');
    console.log(`[NOTIFICAÇÃO EMAIL VENDEDOR] Sua solicitação de saldo foi analisada.\n\n${formattedItemsLog}`);

    res.json({ success: true, generalStatus, totalAprovado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao registrar parecer de aprovação' });
  }
});

// Delete expense request (only if Pending and owner)
app.delete('/api/despesas/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { request, errorStatus, errorMessage } = await getRequestAndVerifyAccess(id, req.user);
    if (errorMessage) {
      return res.status(errorStatus).json({ error: errorMessage });
    }

    if (request.status !== 'Pendente') {
      return res.status(400).json({ error: 'Apenas solicitações Pendentes podem ser excluídas.' });
    }

    await db('despesas_solicitacoes').where({ id }).delete();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir solicitação' });
  }
});

// List all equipments (patrimonio)
app.get('/api/equipamentos/patrimonio', async (req, res) => {
  try {
    const actorPerms = req.user.permissions || [];
    const isActorAdmin = req.user.profile === 'Administrador' || actorPerms.includes('Administrador');

    let query = db('equipamentos_patrimonio');
    if (!isActorAdmin) {
      query = query.where('empresa', req.user.empresa_name);
    }
    const list = await query.orderBy('patrimonio', 'asc');
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar equipamentos' });
  }
});

// Busca Patrimônio, detalhes e histórico de movimentações
app.get('/api/equipamentos/patrimonio/:patrimonio', async (req, res) => {
  const { patrimonio } = req.params;
  try {
    const actorPerms = req.user.permissions || [];
    const isActorAdmin = req.user.profile === 'Administrador' || actorPerms.includes('Administrador');

    let queryItem = db('equipamentos_patrimonio').where({ patrimonio });
    if (!isActorAdmin) {
      queryItem = queryItem.where({ empresa: req.user.empresa_name });
    }
    const item = await queryItem.first();

    if (!item) {
      return res.json({ exists: false });
    }

    // Busca o histórico de movimentações APROVADAS
    let queryHist = db('equipamentos_movimentacoes')
      .where({ status: 'Aprovado' })
      .andWhere(function() {
        this.where('patrimonio', patrimonio)
            .orWhere('patrimonio_novo', patrimonio);
      });
    if (!isActorAdmin) {
      queryHist = queryHist.where({ empresa: req.user.empresa_name });
    }
    const historico = await queryHist.orderBy('created_at', 'desc');

    res.json({
      exists: true,
      ...item,
      historico
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar patrimônio' });
  }
});

// Registrar Nova Movimentação (e cadastrar patrimônio automaticamente se for novo)
app.post('/api/equipamentos/movimentacoes', async (req, res) => {
  const {
    empresa,
    tipo_solicitacao,
    vendedor_solicitante,
    cliente_codigo,
    cliente_nome,
    cliente_cidade,
    cliente_endereco,
    cliente_vendedor,
    observacao,
    
    // campos específicos
    patrimonio,
    modelo,
    voltagem,
    patrimonio_novo,
    modelo_novo,
    voltagem_nova,
    quantidade,
    detalhe_troca_adicao,
    motivo_recolhimento,
    
    // mídias
    foto_equipamento_url,
    foto_antes_url,
    foto_depois_url,
    video_url
  } = req.body;

  if (!tipo_solicitacao || !vendedor_solicitante || !cliente_nome || !cliente_cidade) {
    return res.status(400).json({ error: 'Campos obrigatórios de identificação faltando' });
  }

  const now = new Date().toISOString();

  try {
    // 1. Cadastra automaticamente o patrimônio antigo/único se não existir
    const pCode = (tipo_solicitacao === 'Troca') ? patrimonio : (patrimonio || patrimonio_novo);
    if (pCode) {
      const exists = await db('equipamentos_patrimonio').where({ patrimonio: pCode }).first();
      if (!exists) {
        await db('equipamentos_patrimonio').insert({
          patrimonio: pCode,
          empresa: req.user.empresa_name || req.user.empresa_id,
          modelo: modelo || modelo_novo || 'Modelo não especificado',
          voltagem: voltagem || voltagem_nova || '110',
          status: 'Pendente',
          created_at: now,
          updated_at: now
        });
      }
    }

    // 2. Para trocas, cadastra também o patrimônio novo se não existir
    if (tipo_solicitacao === 'Troca' && patrimonio_novo) {
      const existsNew = await db('equipamentos_patrimonio').where({ patrimonio: patrimonio_novo }).first();
      if (!existsNew) {
        await db('equipamentos_patrimonio').insert({
          patrimonio: patrimonio_novo,
          empresa: req.user.empresa_name || req.user.empresa_id,
          modelo: modelo_novo || 'Modelo não especificado',
          voltagem: voltagem_nova || '110',
          status: 'Pendente',
          created_at: now,
          updated_at: now
        });
      }
    }

    // 3. Insere a movimentação
    const newId = await insertAndGetId('equipamentos_movimentacoes', {
      empresa: req.user.empresa_name || req.user.empresa_id,
      tipo_solicitacao,
      vendedor_solicitante,
      vendedor_id: req.user.id,
      cliente_codigo: cliente_codigo || '',
      cliente_nome,
      cliente_cidade,
      cliente_endereco: cliente_endereco || '',
      cliente_vendedor: cliente_vendedor || vendedor_solicitante,
      status: 'Pendente',
      observacao: observacao || '',
      
      patrimonio: patrimonio || '',
      modelo: modelo || '',
      voltagem: voltagem || '',
      patrimonio_novo: patrimonio_novo || '',
      modelo_novo: modelo_novo || '',
      voltagem_nova: voltagem_nova || '',
      quantidade: quantidade || 1,
      detalhe_troca_adicao: detalhe_troca_adicao || '',
      motivo_recolhimento: motivo_recolhimento || '',
      
      foto_equipamento_url: foto_equipamento_url || '',
      foto_antes_url: foto_antes_url || '',
      foto_depois_url: foto_depois_url || '',
      video_url: video_url || '',
      created_at: now,
      updated_at: now
    });

    // Simulação de Notificação por E-mail
    try {
      const emailConfig = fs.existsSync(configFilePath) ? JSON.parse(fs.readFileSync(configFilePath, 'utf8')) : { emails: 'notificacoes@distribuidorajds.com.br, equipamentos@distribuidorajds.com.br' };
      console.log(`[NOTIFICAÇÃO EMAIL] Nova movimentação registrada (ID: ${newId}) por ${vendedor_solicitante}. Notificação de e-mail enviada para os responsáveis: ${emailConfig.emails}`);
    } catch (err) {
      console.error('Erro ao gerar log de notificação por e-mail:', err);
    }

    res.json({ success: true, id: newId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gravar movimentação de equipamento' });
  }
});

// Listagem de Movimentações (com filtros de pesquisa e restrições de perfil)
app.get('/api/equipamentos/movimentacoes', async (req, res) => {
  try {
    const actorPerms = req.user.permissions || [];
    const isActorAdmin = req.user.profile === 'Administrador' || actorPerms.includes('Administrador');

    let query = db('equipamentos_movimentacoes');

    if (!isActorAdmin) {
      query = query.where('equipamentos_movimentacoes.empresa', req.user.empresa_name);

      // Apply unit isolation
      if (req.user.unitId && req.user.unitId !== 'all') {
        query = query.join('usuarios', 'equipamentos_movimentacoes.vendedor_id', '=', 'usuarios.id')
                     .where('usuarios.unitId', req.user.unitId)
                     .select('equipamentos_movimentacoes.*');
      }
    }

    // Aplica cadeia hierárquica também nas movimentações
    if (!isActorAdmin) {
      const permittedIds = await getPermittedSellerIds(req.user, db);
      query = query.whereIn('equipamentos_movimentacoes.vendedor_id', permittedIds);
    }

    // Filtros dinâmicos
    if (req.query.cidade) {
      query = query.where('equipamentos_movimentacoes.cliente_cidade', 'like', `%${req.query.cidade}%`);
    }
    if (req.query.vendedor) {
      query = query.where('equipamentos_movimentacoes.vendedor_solicitante', 'like', `%${req.query.vendedor}%`);
    }
    if (req.query.patrimonio) {
      const p = req.query.patrimonio;
      query = query.andWhere(function() {
        this.where('equipamentos_movimentacoes.patrimonio', 'like', `%${p}%`)
            .orWhere('equipamentos_movimentacoes.patrimonio_novo', 'like', `%${p}%`);
      });
    }
    if (req.query.tipo_solicitacao) {
      query = query.where('equipamentos_movimentacoes.tipo_solicitacao', req.query.tipo_solicitacao);
    }
    if (req.query.status) {
      query = query.where('equipamentos_movimentacoes.status', req.query.status);
    }
    if (req.query.data_inicio) {
      query = query.where('equipamentos_movimentacoes.created_at', '>=', req.query.data_inicio);
    }
    if (req.query.data_fim) {
      query = query.where('equipamentos_movimentacoes.created_at', '<=', req.query.data_fim + 'T23:59:59');
    }

    const list = await query.orderBy('equipamentos_movimentacoes.id', 'desc');
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar movimentações' });
  }
});

// Detalhes / Dossiê completo da Movimentação
app.get('/api/equipamentos/movimentacoes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const mov = await db('equipamentos_movimentacoes').where({ id, empresa: req.user.empresa_name }).first();
    if (!mov) {
      return res.status(404).json({ error: 'Movimentação não encontrada' });
    }

    const permittedIds = await getPermittedSellerIds(req.user, db);
    const staffProfiles = ['Administrador', 'Responsável Equipamentos', 'Conferente', 'Financeiro'];
    if (!staffProfiles.includes(req.user.profile) && !permittedIds.includes(mov.vendedor_id)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    res.json(mov);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar dossiê de movimentação' });
  }
});

// Parecer Gerencial (Aprovar / Reprovar Movimentação)
app.post('/api/equipamentos/movimentacoes/:id/approval', async (req, res) => {
  const { id } = req.params;
  const { status, motivo_reprovacao } = req.body;

  const allowed = ['Administrador', 'Supervisor', 'Responsável Equipamentos'];
  if (!allowed.includes(req.user.profile)) {
    return res.status(403).json({ error: 'Acesso negado: perfil sem privilégio de aprovação.' });
  }

  if (status === 'Reprovado' && !motivo_reprovacao) {
    return res.status(400).json({ error: 'Motivo de reprovação é obrigatório' });
  }

  try {
    const mov = await db('equipamentos_movimentacoes').where({ id, empresa: req.user.empresa_name }).first();
    if (!mov) {
      return res.status(404).json({ error: 'Movimentação não encontrada' });
    }
    if (req.user.profile === 'Supervisor' || req.user.profile === 'Gerente') {
      const permittedIds = await getPermittedSellerIds(req.user, db);
      if (!permittedIds.includes(mov.vendedor_id)) {
        return res.status(403).json({ error: 'Acesso negado: movimentação fora da sua cadeia.' });
      }
    }

    const now = new Date().toISOString();

    // 1. Atualizar status da movimentação
    await db('equipamentos_movimentacoes').where({ id }).update({
      status,
      motivo_reprovacao: status === 'Reprovado' ? motivo_reprovacao : null,
      updated_at: now
    });

    // 2. Se for Aprovado, sincronizar base de Patrimônio
    if (status === 'Aprovado') {
      const clientFields = {
        cliente_atual_id: mov.cliente_codigo || null,
        cliente_atual_name: mov.cliente_nome,
        cliente_atual_cidade: mov.cliente_cidade,
        cliente_atual_endereco: mov.cliente_endereco || null
      };

      if (mov.tipo_solicitacao === 'Adição') {
        await db('equipamentos_patrimonio')
          .where({ patrimonio: mov.patrimonio })
          .update({
            cliente_atual_id: clientFields.cliente_atual_id,
            cliente_atual_nome: clientFields.cliente_atual_name,
            cliente_atual_cidade: clientFields.cliente_atual_cidade,
            cliente_atual_endereco: clientFields.cliente_atual_endereco,
            status: 'Instalado',
            updated_at: now
          });
      } else if (mov.tipo_solicitacao === 'Recolha') {
        await db('equipamentos_patrimonio')
          .where({ patrimonio: mov.patrimonio })
          .update({
            cliente_atual_id: null,
            cliente_atual_nome: null,
            cliente_atual_cidade: null,
            cliente_atual_endereco: null,
            status: 'Recolhido',
            updated_at: now
          });
      } else if (mov.tipo_solicitacao === 'Adesivar') {
        await db('equipamentos_patrimonio')
          .where({ patrimonio: mov.patrimonio })
          .update({
            status: 'Instalado',
            updated_at: now
          });
      } else if (mov.tipo_solicitacao === 'Troca') {
        // Antigo -> Desinstalado/Disponível
        await db('equipamentos_patrimonio')
          .where({ patrimonio: mov.patrimonio })
          .update({
            cliente_atual_id: null,
            cliente_atual_nome: null,
            cliente_atual_cidade: null,
            cliente_atual_endereco: null,
            status: 'Recolhido',
            updated_at: now
          });

        // Novo -> Instalado no cliente
        await db('equipamentos_patrimonio')
          .where({ patrimonio: mov.patrimonio_novo })
          .update({
            cliente_atual_id: clientFields.cliente_atual_id,
            cliente_atual_nome: clientFields.cliente_atual_name,
            cliente_atual_cidade: clientFields.cliente_atual_cidade,
            cliente_atual_endereco: clientFields.cliente_atual_endereco,
            status: 'Instalado',
            updated_at: now
          });
      }
    } else if (status === 'Reprovado') {
      // Se for reprovado, marca status do patrimônio como Disponível / Pendente
      const pCode = (mov.tipo_solicitacao === 'Troca') ? mov.patrimonio : (mov.patrimonio || mov.patrimonio_novo);
      if (pCode) {
        await db('equipamentos_patrimonio')
          .where({ patrimonio: pCode })
          .update({
            status: 'Pendente - Reprovado',
            updated_at: now
          });
      }
    }

    // Simulação de Notificação por E-mail
    try {
      const emailConfig = fs.existsSync(configFilePath) ? JSON.parse(fs.readFileSync(configFilePath, 'utf8')) : { emails: 'notificacoes@distribuidorajds.com.br, equipamentos@distribuidorajds.com.br' };
      console.log(`[NOTIFICAÇÃO EMAIL] Movimentação ID ${id} foi ${status} por ${req.user.id || 'Gestor'}. Notificação enviada para: ${emailConfig.emails} e solicitante: ${mov.vendedor_solicitante}`);
    } catch (err) {
      console.error('Erro ao gerar log de notificação por e-mail:', err);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao processar aprovação de movimentação' });
  }
});

// Gerenciamento de e-mails para notificações
app.get('/api/equipamentos/config/emails', (req, res) => {
  try {
    if (fs.existsSync(configFilePath)) {
      const data = fs.readFileSync(configFilePath, 'utf8');
      return res.json(JSON.parse(data));
    }
  } catch (err) {
    console.error(err);
  }
  // Fallback padrão
  res.json({ emails: 'notificacoes@distribuidorajds.com.br, equipamentos@distribuidorajds.com.br' });
});

app.post('/api/equipamentos/config/emails', (req, res) => {
  const { emails } = req.body;
  try {
    fs.writeFileSync(configFilePath, JSON.stringify({ emails }), 'utf8');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar configuração de e-mails' });
  }
});

// --- User Management Endpoints ---

// Dados atualizados do usuário logado
app.get('/api/me', async (req, res) => {
  try {
    const user = await db('usuarios').where({ id: req.user.id }).first();
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (user.status === 'INATIVO') return res.status(403).json({ error: 'Usuário inativo ou excluído.' });
    if (user.status === 'AGUARDANDO LIBERAÇÃO') return res.status(403).json({ error: 'Acesso aguarda aprovação gerencial.' });
    res.json({
      id: user.id,
      name: user.name,
      username: user.username,
      profile: user.profile,
      unitId: user.unitId,
      status: user.status,
      permissions: JSON.parse(user.permissions || '[]'),
      email: user.email || '',
      phone: user.phone || '',
      photo: user.photo || '',
      empresa_id: user.empresa_id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar usuário logado' });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { username, password, empresa_id } = req.body;
  if (!username || !password || !empresa_id) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }

  try {
    const loginKey = String(username).trim().toLowerCase();
    
    // 1. Tenta achar o usuário com username/email, empresa_id e senha corretos
    let user = await db('usuarios')
      .where(function() {
        this.where('username', loginKey)
            .orWhere('email', loginKey);
      })
      .andWhere({ empresa_id, password })
      .first();

    // 2. Se a empresa teve nome/CNPJ alterado, localiza pelo login/senha em qualquer empresa (usa a empresa real do cadastro)
    if (!user) {
      user = await db('usuarios')
        .where(function() {
          this.where('username', loginKey)
              .orWhere('email', loginKey);
        })
        .andWhere({ password })
        .first();
    }

    // 3. Se ainda assim não encontrou (senha incorreta ou usuário inexistente), 
    // busca apenas pelo login para poder retornar o status correto ou o erro de senha
    if (!user) {
      user = await db('usuarios')
        .where(function() {
          this.where('username', loginKey)
              .orWhere('email', loginKey);
        })
        .andWhere({ empresa_id })
        .first();

      if (!user) {
        user = await db('usuarios')
          .where(function() {
            this.where('username', loginKey)
                .orWhere('email', loginKey);
          })
          .first();
      }

      if (!user || user.password !== password) {
        return res.status(401).json({ error: 'E-mail, usuário ou senha incorretos' });
      }
    }

    if (user.status === 'AGUARDANDO LIBERAÇÃO') {
      return res.status(403).json({ error: 'Acesso aguarda aprovação gerencial.' });
    }
    if (user.status === 'INATIVO') {
      return res.status(403).json({ error: 'Usuário inativo ou excluído.' });
    }

    const token = jwt.sign({
      id: user.id,
      name: user.name,
      username: user.username,
      profile: user.profile,
      unitId: user.unitId,
      empresa_id: user.empresa_id,
      permissions: JSON.parse(user.permissions || '[]')
    }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        profile: user.profile,
        unitId: user.unitId,
        status: user.status,
        permissions: JSON.parse(user.permissions || '[]'),
        email: user.email || '',
        phone: user.phone || '',
        photo: user.photo || '',
        empresa_id: user.empresa_id
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao processar login' });
  }
});

// Register / Create User
app.post('/api/usuarios', async (req, res) => {
  const { id, name, username, password, profile, unitId, email, phone, photo } = req.body;
  
  const actor = req.user || {};
  const actorPerms = actor.permissions || [];
  const canManageUsers = actor.profile === 'Administrador' || actorPerms.includes('Administrador') || actorPerms.includes('Usuários');
  if (!canManageUsers) {
    return res.status(403).json({ error: 'Acesso negado: você não tem permissão para cadastrar usuários.' });
  }

  const companyId = req.user.empresa_id;

  if (!name || !username || !password || !profile || !unitId) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }

  try {
    // Check if username already exists for company
    const existing = await db('usuarios')
      .where({ username: username.toLowerCase(), empresa_id: companyId })
      .first();

    if (existing) {
      return res.status(400).json({ error: 'Este nome de usuário já está cadastrado nesta empresa.' });
    }

    const userId = id || 'usr-' + Date.now();
    const newUser = {
      id: userId,
      name,
      username: username.toLowerCase(),
      password,
      profile,
      unitId,
      email: email || '',
      phone: phone || '',
      photo: photo || '',
      status: 'AGUARDANDO LIBERAÇÃO', // Always aguardando liberação initially
      empresa_id: companyId,
      permissions: '[]',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await db('usuarios').insert(newUser);

    // Auditoria
    await db('auditoria_logs').insert({
      usuario_id: req.user.id || 'sistema',
      acao: 'SOLICITOU_ACESSO',
      detalhes: `Novo usuário ${name} (${username}) solicitou acesso e aguarda liberação.`,
      empresa_id: companyId
    });

    res.json({ success: true, user: { id: userId, name, username, status: 'AGUARDANDO LIBERAÇÃO' } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar usuário' });
  }
});

// List Users
app.get('/api/usuarios', async (req, res) => {
  const companyId = (req.user && req.user.empresa_id) || req.header('X-Company-Id') || '001';

  try {
    const actor = req.user || {};
    const actorPerms = actor.permissions || [];
    const isActorAdmin = actor.profile === 'Administrador' || actorPerms.includes('Administrador');
    const canViewUsersList = isActorAdmin || actorPerms.includes('Usuários');

    let query = db('usuarios');

    if (!isActorAdmin) {
      query = query.where({ empresa_id: companyId });

      // Administrador enxerga todos os usuários da empresa, mesmo que ele esteja vinculado a uma unidade.
      // Usuário comum continua preso somente à própria unidade.
      if (!canViewUsersList && actor.unitId && actor.unitId !== 'all') {
        query = query.where({ unitId: actor.unitId });
      }
    }

    const list = await query.orderBy('name', 'asc');

    const mapped = list.map(u => ({
      id: u.id,
      name: u.name,
      username: u.username,
      profile: u.profile,
      role: u.profile, // alias
      tipo: u.profile, // alias
      user_type: u.profile, // alias
      unitId: u.unitId,
      unit_id: u.unitId, // alias
      status: u.status,
      permissions: JSON.parse(u.permissions || '[]'),
      email: u.email || '',
      phone: u.phone || '',
      photo: u.photo || '',
      empresa_id: u.empresa_id,
      company_id: u.empresa_id // alias
    }));

    res.json(mapped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

app.get('/api/usuarios/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const actor = req.user || {};
    const actorPerms = actor.permissions || [];
    const isActorAdmin = actor.profile === 'Administrador' || actorPerms.includes('Administrador');
    const canManageUsers = isActorAdmin || actorPerms.includes('Usuários');

    let user = await db('usuarios').where({ id }).first();

    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (!canManageUsers && actor.id !== id && actor.unitId !== 'all' && user.unitId !== actor.unitId) {
      return res.status(403).json({ error: 'Acesso negado ao usuário solicitado' });
    }

    let linked_users = [];
    if (user.profile === 'Supervisor') {
      const links = await db('user_hierarchy_links')
        .where({
          company_id: user.empresa_id,
          parent_user_id: id,
          relation_type: 'supervisor_seller'
        });
      linked_users = links.map(l => l.child_user_id);
    } else if (user.profile === 'Gerente') {
      const links = await db('user_hierarchy_links')
        .where({
          company_id: user.empresa_id,
          parent_user_id: id
        })
        .whereIn('relation_type', ['manager_supervisor', 'manager_seller']);
      linked_users = links.map(l => l.child_user_id);
    }

    res.json({
      id: user.id,
      name: user.name,
      username: user.username,
      profile: user.profile,
      role: user.profile, // alias
      tipo: user.profile, // alias
      user_type: user.profile, // alias
      unitId: user.unitId,
      unit_id: user.unitId, // alias
      status: user.status,
      permissions: JSON.parse(user.permissions || '[]'),
      email: user.email || '',
      phone: user.phone || '',
      photo: user.photo || '',
      empresa_id: user.empresa_id,
      company_id: user.empresa_id, // alias
      linked_users
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar usuário' });
  }
});

// Update permissions & status
app.put('/api/usuarios/:id/permissions', async (req, res) => {
  const { id } = req.params;
  const { permissions, status, profile, unitId, name, username, email, phone, password, photo, empresa_id, linked_users } = req.body;

  try {
    let userToEdit = await db('usuarios').where({ id }).first();
    if (!userToEdit) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const originalEmpresaId = userToEdit.empresa_id;

    const updatedData = {
      updated_at: new Date().toISOString()
    };

    if (permissions !== undefined) {
      updatedData.permissions = JSON.stringify(permissions);
    }
    if (status !== undefined) {
      updatedData.status = status;
    }
    if (profile !== undefined) {
      updatedData.profile = profile;
    }
    if (unitId !== undefined) {
      updatedData.unitId = (profile === 'Administrador' && !unitId) ? 'all' : unitId;
    }
    if (name !== undefined) {
      updatedData.name = name;
    }
    if (username !== undefined) {
      const cleanUsername = String(username).trim().toLowerCase();
      if (!cleanUsername) {
        return res.status(400).json({ error: 'Login do usuário é obrigatório' });
      }
      const targetEmpresa = empresa_id !== undefined ? empresa_id : originalEmpresaId;
      const existingUsername = await db('usuarios')
        .where({ username: cleanUsername, empresa_id: targetEmpresa })
        .whereNot({ id })
        .first();
      if (existingUsername) {
        return res.status(409).json({ error: 'Já existe outro usuário com este login nesta empresa' });
      }
      updatedData.username = cleanUsername;
    }
    if (email !== undefined) {
      updatedData.email = email;
    }
    if (phone !== undefined) {
      updatedData.phone = phone;
    }
    if (password !== undefined) {
      updatedData.password = password;
    }
    if (photo !== undefined) {
      updatedData.photo = photo;
    }
    if (empresa_id !== undefined) {
      updatedData.empresa_id = empresa_id;
    }

    await db('usuarios').where({ id }).update(updatedData);

    // Update hierarchy links if linked_users is provided and profile is Supervisor or Gerente
    const targetProfile = profile !== undefined ? profile : userToEdit.profile;
    const targetEmpresa = empresa_id !== undefined ? empresa_id : originalEmpresaId;

    if (profile !== undefined && profile !== userToEdit.profile) {
      // Clean up all parent links for this user to avoid orphan links when profile changes
      await db('user_hierarchy_links')
        .where({ parent_user_id: id })
        .del();
    }

    if (linked_users !== undefined && (targetProfile === 'Supervisor' || targetProfile === 'Gerente')) {
      const relationType = targetProfile === 'Supervisor' ? 'supervisor_seller' : 'manager_supervisor';
      
      // Validate that all children exist and belong to the same company
      if (linked_users.length > 0) {
        const children = await db('usuarios')
          .whereIn('id', linked_users)
          .andWhere({ empresa_id: targetEmpresa });
          
        if (children.length !== linked_users.length) {
          return res.status(400).json({ error: 'Um ou mais usuários selecionados são inválidos ou pertencem a outra empresa.' });
        }
      }

      // Delete existing parent links
      if (targetProfile === 'Supervisor') {
        await db('user_hierarchy_links')
          .where({
            company_id: targetEmpresa,
            parent_user_id: id,
            relation_type: 'supervisor_seller'
          })
          .del();
      } else if (targetProfile === 'Gerente') {
        await db('user_hierarchy_links')
          .where({ company_id: targetEmpresa, parent_user_id: id })
          .whereIn('relation_type', ['manager_supervisor', 'manager_seller'])
          .del();
      }

      // Insert new links
      if (linked_users.length > 0) {
        // Fetch children to verify profiles
        const children = await db('usuarios')
          .whereIn('id', linked_users)
          .andWhere({ empresa_id: targetEmpresa });

        if (children.length !== linked_users.length) {
          return res.status(400).json({ error: 'Um ou mais usuários selecionados são inválidos ou pertencem a outra empresa.' });
        }

        const linksToInsert = children.map(child => {
          let relationType = 'supervisor_seller';
          if (targetProfile === 'Gerente') {
            relationType = child.profile === 'Supervisor' ? 'manager_supervisor' : 'manager_seller';
          }
          return {
            company_id: targetEmpresa,
            parent_user_id: id,
            child_user_id: child.id,
            relation_type: relationType,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        });

        await db('user_hierarchy_links').insert(linksToInsert);
      }
    }

    // Auditoria
    let auditDetails = `Usuário ${userToEdit.name} (${userToEdit.username}) atualizado por ${req.user.name || req.user.id}. `;
    if (status && status !== userToEdit.status) {
      auditDetails += `Status alterado de ${userToEdit.status} para ${status} (LIBEROU_ACESSO). `;
    }
    if (permissions) {
      auditDetails += `Permissões concedidas: [${permissions.join(', ')}].`;
    }

    await db('auditoria_logs').insert({
      usuario_id: req.user.id,
      acao: (status && status !== userToEdit.status && status === 'LIBERADO') ? 'LIBEROU_ACESSO' : 'CONCEDEU_PERMISSOES',
      detalhes: auditDetails,
      empresa_id: originalEmpresaId
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar permissões e status do usuário' });
  }
});


// Delete user permanently
app.delete('/api/usuarios/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const actor = req.user || {};
    const actorPerms = actor.permissions || [];
    const isActorAdmin = actor.profile === 'Administrador' || actorPerms.includes('Administrador');
    const canManageUsers = isActorAdmin || actorPerms.includes('Usuários');

    if (!canManageUsers) {
      return res.status(403).json({ error: 'Apenas administrador pode excluir usuários' });
    }

    if (actor.id === id) {
      return res.status(400).json({ error: 'Você não pode excluir o próprio usuário logado' });
    }

    let userToDelete = await db('usuarios').where({ id }).first();
    if (!userToDelete) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const originalEmpresaId = userToDelete.empresa_id;

    if (userToDelete.profile === 'Administrador') {
      const admins = await db('usuarios')
        .where({ empresa_id: originalEmpresaId, profile: 'Administrador' })
        .whereNot({ id });
      if (admins.length <= 1) {
        return res.status(400).json({ error: 'Não é permitido excluir o último administrador da empresa' });
      }
    }

    // Exclusão permanente da tabela de usuários. Os históricos continuam salvos nas tabelas antigas pelo nome/id gravado.
    await db('usuarios').where({ id }).del();

    await db('auditoria_logs').insert({
      usuario_id: actor.id,
      acao: 'EXCLUIU_USUARIO',
      detalhes: `Usuário ${userToDelete.name} (${userToDelete.username}) excluído permanentemente por ${actor.name || actor.id}.`,
      empresa_id: originalEmpresaId
    }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir usuário' });
  }
});

// --- Despesas de Campo Endpoints ---

// Register new field expense
app.post('/api/despesas-reembolsos', async (req, res) => {
  const {
    date,
    time,
    finalidade,
    operacao,
    descreva,
    veiculo,
    km,
    foto_odometro,
    foto_comprovante,
    value,
    observation,
    unitId,
    userId
  } = req.body;

  const id = 'DP-' + Math.floor(100 + Math.random() * 900) + '-' + Date.now().toString().slice(-4);
  const empresa_id = req.user.empresa_id;

  try {
    const newRecord = {
      id,
      empresa_id,
      userId: userId || req.user.id,
      unitId: unitId || 'all',
      date: date || new Date().toISOString().split('T')[0],
      time: time || new Date().toTimeString().split(' ')[0],
      finalidade,
      operacao,
      descreva: descreva || '',
      veiculo: veiculo || '',
      km: km ? parseInt(km, 10) : null,
      foto_odometro: foto_odometro || '',
      foto_comprovante: foto_comprovante || '',
      value: value ? parseFloat(value) : null,
      observation: observation || '',
      status: 'Pendente',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await db('despesas_reembolsos').insert(newRecord);

    // Auditoria
    await db('auditoria_logs').insert({
      usuario_id: req.user.id,
      acao: 'REGISTROU_DESPESA',
      detalhes: `Despesa de campo #${id} (${finalidade}) registrado por ${req.user.name || req.user.id} no valor de R$ ${(parseFloat(value || 0)).toFixed(2)}`,
      empresa_id
    });

    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao registrar despesa de campo' });
  }
});

// List travel expenses refunds
app.get('/api/despesas-reembolsos', async (req, res) => {
  try {
    const actorPerms = req.user.permissions || [];
    const isActorAdmin = req.user.profile === 'Administrador' || actorPerms.includes('Administrador');

    let query = db('despesas_reembolsos');

    if (!isActorAdmin) {
      query = query.where('empresa_id', req.user.empresa_id);

      // Apply unit isolation
      if (req.user.unitId && req.user.unitId !== 'all') {
        query = query.where('unitId', req.user.unitId);
      }

      const permittedIds = await getPermittedSellerIds(req.user, db);
      query = query.whereIn('userId', permittedIds);
    }

    const list = await query.orderBy('created_at', 'desc');
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar despesas de campo' });
  }
});

// Get detailed travel expense refund
app.get('/api/despesas-reembolsos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const record = await db('despesas_reembolsos')
      .where({ id, empresa_id: req.user.empresa_id })
      .first();

    if (!record) {
      return res.status(404).json({ error: 'Despesa não encontrada' });
    }

    const permittedSellerIds = await getPermittedSellerIds(req.user, db);
    const actorPerms = req.user.permissions || [];
    const isActorAdmin = req.user.profile === 'Administrador' || actorPerms.includes('Administrador');
    
    if (!isActorAdmin && !permittedSellerIds.map(String).includes(String(record.userId))) {
      return res.status(403).json({ error: 'Acesso negado: esta despesa está fora da sua cadeia de atendimento' });
    }

    res.json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao detalhar despesa de campo' });
  }
});

// Delete travel expense refund (only if pending and owner/admin)
app.delete('/api/despesas-reembolsos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const record = await db('despesas_reembolsos')
      .where({ id, empresa_id: req.user.empresa_id })
      .first();

    if (!record) {
      return res.status(404).json({ error: 'Despesa não encontrada' });
    }

    if (record.status !== 'Pendente') {
      return res.status(400).json({ error: 'Apenas despesas com status Pendente podem ser excluídas.' });
    }

    const isOwner = String(record.userId) === String(req.user.id);
    const actorPerms = req.user.permissions || [];
    const isAdmin = req.user.profile === 'Administrador' || actorPerms.includes('Administrador');
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Acesso negado: você não é o proprietário desta despesa' });
    }

    await db('despesas_reembolsos').where({ id }).delete();

    // Auditoria
    await db('auditoria_logs').insert({
      usuario_id: req.user.id,
      acao: 'EXCLUIU_DESPESA',
      detalhes: `Usuário ${req.user.name || req.user.id} excluiu comprovante de despesa #${id}`,
      empresa_id: req.user.empresa_id
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir despesa' });
  }
});

// Approve/Reject travel expense refund
app.put('/api/despesas-reembolsos/:id/approval', async (req, res) => {
  const { id } = req.params;
  const { status, observacao } = req.body; // status: Aprovado, Reprovado

  const allowed = ['Administrador', 'Supervisor', 'Financeiro'];
  if (!allowed.includes(req.user.profile) && !req.user.permissions.includes('Aprovação de Despesas')) {
    return res.status(403).json({ error: 'Sem permissão para aprovar despesas.' });
  }

  try {
    const record = await db('despesas_reembolsos')
      .where({ id, empresa_id: req.user.empresa_id })
      .first();

    if (!record) {
      return res.status(404).json({ error: 'Despesa não encontrada' });
    }

    const actorPerms = req.user.permissions || [];
    const isActorAdmin = req.user.profile === 'Administrador' || actorPerms.includes('Administrador');
    if (!isActorAdmin) {
      const permittedIds = await getPermittedSellerIds(req.user, db);
      if (!permittedIds.map(String).includes(String(record.userId))) {
        return res.status(403).json({ error: 'Acesso negado: esta despesa pertence a um vendedor fora da sua cadeia.' });
      }
    }

    await db('despesas_reembolsos').where({ id }).update({
      status,
      observation: observacao || '',
      updated_at: new Date().toISOString()
    });

    // Auditoria
    await db('auditoria_logs').insert({
      usuario_id: req.user.id,
      acao: status === 'Aprovado' ? 'APROVOU_DESPESA' : 'REPROVOU_DESPESA',
      detalhes: `Despesa de campo #${id} avaliada como ${status.toUpperCase()} por ${req.user.name || req.user.id}. Observação: "${observacao || '-'}"`,
      empresa_id: req.user.empresa_id
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao avaliar despesa de campo' });
  }
});

// GET Audit Logs
app.get('/api/auditoria', async (req, res) => {
  const companyId = (req.user && req.user.empresa_id) || '001';
  try {
    const list = await db('auditoria_logs')
      .where({ empresa_id: companyId })
      .orderBy('id', 'desc');
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar logs de auditoria' });
  }
});
// Function to get permitted seller IDs according to hierarchy and profile
async function getPermittedSellerIds(user, dbInstance) {
  const companyId = user.empresa_id || '001';
  const userId = user.id;
  const profile = user.profile;

  // 1. Vendedor sees only themselves
  if (profile === 'Vendedor') {
    return [String(userId)];
  }

  // 2. Supervisor sees sellers linked to them + themselves
  if (profile === 'Supervisor') {
    const links = await dbInstance('user_hierarchy_links')
      .where({
        company_id: companyId,
        parent_user_id: userId,
        relation_type: 'supervisor_seller'
      });
    const sellerIds = links.map(l => l.child_user_id);
    return [...new Set([String(userId), ...sellerIds.map(String)])];
  }

  // 3. Gerente sees supervisores linked to them, sellers linked directly, and sellers of those supervisores + themselves
  if (profile === 'Gerente') {
    const supervisorLinks = await dbInstance('user_hierarchy_links')
      .where({
        company_id: companyId,
        parent_user_id: userId,
        relation_type: 'manager_supervisor'
      });
    const supervisorIds = supervisorLinks.map(l => l.child_user_id);

    const directSellerLinks = await dbInstance('user_hierarchy_links')
      .where({
        company_id: companyId,
        parent_user_id: userId,
        relation_type: 'manager_seller'
      });
    const directSellerIds = directSellerLinks.map(l => l.child_user_id);
    
    let subSellerIds = [];
    if (supervisorIds.length > 0) {
      const sellerLinks = await dbInstance('user_hierarchy_links')
        .where({ company_id: companyId, relation_type: 'supervisor_seller' })
        .whereIn('parent_user_id', supervisorIds);
      subSellerIds = sellerLinks.map(l => l.child_user_id);
    }

    return [...new Set([String(userId), ...supervisorIds.map(String), ...directSellerIds.map(String), ...subSellerIds.map(String)])];
  }

  // 4. Administrador (or other profiles) sees all users of the company
  const companyUsers = await dbInstance('usuarios')
    .where({ empresa_id: companyId })
    .select('id');
  return companyUsers.map(u => String(u.id));
}


function safeJsonArray(value) {
  try {
    if (Array.isArray(value)) return value;
    return JSON.parse(value || '[]');
  } catch (_) {
    return [];
  }
}

function normalizeChamado(row) {
  if (!row) return row;
  return {
    ...row,
    parts: safeJsonArray(row.parts),
    services: safeJsonArray(row.services)
  };
}

async function applyHierarchyScope(query, user, ownerColumn, companyColumn = 'empresa_id') {
  const actorPerms = user.permissions || [];
  const isAdmin = user.profile === 'Administrador' || actorPerms.includes('Administrador');
  query.where(companyColumn, user.empresa_id || '001');
  if (!isAdmin) {
    const allowedIds = await getPermittedSellerIds(user, db);
    query.whereIn(ownerColumn, allowedIds);
  }
  return query;
}

// --- Chamados Mecânicos Endpoints ---
app.post('/api/chamados', async (req, res) => {
  try {
    const now = new Date();
    const body = req.body || {};
    const id = body.id || ('CH-' + Math.floor(100 + Math.random() * 900) + '-' + Date.now().toString().slice(-4));
    const ownerId = req.user.profile === 'Vendedor' ? req.user.id : (body.userId || req.user.id);
    const allowedOwnerIds = await getPermittedSellerIds(req.user, db);
    if (!allowedOwnerIds.map(String).includes(String(ownerId))) {
      return res.status(403).json({ error: 'Acesso negado: vendedor fora da sua cadeia de atendimento.' });
    }
    if (!body.equipmentSerial || !body.title) {
      return res.status(400).json({ error: 'Patrimônio e descrição do defeito são obrigatórios.' });
    }
    const record = {
      id,
      empresa_id: req.user.empresa_id || '001',
      unitId: body.unitId || req.user.unitId || 'all',
      userId: ownerId,
      equipmentSerial: String(body.equipmentSerial || '').trim(),
      equipmentType: body.equipmentType || '',
      client: body.client || '',
      fantasyName: body.fantasyName || '',
      city: body.city || '',
      address: body.address || '',
      title: body.title || '',
      priority: body.priority || 'Média',
      observations: body.observations || '',
      defectPhoto: body.defectPhoto || '',
      defectVideo: body.defectVideo || '',
      status: 'Aberto',
      mechanic: '',
      date: now.toLocaleDateString('pt-BR'),
      startTime: '',
      endTime: '',
      faultDescription: '',
      solutionDescription: '',
      eqStatusAfter: '',
      gasCharge: '',
      additionalNotes: '',
      parts: '[]',
      services: '[]',
      fotoAntes: '',
      fotoDepois: '',
      fotoPlaqueta: '',
      videoAtendimento: '',
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };
    await db('chamados_tecnicos').insert(record);
    await db('auditoria_logs').insert({
      usuario_id: req.user.id,
      acao: 'ABRIU_CHAMADO',
      detalhes: `Chamado mecânico ${id} aberto para o patrimônio ${record.equipmentSerial}.`,
      empresa_id: record.empresa_id
    }).catch(() => {});
    res.json({ success: true, id, chamado: normalizeChamado(record) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao abrir chamado mecânico' });
  }
});

app.get('/api/chamados', async (req, res) => {
  try {
    let query = db('chamados_tecnicos');
    query = await applyHierarchyScope(query, req.user, 'userId', 'empresa_id');
    if (req.query.unitId && req.query.unitId !== 'all') query.where('unitId', req.query.unitId);
    if (req.query.status) query.where('status', req.query.status);
    if (req.query.patrimonio) query.where('equipmentSerial', 'like', `%${req.query.patrimonio}%`);
    const list = await query.orderBy('created_at', 'desc');
    res.json(list.map(normalizeChamado));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar chamados mecânicos' });
  }
});

app.get('/api/chamados/:id', async (req, res) => {
  try {
    const chamado = await db('chamados_tecnicos').where({ id: req.params.id, empresa_id: req.user.empresa_id || '001' }).first();
    if (!chamado) return res.status(404).json({ error: 'Chamado não encontrado' });
    const allowedIds = await getPermittedSellerIds(req.user, db);
    const staff = ['Administrador', 'Responsável Equipamentos', 'Mecânico'].includes(req.user.profile);
    if (!staff && !allowedIds.includes(chamado.userId)) return res.status(403).json({ error: 'Acesso negado ao chamado' });
    res.json(normalizeChamado(chamado));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar chamado' });
  }
});

app.put('/api/chamados/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatus = ['Aberto', 'Em Atendimento', 'Resolvido', 'Cancelado'];
    if (!allowedStatus.includes(status)) return res.status(400).json({ error: 'Status inválido' });
    const chamado = await db('chamados_tecnicos').where({ id: req.params.id, empresa_id: req.user.empresa_id || '001' }).first();
    if (!chamado) return res.status(404).json({ error: 'Chamado não encontrado' });
    const staff = ['Administrador', 'Gerente', 'Supervisor', 'Responsável Equipamentos', 'Mecânico'].includes(req.user.profile);
    const allowedIds = await getPermittedSellerIds(req.user, db);
    if (!staff && !allowedIds.map(String).includes(String(chamado.userId))) return res.status(403).json({ error: 'Acesso negado' });
    const updates = { status, updated_at: new Date().toISOString() };
    if (status === 'Em Atendimento') {
      updates.mechanic = req.user.name || req.user.id;
      updates.startTime = new Date().toTimeString().slice(0,5);
      updates.date = new Date().toLocaleDateString('pt-BR');
    }
    await db('chamados_tecnicos').where({ id: req.params.id, empresa_id: req.user.empresa_id || '001' }).update(updates);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar status do chamado' });
  }
});

app.put('/api/chamados/:id/ficha', async (req, res) => {
  try {
    const chamado = await db('chamados_tecnicos').where({ id: req.params.id, empresa_id: req.user.empresa_id || '001' }).first();
    if (!chamado) return res.status(404).json({ error: 'Chamado não encontrado' });
    const staff = ['Administrador', 'Responsável Equipamentos', 'Mecânico'].includes(req.user.profile);
    if (!staff) return res.status(403).json({ error: 'Acesso negado: somente equipe técnica pode finalizar ficha.' });
    const b = req.body || {};
    await db('chamados_tecnicos').where({ id: req.params.id, empresa_id: req.user.empresa_id || '001' }).update({
      status: 'Resolvido',
      mechanic: b.mechanic || chamado.mechanic || req.user.name || req.user.id,
      endTime: b.endTime || '',
      faultDescription: b.faultDescription || '',
      solutionDescription: b.solutionDescription || '',
      eqStatusAfter: b.eqStatusAfter || '',
      gasCharge: b.gasCharge || '',
      additionalNotes: b.additionalNotes || '',
      parts: JSON.stringify(Array.isArray(b.parts) ? b.parts : []),
      services: JSON.stringify(Array.isArray(b.services) ? b.services : []),
      fotoAntes: b.fotoAntes || chamado.fotoAntes || '',
      fotoDepois: b.fotoDepois || chamado.fotoDepois || '',
      fotoPlaqueta: b.fotoPlaqueta || chamado.fotoPlaqueta || '',
      videoAtendimento: b.videoAtendimento || chamado.videoAtendimento || '',
      updated_at: new Date().toISOString()
    });
    await db('auditoria_logs').insert({
      usuario_id: req.user.id,
      acao: 'FINALIZOU_CHAMADO',
      detalhes: `Ficha técnica do chamado ${req.params.id} finalizada.`,
      empresa_id: req.user.empresa_id || '001'
    }).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar ficha técnica do chamado' });
  }
});

// --- Exchange Merchandise Simulator Endpoints ---

// 1. Bulk import/update exchange products
app.post('/api/exchange/products/bulk', async (req, res) => {
  const { products } = req.body;
  const companyId = (req.user && req.user.empresa_id) || '001';
  const unitId = req.header('X-Unit-Id') || 'all';

  if (!Array.isArray(products)) {
    return res.status(400).json({ error: 'Lista de produtos inválida.' });
  }

  try {
    for (const p of products) {
      const codigo = String(p.codigo).trim();
      if (!codigo) continue;

      const productData = {
        produto: p.produto || 'Sem nome',
        categoria: p.categoria || 'Outros',
        preco_total: parseFloat(p.preco_total) || 0,
        unidade: p.unidade || 'UN',
        quantidade_na_caixa: parseInt(p.quantidade_na_caixa, 10) || 1,
        valor_unitario: parseFloat(p.valor_unitario) || 0,
        active: true,
        updated_at: new Date().toISOString()
      };

      const existing = await db('exchange_products')
        .where({ company_id: companyId, unit_id: unitId, codigo })
        .first();

      if (existing) {
        await db('exchange_products')
          .where({ id: existing.id })
          .update(productData);
      } else {
        await db('exchange_products').insert({
          company_id: companyId,
          unit_id: unitId,
          codigo,
          created_at: new Date().toISOString(),
          ...productData
        });
      }
    }

    // Registrar auditoria
    await db('auditoria_logs').insert({
      usuario_id: req.user.id || 'sistema',
      acao: 'IMPORTOU_PRODUTOS_TROCA',
      detalhes: `Importação de planilhas de produtos de troca finalizada (${products.length} itens processados).`,
      empresa_id: companyId
    }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error('Erro na importação em lote:', err);
    res.status(500).json({ error: 'Erro ao importar produtos do simulador.' });
  }
});

// 2. Fetch all exchange products
app.get('/api/exchange/products', async (req, res) => {
  const companyId = (req.user && req.user.empresa_id) || '001';
  const unitId = req.header('X-Unit-Id') || (req.user && req.user.unitId) || 'all';

  try {
    let query = db('exchange_products')
      .where({ company_id: companyId, active: true });

    if (unitId && unitId !== 'all') {
      query = query.where(function() {
        this.where('unit_id', unitId).orWhere('unit_id', 'all');
      });
    }

    const list = await query.orderBy('produto', 'asc');
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar produtos do simulador.' });
  }
});

// 3. Register a new exchange simulation
app.post('/api/exchange/simulations', async (req, res) => {
  const { cliente_codigo, cliente_nome_fantasia, total, generated_message, items } = req.body;
  const companyId = (req.user && req.user.empresa_id) || '001';
  const sellerId = (req.user && req.user.id) || 'demo_user';

  if (!cliente_codigo || !cliente_nome_fantasia || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Dados da simulação inválidos ou incompletos.' });
  }

  try {
    const simulationId = await insertAndGetId('exchange_simulations', {
      company_id: companyId,
      seller_id: sellerId,
      cliente_codigo,
      cliente_nome_fantasia,
      total: parseFloat(total) || 0,
      generated_message,
      created_at: new Date().toISOString()
    });

    const itemsToInsert = items.map(it => ({
      simulation_id: simulationId,
      product_id: it.product_id || null,
      codigo: it.codigo,
      produto: it.produto,
      categoria: it.categoria || 'Outros',
      tipo: it.tipo, // caixa, fracionado
      quantidade: parseInt(it.quantidade, 10) || 0,
      valor_base: parseFloat(it.valor_base) || 0,
      total_item: parseFloat(it.total_item) || 0,
      created_at: new Date().toISOString()
    }));

    await db('exchange_simulation_items').insert(itemsToInsert);

    // Auditoria
    await db('auditoria_logs').insert({
      usuario_id: sellerId,
      acao: 'CRIOU_SIMULACAO_TROCA',
      detalhes: `Simulação de troca #${simulationId} criada para cliente ${cliente_nome_fantasia} (${cliente_codigo}). Total: R$ ${(parseFloat(total) || 0).toFixed(2)}`,
      empresa_id: companyId
    }).catch(() => {});

    res.json({ success: true, id: simulationId });
  } catch (err) {
    console.error('Erro ao salvar simulação:', err);
    res.status(500).json({ error: 'Erro ao salvar simulação de troca.' });
  }
});

// 4. Fetch simulations history (with profile permission filter)
app.get('/api/exchange/simulations', async (req, res) => {
  const companyId = (req.user && req.user.empresa_id) || '001';

  try {
    const permittedSellerIds = await getPermittedSellerIds(req.user, db);

    const list = await db('exchange_simulations')
      .join('usuarios', 'exchange_simulations.seller_id', '=', 'usuarios.id')
      .select('exchange_simulations.*', 'usuarios.name as seller_name')
      .where({ 'exchange_simulations.company_id': companyId })
      .whereIn('exchange_simulations.seller_id', permittedSellerIds)
      .orderBy('exchange_simulations.created_at', 'desc');

    res.json(list);
  } catch (err) {
    console.error('Erro ao buscar simulações:', err);
    res.status(500).json({ error: 'Erro ao buscar histórico de simulações.' });
  }
});

// 5. Fetch simulation detailed item list
app.get('/api/exchange/simulations/:id', async (req, res) => {
  const { id } = req.params;
  const companyId = (req.user && req.user.empresa_id) || '001';

  try {
    const sim = await db('exchange_simulations')
      .join('usuarios', 'exchange_simulations.seller_id', '=', 'usuarios.id')
      .select('exchange_simulations.*', 'usuarios.name as seller_name')
      .where('exchange_simulations.id', id)
      .andWhere('exchange_simulations.company_id', companyId)
      .first();

    if (!sim) {
      return res.status(404).json({ error: 'Simulação não encontrada.' });
    }

    // Access check using our permitted ids
    const permittedSellerIds = await getPermittedSellerIds(req.user, db);
    if (!permittedSellerIds.includes(sim.seller_id)) {
      return res.status(403).json({ error: 'Acesso negado: você não tem permissão para visualizar esta simulação.' });
    }

    const items = await db('exchange_simulation_items').where({ simulation_id: id });
    res.json({ ...sim, items });
  } catch (err) {
    console.error('Erro ao carregar detalhes da simulação:', err);
    res.status(500).json({ error: 'Erro ao carregar detalhes da simulação.' });
  }
});// Client ficha route
const clientesRoutes = require('./routes/clientes');
app.use(clientesRoutes);

// Fallback do frontend para domínio: qualquer rota não /api abre o index.html.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(FRONTEND_ROOT, 'index.html'));
});

const PORT = process.env.PORT || 3001;
(async () => {
  try {
    await initDb();
    app.listen(PORT, () => console.log(`Backend rodando em http://localhost:${PORT}`));
  } catch (err) {
    console.error('FATAL: Database connection/migration failed. Server will not start.', err);
    process.exit(1);
  }
})();

