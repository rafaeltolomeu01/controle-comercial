const express = require('express');
function ccNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === '') return 0;
  let raw = String(v).trim().replace(/[^0-9,.-]/g, '');
  // Formato brasileiro com vírgula decimal: 1.234,56 -> 1234.56
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}
function getBrasiliaDateTime() {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const timeStr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
  return { date: dateStr, time: timeStr, iso: now.toISOString() };
}
function isFilterValValid(val) {
  if (val === undefined || val === null) return false;
  const s = String(val).trim();
  if (s === '' || s.toLowerCase() === 'todos' || s.toLowerCase() === 'todas' || s.toLowerCase() === 'all' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') {
    return false;
  }
  return true;
}

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

let runtimeVapidKeys = null;
function getVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, runtime: false };
  }
  try {
    const webpush = require('web-push');
    if (!runtimeVapidKeys) {
      runtimeVapidKeys = webpush.generateVAPIDKeys();
      console.warn('Push: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas. Usando chaves temporárias; configure no Render para manter as inscrições após reiniciar.');
    }
    return { ...runtimeVapidKeys, runtime: true };
  } catch (_) {
    return { publicKey: '', privateKey: '', runtime: true };
  }
}
async function logPushEvent(row) {
  try {
    if (await db.schema.hasTable('push_logs')) {
      await db('push_logs').insert({
        empresa_id: row.empresa_id || '001',
        user_id: row.user_id ? String(row.user_id) : null,
        subscription_id: row.subscription_id || null,
        status: row.status || 'info',
        title: row.title || null,
        error: row.error || null,
        created_at: new Date().toISOString()
      });
    }
  } catch (_) {}
}

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

  // Auditoria e exclusão lógica para movimentações de equipamento
  if (await db.schema.hasTable('equipamentos_movimentacoes')) {
    const movAuditCols = [
      ['excluido', t => t.boolean('excluido').notNullable().defaultTo(false)],
      ['excluido_em', t => t.timestamp('excluido_em').nullable()],
      ['excluido_por', t => t.string('excluido_por').nullable()],
      ['motivo_exclusao', t => t.text('motivo_exclusao').nullable()],
      ['aprovado_por', t => t.string('aprovado_por').nullable()],
      ['aprovado_em', t => t.timestamp('aprovado_em').nullable()]
    ];
    for (const [col, add] of movAuditCols) {
      const exists = await db.schema.hasColumn('equipamentos_movimentacoes', col);
      if (!exists) {
        await db.schema.table('equipamentos_movimentacoes', table => add(table));
      }
    }
  }

  const hasDeletionAudit = await db.schema.hasTable('historico_exclusoes');
  if (!hasDeletionAudit) {
    await db.schema.createTable('historico_exclusoes', table => {
      table.increments('id').primary();
      table.string('modulo').notNullable();
      table.string('registro_id').notNullable();
      table.text('dados_json').nullable();
      table.string('criado_por').nullable();
      table.string('excluido_por').nullable();
      table.text('motivo').nullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
  }

  // Registro permanente de auditoria do sistema. Não existe rota de apagar esses registros.
  // Mantém compatibilidade com bancos antigos que já tinham auditoria_logs pela migration.
  if (!await db.schema.hasTable('auditoria_logs')) {
    await db.schema.createTable('auditoria_logs', table => {
      table.increments('id').primary();
      table.string('usuario_id').nullable();
      table.string('acao').notNullable();
      table.text('detalhes').notNullable();
      table.string('empresa_id').notNullable();
      table.string('modulo').nullable();
      table.string('registro_id').nullable();
      table.text('dados_antes_json').nullable();
      table.text('dados_depois_json').nullable();
      table.string('ip').nullable();
      table.text('user_agent').nullable();
      table.timestamps(true, true);
    });
  } else {
    const auditColumns = {
      modulo: t => t.string('modulo').nullable(),
      registro_id: t => t.string('registro_id').nullable(),
      dados_antes_json: t => t.text('dados_antes_json').nullable(),
      dados_depois_json: t => t.text('dados_depois_json').nullable(),
      ip: t => t.string('ip').nullable(),
      user_agent: t => t.text('user_agent').nullable()
    };
    for (const [col, addColumn] of Object.entries(auditColumns)) {
      const exists = await db.schema.hasColumn('auditoria_logs', col);
      if (!exists) await db.schema.table('auditoria_logs', table => addColumn(table));
    }
  }

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
  const hasSupervisorId = await db.schema.hasColumn('usuarios', 'supervisor_id');
  if (!hasSupervisorId) {
    await db.schema.table('usuarios', table => {
      table.string('supervisor_id').nullable();
    });
    console.log('Database: Coluna supervisor_id adicionada à tabela usuarios.');
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
  }

  // Forçar correção de valores em centavos para decimais na tabela despesas_reembolsos
  try {
    const rowsToFix = await db('despesas_reembolsos').select('id', 'value');
    for (const row of rowsToFix) {
      if (row.value !== null && row.value !== undefined) {
        const val = Number(row.value);
        if (Number.isInteger(val) && val >= 1000) {
          await db('despesas_reembolsos')
            .where('id', row.id)
            .update({ value: val / 100 });
          console.log(`Database: Corrigido valor da despesa ${row.id} de ${val} para ${val / 100}`);
        }
      }
    }
  } catch (err) {
    console.error('Database: Erro ao forçar correção de valores de despesas:', err);
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
      table.string('cliente_vendedor').nullable();
      table.decimal('total', 10, 2).notNullable().defaultTo(0);
      table.text('generated_message').nullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Database: Tabela exchange_simulations criada com sucesso.');
  } else {
    const hasClienteVendedor = await db.schema.hasColumn('exchange_simulations', 'cliente_vendedor');
    if (!hasClienteVendedor) {
      await db.schema.table('exchange_simulations', table => {
        table.string('cliente_vendedor').nullable();
      });
      console.log('Database: Coluna cliente_vendedor adicionada à tabela exchange_simulations.');
    }
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


  // 7A. Tabela de arquivos enviados. No Render Free não existe disco persistente confiável,
  // então guardamos o arquivo no PostgreSQL e servimos por URL /api/uploads/:id.
  const hasUploads = await db.schema.hasTable('app_uploads');
  if (!hasUploads) {
    await db.schema.createTable('app_uploads', table => {
      table.string('id').primary();
      table.string('empresa_id').notNullable();
      table.string('user_id').nullable();
      table.string('module').nullable();
      table.string('filename').nullable();
      table.string('mime_type').notNullable();
      table.text('data_base64').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Database: Tabela app_uploads criada com sucesso.');
  }


  // 7AA. Notificações internas e inscrições Push/PWA por usuário/dispositivo.
  if (!await db.schema.hasTable('app_notifications')) {
    await db.schema.createTable('app_notifications', table => {
      table.increments('id').primary();
      table.string('empresa_id').notNullable().defaultTo('001');
      table.string('user_id').notNullable();
      table.string('module').notNullable();
      table.string('record_id').nullable();
      table.string('title').notNullable();
      table.text('body').nullable();
      table.string('target_hash').nullable();
      table.boolean('read').notNullable().defaultTo(false);
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Database: Tabela app_notifications criada com sucesso.');
  }
  if (!await db.schema.hasTable('push_subscriptions')) {
    await db.schema.createTable('push_subscriptions', table => {
      table.increments('id').primary();
      table.string('empresa_id').notNullable().defaultTo('001');
      table.string('user_id').notNullable();
      table.text('endpoint').notNullable();
      table.text('keys_json').nullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
      table.unique(['user_id', 'endpoint']);
    });
    console.log('Database: Tabela push_subscriptions criada com sucesso.');
  }
  const pushSubCols = await db('push_subscriptions').columnInfo().catch(() => ({}));
  if (!pushSubCols.device_info) await db.schema.table('push_subscriptions', table => table.text('device_info').nullable());
  if (!pushSubCols.user_agent) await db.schema.table('push_subscriptions', table => table.text('user_agent').nullable());
  if (!pushSubCols.permission) await db.schema.table('push_subscriptions', table => table.string('permission').nullable());
  if (!pushSubCols.last_success_at) await db.schema.table('push_subscriptions', table => table.timestamp('last_success_at').nullable());
  if (!pushSubCols.last_error) await db.schema.table('push_subscriptions', table => table.text('last_error').nullable());
  if (!await db.schema.hasTable('push_logs')) {
    await db.schema.createTable('push_logs', table => {
      table.increments('id').primary();
      table.string('empresa_id').notNullable().defaultTo('001');
      table.string('user_id').nullable();
      table.integer('subscription_id').nullable();
      table.string('status').notNullable().defaultTo('info');
      table.string('title').nullable();
      table.text('error').nullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Database: Tabela push_logs criada com sucesso.');
  }

  // 7B. Tabela real de prospecções/leads.
  const hasProspeccoes = await db.schema.hasTable('prospeccoes');
  if (!hasProspeccoes) {
    await db.schema.createTable('prospeccoes', table => {
      table.string('id').primary();
      table.string('empresa_id').notNullable();
      table.string('unitId').notNullable().defaultTo('all');
      table.string('userId').notNullable();
      table.string('user_id').notNullable();
      table.string('name').nullable();
      table.string('contact').nullable();
      table.string('phone').nullable();
      table.string('city').nullable();
      table.string('neighborhood').nullable();
      table.string('address').nullable();
      table.string('number').nullable();
      table.string('zipcode').nullable();
      table.string('category').nullable();
      table.string('competitor').nullable();
      table.text('observation').nullable();
      table.text('photo').nullable();
      table.string('status').notNullable().defaultTo('prospectado');
      table.string('lossReason').nullable();
      table.string('hasCnpj').notNullable().defaultTo('false');
      table.string('cnpj').nullable();
      table.string('razaoSocial').nullable();
      table.string('nomeFantasia').nullable();
      table.string('cnaePrincipal').nullable();
      table.string('cnaeDescricao').nullable();
      table.string('date').nullable();
      table.string('time').nullable();
      table.timestamp('createdAt').defaultTo(db.fn.now());
      table.timestamps(true, true);
    });
    console.log('Database: Tabela prospeccoes criada com sucesso.');
  } else {
    const prospectColumns = {
      empresa_id: t => t.string('empresa_id').notNullable().defaultTo('001'),
      unitId: t => t.string('unitId').notNullable().defaultTo('all'),
      userId: t => t.string('userId').notNullable().defaultTo('demo_user'),
      user_id: t => t.string('user_id').notNullable().defaultTo('demo_user'),
      name: t => t.string('name').nullable(),
      contact: t => t.string('contact').nullable(),
      phone: t => t.string('phone').nullable(),
      city: t => t.string('city').nullable(),
      neighborhood: t => t.string('neighborhood').nullable(),
      address: t => t.string('address').nullable(),
      number: t => t.string('number').nullable(),
      zipcode: t => t.string('zipcode').nullable(),
      category: t => t.string('category').nullable(),
      competitor: t => t.string('competitor').nullable(),
      observation: t => t.text('observation').nullable(),
      photo: t => t.text('photo').nullable(),
      status: t => t.string('status').notNullable().defaultTo('prospectado'),
      lossReason: t => t.string('lossReason').nullable(),
      hasCnpj: t => t.string('hasCnpj').notNullable().defaultTo('false'),
      cnpj: t => t.string('cnpj').nullable(),
      razaoSocial: t => t.string('razaoSocial').nullable(),
      nomeFantasia: t => t.string('nomeFantasia').nullable(),
      cnaePrincipal: t => t.string('cnaePrincipal').nullable(),
      cnaeDescricao: t => t.string('cnaeDescricao').nullable(),
      date: t => t.string('date').nullable(),
      time: t => t.string('time').nullable(),
      createdAt: t => t.timestamp('createdAt').defaultTo(db.fn.now())
    };
    for (const [col, addColumn] of Object.entries(prospectColumns)) {
      const exists = await db.schema.hasColumn('prospeccoes', col);
      if (!exists) {
        await db.schema.table('prospeccoes', table => addColumn(table));
        console.log(`Database: Coluna ${col} adicionada à tabela prospeccoes.`);
      }
    }
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
      table.string('clientCode').nullable();
      table.string('clientSeller').nullable();
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
      clientCode: t => t.string('clientCode').nullable(),
      clientSeller: t => t.string('clientSeller').nullable(),
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


  // 7C. Equipamentos importados para preenchimento automatico das movimentacoes.
  const hasEquipamentosImportados = await db.schema.hasTable('equipamentos_importados');
  if (!hasEquipamentosImportados) {
    await db.schema.createTable('equipamentos_importados', table => {
      table.increments('id').primary();
      table.string('empresa_id').notNullable().defaultTo('001');
      table.string('unitId').notNullable().defaultTo('all');
      table.string('codigo_equipamento').notNullable();
      table.string('nome_equipamento').notNullable();
      table.string('empresa_nome').nullable();
      table.string('criado_por').nullable();
      table.string('atualizado_por').nullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
      table.unique(['empresa_id', 'unitId', 'codigo_equipamento']);
    });
    console.log('Database: Tabela equipamentos_importados criada com sucesso.');
  } else {
    // Garante as colunas da planilha do cliente em equipamentos_importados
    for (const col of ['nr_contrato', 'dt_emissao', 'patrimonio', 'marca', 'nr_patrimonio']) {
      if (!await db.schema.hasColumn('equipamentos_importados', col)) {
        await db.schema.table('equipamentos_importados', table => table.string(col).nullable());
        console.log(`Database: Coluna ${col} adicionada à tabela equipamentos_importados.`);
      }
    }
  }

  // 8. Create app_kv_store table (cache central do frontend no PostgreSQL)
  // Guarda listas/configurações que ainda são renderizadas no front para ficarem rápidas no celular,
  // mas também persistidas no banco por empresa.
  const hasAppKvStore = await db.schema.hasTable('app_kv_store');
  if (!hasAppKvStore) {
    await db.schema.createTable('app_kv_store', function(table) {
      table.increments('id').primary();
      table.string('company_id').notNullable();
      table.string('store_key').notNullable();
      table.text('data_json').notNullable().defaultTo('[]');
      table.string('updated_by').nullable();
      table.timestamps(true, true);
      table.unique(['company_id', 'store_key']);
    });
    console.log('Database: Tabela app_kv_store criada com sucesso.');
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

// File filter (only allow images, spreadsheets and safe documents)
const fileFilter = (req, file, cb) => {
  const allowedExts = /jpeg|jpg|png|gif|pdf|docx|xlsx|xls|csv|txt/;
  const isExtValid = allowedExts.test(path.extname(file.originalname).toLowerCase());

  if (isExtValid) {
    return cb(null, true);
  }
  cb(new Error('Tipo de arquivo não permitido. Apenas imagens e documentos (PDF, DOCX, XLSX, XLS, CSV) são aceitos.'));
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Servir arquivos estáticos da pasta uploads
const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(UPLOADS_ROOT));

app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_ROOT, 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(FRONTEND_ROOT, 'index.html'));
});

app.get('/api/system-diag', async (req, res) => {
  try {
    const dbType = db.client.config.client;
    const migrations = await db('knex_migrations').select('*');
    const sampleDespesas = await db('despesas_reembolsos')
      .select('id', 'value', 'finalidade', 'date', 'status', 'created_at')
      .orderBy('created_at', 'desc')
      .limit(50);
    const data = {
      dbType,
      migrations,
      sampleDespesas,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT
      }
    };
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real JWT Authentication Middleware
app.use(async (req, res, next) => {
  const publicPaths = ['/api/login', '/api/usuarios/login', '/api/usuarios/register'];
  const isFrontendFile = req.path === '/' || req.path === '/index.html' || req.path === '/manifest.json' || req.path === '/sw.js' || req.path.startsWith('/css/') || req.path.startsWith('/js/') || req.path.startsWith('/pages/') || req.path.startsWith('/assets/') || req.path.startsWith('/icon');
  // Permite abrir imagens já salvas sem login, mas protege o POST de upload.
  // Antes o startsWith('/api/uploads/') liberava também /api/uploads/base64,
  // deixando req.user indefinido e quebrando o salvamento das fotos.
  if (isFrontendFile || (req.method === 'GET' && req.path.startsWith('/api/uploads/'))) return next();
  
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


// Proxy de CNPJ. Consulta BrasilAPI com fallback para ReceitaWS para evitar bloqueio de CORS e instabilidade.
app.get('/api/cnpj/:cnpj', async (req, res) => {
  try {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');

    if (cnpj.length !== 14) {
      return res.status(400).json({ error: 'CNPJ inválido' });
    }

    const urls = [
      `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
      `https://receitaws.com.br/v1/cnpj/${cnpj}`
    ];

    let dados = null;
    let usedReceita = false;

    for (const url of urls) {
      try {
        const resposta = await fetch(url, {
          headers: { 'User-Agent': 'ControleCampo/1.0' }
        });

        if (!resposta.ok) continue;

        const json = await resposta.json();

        if (json && !json.message && json.status !== 'ERROR') {
          dados = json;
          if (url.includes('receitaws.com.br')) {
            usedReceita = true;
          }
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!dados) {
      return res.status(404).json({ error: 'CNPJ não encontrado' });
    }

    // Normalizar atividade principal / CNAE
    let cnaePrincipal = '';
    let cnaeDescricao = '';
    if (usedReceita) {
      if (Array.isArray(dados.atividade_principal) && dados.atividade_principal[0]) {
        cnaePrincipal = String(dados.atividade_principal[0].code || '').replace(/\D/g, '');
        cnaeDescricao = dados.atividade_principal[0].text || '';
      }
    } else {
      cnaePrincipal = dados.cnae_fiscal ? String(dados.cnae_fiscal) : '';
      cnaeDescricao = dados.cnae_fiscal_descricao || '';
    }

    // BrasilAPI separa o tipo de logradouro (ex: "Rua") do nome — precisamos concatenar
    const tipoLogradouro = !usedReceita ? (dados.descricao_tipo_de_logradouro || '') : '';
    const nomeLogradouro = dados.logradouro || '';
    const logradouroFull = tipoLogradouro && nomeLogradouro
      ? `${tipoLogradouro} ${nomeLogradouro}`
      : nomeLogradouro || tipoLogradouro;

    // "SN" = sem número; não preenche campo
    const numeroFull = dados.numero && String(dados.numero).toUpperCase() !== 'SN' ? String(dados.numero) : '';

    const resultado = {
      cnpj,
      razao_social: dados.razao_social || dados.nome || '',
      nome_fantasia: dados.nome_fantasia || dados.fantasia || dados.nome || '',
      email: dados.email || '',
      telefone: dados.ddd_telefone_1 || dados.telefone || '',
      cep: dados.cep ? String(dados.cep).replace(/\D/g, '') : '',
      logradouro: logradouroFull,
      numero: numeroFull,
      bairro: dados.bairro || '',
      cidade: dados.municipio || dados.cidade || '',
      estado: dados.uf || dados.estado || '',
      inscricao_estadual: dados.inscricao_estadual || '',
      atividade_principal: cnaeDescricao || '',
      cnae_principal: cnaePrincipal,
      cnae_descricao: cnaeDescricao,

      // Compatibilidade reversa para o front-end legado
      razaoSocial: dados.razao_social || dados.nome || '',
      nomeFantasia: dados.nome_fantasia || dados.fantasia || dados.nome || '',
      municipio: dados.municipio || dados.cidade || '',
      uf: dados.uf || dados.estado || '',
      cnaePrincipal: cnaePrincipal,
      cnaeDescricao: cnaeDescricao
    };


    return res.json(resultado);
  } catch (error) {
    console.error('Erro ao consultar CNPJ:', error);
    return res.status(500).json({ error: 'Erro ao consultar CNPJ' });
  }
});



// Notificações internas e Push/PWA
app.get('/api/notificacoes', async (req, res) => {
  try {
    const list = await db('app_notifications')
      .where({ user_id: req.user.id })
      .orderBy('created_at', 'desc')
      .limit(50);
    res.json(list);
  } catch (err) {
    console.error('Erro ao listar notificações:', err);
    res.status(500).json({ error: 'Erro ao listar notificações.' });
  }
});
app.put('/api/notificacoes/:id/read', async (req, res) => {
  try {
    await db('app_notifications').where({ id: req.params.id, user_id: req.user.id }).update({ read: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erro ao marcar notificação.' }); }
});
app.post('/api/push/subscribe', async (req, res) => {
  try {
    const sub = req.body && req.body.subscription;
    if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return res.status(400).json({ error: 'Inscrição push inválida.' });
    }
    const record = {
      empresa_id: req.user.empresa_id || '001',
      user_id: String(req.user.id),
      endpoint: sub.endpoint,
      keys_json: JSON.stringify(sub.keys || {}),
      device_info: JSON.stringify(req.body.device || {}),
      user_agent: req.headers['user-agent'] || '',
      permission: req.body.permission || 'granted',
      updated_at: new Date().toISOString()
    };
    const existing = await db('push_subscriptions').where({ user_id: String(req.user.id), endpoint: sub.endpoint }).first();
    let subscriptionId = existing && existing.id;
    if (existing) await db('push_subscriptions').where({ id: existing.id }).update(record);
    else subscriptionId = await insertAndGetId('push_subscriptions', { ...record, created_at: new Date().toISOString() });
    await logPushEvent({ empresa_id: req.user.empresa_id, user_id: req.user.id, subscription_id: subscriptionId, status: 'subscribed', title: 'Dispositivo cadastrado' });
    res.json({ success: true, subscriptionId });
  } catch (err) { console.error('Erro ao salvar push:', err); res.status(500).json({ error: 'Erro ao salvar push.' }); }
});
app.get('/api/push/vapid-public-key', async (req, res) => {
  const keys = getVapidKeys();
  res.json({ publicKey: keys.publicKey || '', configured: !!keys.publicKey, runtime: !!keys.runtime });
});

function externalUploadEnabled() {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_UPLOAD_PRESET);
}

async function uploadDataUrlExternally({ dataUrl, filename, module, empresaId }) {
  if (!externalUploadEnabled()) return null;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  const folderRoot = process.env.CLOUDINARY_FOLDER || 'controle-comercial';
  const folder = `${folderRoot}/${empresaId || '001'}/${module || 'geral'}`.replace(/\/+/g, '/');
  const form = new FormData();
  form.append('file', dataUrl);
  form.append('upload_preset', uploadPreset);
  form.append('folder', folder);
  if (filename) form.append('public_id', path.parse(String(filename)).name.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) + '-' + Date.now());
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, { method: 'POST', body: form });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.secure_url) {
    throw new Error(json.error && json.error.message ? json.error.message : 'Falha ao enviar arquivo para armazenamento externo.');
  }
  return {
    url: json.secure_url,
    provider: 'cloudinary',
    publicId: json.public_id || '',
    bytes: json.bytes || 0
  };
}

async function saveUploadFallbackToDatabase({ id, empresaId, userId, module, filename, mimeType, base64Data }) {
  await db('app_uploads').insert({
    id,
    empresa_id: empresaId,
    user_id: userId,
    module: module || 'geral',
    filename: filename || id,
    mime_type: mimeType,
    data_base64: base64Data
  });
  return `/api/uploads/${id}`;
}

// Upload persistente: usa armazenamento externo quando configurado e guarda no banco apenas a URL.
// Sem CLOUDINARY_CLOUD_NAME/CLOUDINARY_UPLOAD_PRESET, cai no modo antigo para nao parar o sistema.
app.post('/api/uploads/base64', async (req, res) => {
  try {
    const { dataUrl, filename, module } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'Arquivo base64 não enviado.' });
    }
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Formato base64 inválido.' });

    const mimeType = match[1];
    const base64Data = match[2];
    const allowed = ['image/jpeg','image/png','image/webp','image/gif','application/pdf','image/jpg','image/heic','image/heif'];
    if (!allowed.includes(mimeType)) return res.status(400).json({ error: 'Tipo de arquivo não permitido.' });

    const id = 'UP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const authUser = req.user || {};
    const empresaId = authUser.empresa_id || req.header('X-Company-Id') || '001';
    const userId = authUser.id ? String(authUser.id) : (req.header('X-User-Id') || null);

    try {
      const external = await uploadDataUrlExternally({ dataUrl, filename, module, empresaId });
      if (external && external.url) {
        return res.json({ success: true, id, url: external.url, provider: external.provider, publicId: external.publicId, bytes: external.bytes });
      }
    } catch (externalErr) {
      console.warn('Upload externo falhou; usando fallback no banco:', externalErr.message);
      if (process.env.UPLOAD_EXTERNAL_REQUIRED === 'true') {
        return res.status(502).json({ error: 'Falha ao salvar arquivo no armazenamento externo.' });
      }
    }

    const url = await saveUploadFallbackToDatabase({ id, empresaId, userId, module, filename, mimeType, base64Data });
    res.json({ success: true, id, url, provider: 'database-fallback' });
  } catch (err) {
    console.error('Erro ao salvar upload base64:', err);
    res.status(500).json({ error: 'Erro ao salvar arquivo.' });
  }
});

app.post('/api/uploads/delete-batch', async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (Array.isArray(ids) && ids.length) {
      const cleanIds = ids.map(String).filter(Boolean);
      await db('app_uploads').whereIn('id', cleanIds).delete();
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir arquivos:', err);
    res.status(500).json({ error: 'Erro ao excluir arquivos.' });
  }
});

app.get('/api/uploads/:id', async (req, res) => {
  try {
    const file = await db('app_uploads').where({ id: req.params.id }).first();
    if (!file) return res.status(404).json({ error: 'Arquivo não encontrado.' });
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(file.data_base64, 'base64'));
  } catch (err) {
    console.error('Erro ao abrir upload:', err);
    res.status(500).json({ error: 'Erro ao abrir arquivo.' });
  }
});



function asArrayPermissions(user) {
  if (!user) return [];
  if (Array.isArray(user.permissions)) return user.permissions;
  try { return JSON.parse(user.permissions || '[]'); } catch (_) { return []; }
}
function hasAnyPermission(user, names = []) {
  const wanted = names.map(normalizeRole);
  const profile = normalizeRole(user && user.profile);
  const perms = asArrayPermissions(user).map(normalizeRole);
  return wanted.includes(profile) || perms.some(p => wanted.includes(p));
}
async function getUsersByPermissions(empresaId, names = []) {
  const rows = await db('usuarios').where({ empresa_id: empresaId }).whereNot({ status: 'INATIVO' });
  return rows.filter(u => hasAnyPermission(u, ['Administrador', ...names]));
}
async function notifyUsers(userIds, payload = {}) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!uniqueIds.length) return;
  const rows = uniqueIds.map(uid => ({
    empresa_id: payload.empresa_id || '001',
    user_id: uid,
    module: payload.module || 'geral',
    record_id: payload.record_id || null,
    title: payload.title || 'Nova notificação',
    body: payload.body || '',
    target_hash: payload.target_hash || null,
    read: false,
    created_at: new Date().toISOString()
  }));
  await db('app_notifications').insert(rows).catch(err => console.warn('Falha ao salvar notificação:', err.message));
  await sendPushToUsers(uniqueIds, payload).catch(err => console.warn('Falha ao enviar push:', err.message));
}
async function notifyResponsibleByPermission(empresaId, permissions, payload = {}) {
  const users = await getUsersByPermissions(empresaId, permissions);
  await notifyUsers(users.map(u => u.id), { ...payload, empresa_id: empresaId });
}
async function obterDestinatarios(tipoEvento, usuarioCriador, empresaId = '001') {
  let creator = null;
  if (usuarioCriador) {
    if (typeof usuarioCriador === 'string' || typeof usuarioCriador === 'number') {
      creator = await db('usuarios').where({ id: String(usuarioCriador) }).first().catch(() => null);
    } else if (typeof usuarioCriador === 'object' && usuarioCriador.id) {
      creator = usuarioCriador;
    }
  }

  const recipients = new Set();

  // 1. Administradores da empresa recebem tudo
  const admins = await db('usuarios')
    .where({ empresa_id: empresaId })
    .whereNot({ status: 'INATIVO' })
    .where(function() {
      this.where('profile', 'Administrador')
          .orWhere('profile', 'Admin')
          .orWhere('profile', 'Administrador Geral');
    }).catch(() => []);
  admins.forEach(u => recipients.add(String(u.id)));

  // Obter supervisor vinculado se o criador for Vendedor
  let supervisorId = null;
  if (creator && String(creator.profile).toLowerCase().trim() === 'vendedor') {
    const link = await db('user_hierarchy_links')
      .where({
        child_user_id: String(creator.id),
        relation_type: 'supervisor_seller'
      })
      .first()
      .catch(() => null);
    if (link) {
      supervisorId = String(link.parent_user_id);
    }
  }

  // 2. Gerente: recebe notificações da sua empresa/unidade
  const gerentes = await db('usuarios')
    .where({ empresa_id: empresaId })
    .whereNot({ status: 'INATIVO' })
    .where('profile', 'Gerente')
    .catch(() => []);

  gerentes.forEach(g => {
    if (!creator || !creator.unitId || creator.unitId === 'all' || g.unitId === 'all' || String(g.unitId) === String(creator.unitId)) {
      recipients.add(String(g.id));
    }
  });

  switch (tipoEvento) {
    case 'NOVO_CLIENTE':
      if (supervisorId) recipients.add(supervisorId);
      break;

    case 'CLIENTE_STATUS_ALTERADO':
      if (creator) recipients.add(String(creator.id));
      if (supervisorId) recipients.add(supervisorId);
      break;

    case 'NOVA_SOLICITACAO_SALDO':
      if (creator) recipients.add(String(creator.id));
      if (supervisorId) recipients.add(supervisorId);
      const finUsers1 = await db('usuarios')
        .where({ empresa_id: empresaId })
        .whereNot({ status: 'INATIVO' })
        .where('profile', 'Financeiro')
        .catch(() => []);
      finUsers1.forEach(u => recipients.add(String(u.id)));
      break;

    case 'PARECER_SALDO':
      if (creator) recipients.add(String(creator.id));
      if (supervisorId) recipients.add(supervisorId);
      break;

    case 'NOVA_MOVIMENTACAO_EQUIPAMENTO':
      const eqUsers = await db('usuarios')
        .where({ empresa_id: empresaId })
        .whereNot({ status: 'INATIVO' })
        .where('profile', 'Responsável Equipamentos')
        .catch(() => []);
      eqUsers.forEach(u => recipients.add(String(u.id)));
      break;

    case 'APROVACAO_MOVIMENTACAO':
      if (creator) recipients.add(String(creator.id));
      if (supervisorId) recipients.add(supervisorId);
      break;

    case 'NOVA_DESPESA_CAMPO':
    case 'DESPESA_CORRIGIDA':
      if (creator) recipients.add(String(creator.id));
      if (supervisorId) recipients.add(supervisorId);
      const finUsers2 = await db('usuarios')
        .where({ empresa_id: empresaId })
        .whereNot({ status: 'INATIVO' })
        .where('profile', 'Financeiro')
        .catch(() => []);
      finUsers2.forEach(u => recipients.add(String(u.id)));
      break;

    case 'APROVACAO_DESPESA':
      if (creator) recipients.add(String(creator.id));
      if (supervisorId) recipients.add(supervisorId);
      break;

    default:
      break;
  }

  return Array.from(recipients);
}

async function sendPushToUsers(userIds, payload) {
  let webpush;
  try { webpush = require('web-push'); } catch (_) { return; }
  const keys = getVapidKeys();
  if (!keys.publicKey || !keys.privateKey) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:notificacoes@controlecampo.local', keys.publicKey, keys.privateKey);
  const subs = await db('push_subscriptions').whereIn('user_id', userIds.map(String));
  for (const sub of subs) {
    try {
      const subscription = { endpoint: sub.endpoint, keys: JSON.parse(sub.keys_json || '{}') };
      await webpush.sendNotification(subscription, JSON.stringify({
        title: payload.title || 'Controle de Campo',
        body: payload.body || '',
        module: payload.module || 'geral',
        record_id: payload.record_id || '',
        target_hash: payload.target_hash || '/',
        created_at: new Date().toISOString()
      }));
      await db('push_subscriptions').where({ id: sub.id }).update({ last_success_at: new Date().toISOString(), last_error: null }).catch(()=>{});
      await logPushEvent({ empresa_id: sub.empresa_id, user_id: sub.user_id, subscription_id: sub.id, status: 'sent', title: payload.title || 'Controle de Campo' });
    } catch (err) {
      const msg = err && (err.body || err.message || String(err));
      await db('push_subscriptions').where({ id: sub.id }).update({ last_error: msg, updated_at: new Date().toISOString() }).catch(()=>{});
      await logPushEvent({ empresa_id: sub.empresa_id, user_id: sub.user_id, subscription_id: sub.id, status: 'error', title: payload.title || 'Controle de Campo', error: msg });
      if ([404,410].includes(err.statusCode)) await db('push_subscriptions').where({ id: sub.id }).delete().catch(()=>{});
    }
  }
}

function normalizeRole(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}

function userHasRole(user, roles = []) {
  const wanted = roles.map(normalizeRole);
  const profile = normalizeRole(user && user.profile);
  const perms = Array.isArray(user && user.permissions) ? user.permissions.map(normalizeRole) : [];
  return wanted.includes(profile) || perms.some(p => wanted.includes(p));
}

function isAdminUser(user) {
  return userHasRole(user, ['Administrador', 'Admin', 'Administrador Geral', 'Administrador Sistema', 'Administrador sistema']);
}

function safeAuditJson(value) {
  try {
    if (value === undefined) return null;
    const text = JSON.stringify(value);
    return text && text.length > 12000 ? text.slice(0, 12000) + '...[cortado]' : text;
  } catch (_) {
    return null;
  }
}

async function registrarAuditoriaSistema(req, payload = {}) {
  try {
    const user = (req && req.user) || {};
    const empresaId = payload.empresa_id || user.empresa_id || '001';
    await db('auditoria_logs').insert({
      usuario_id: String(payload.usuario_id || user.id || 'sistema'),
      acao: String(payload.acao || 'REGISTRO_SISTEMA'),
      modulo: payload.modulo || null,
      registro_id: payload.registro_id != null ? String(payload.registro_id) : null,
      detalhes: String(payload.detalhes || 'Movimentação registrada no sistema.'),
      empresa_id: String(empresaId),
      dados_antes_json: safeAuditJson(payload.dados_antes),
      dados_depois_json: safeAuditJson(payload.dados_depois),
      ip: req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '') : '',
      user_agent: req ? (req.headers['user-agent'] || '') : '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Falha ao registrar auditoria do sistema:', err.message);
  }
}

const AUDIT_STORE_LABELS = {
  prospects: 'Prospecção de Leads',
  clients: 'Clientes Cadastrados',
  clientes_importador_sistema: 'Clientes Importador do Sistema',
  equipments: 'Equipamentos',
  movements: 'Movimentação de Equipamentos',
  tickets: 'Chamados Mecânicos',
  expenses: 'Despesas de Campo',
  balances: 'Solicitações de Saldo',
  units: 'Empresas / Unidades',
  client_categories: 'Categorias de Clientes',
  equipment_types: 'Tipos de Equipamentos',
  rejection_reasons: 'Motivos de Reprovação',
  prospect_loss_reasons: 'Motivos de Perda',
  expense_categories: 'Categorias de Despesas',
  notification_emails: 'E-mails de Notificações',
  company_identity: 'Identidade da Empresa'
};

function auditRecordKey(item, index) {
  if (item && typeof item === 'object') {
    return String(item.id || item.codigo || item.code || item.cnpj || item.cpf || item.serial || item.patrimonio || item.username || item.name || item.fantasia || index);
  }
  return String(item == null ? index : item);
}

function auditRecordName(item) {
  if (item && typeof item === 'object') {
    return String(item.name || item.fantasia || item.fantasy_name || item.nomeFantasia || item.nome_fantasia || item.client_name || item.cliente_nome || item.cliente_nome_fantasia || item.client || item.username || item.codigo || item.id || 'registro');
  }
  return String(item);
}

async function registrarDiferencasStore(req, key, beforeValue, afterValue) {
  try {
    const modulo = AUDIT_STORE_LABELS[key] || key;
    const beforeText = JSON.stringify(beforeValue == null ? null : beforeValue);
    const afterText = JSON.stringify(afterValue == null ? null : afterValue);
    if (beforeText === afterText) return;

    if (key === 'clientes_importador_sistema' && Array.isArray(beforeValue) && Array.isArray(afterValue)) {
      const beforeMap = new Map(beforeValue.map((it, idx) => [auditRecordKey(it, idx), it]));
      const afterMap = new Map(afterValue.map((it, idx) => [auditRecordKey(it, idx), it]));
      let criados = 0, alterados = 0, excluidos = 0;
      for (const k of afterMap.keys()) {
        if (!beforeMap.has(k)) criados += 1;
        else if (JSON.stringify(beforeMap.get(k)) !== JSON.stringify(afterMap.get(k))) alterados += 1;
      }
      for (const k of beforeMap.keys()) if (!afterMap.has(k)) excluidos += 1;
      if (criados || alterados || excluidos) {
        await registrarAuditoriaSistema(req, {
          acao: 'ATUALIZOU_IMPORTADOR_CLIENTES',
          modulo,
          detalhes: `${req.user.name || req.user.id} atualizou a base importada de clientes. Criados: ${criados}. Editados: ${alterados}. Removidos: ${excluidos}. Total atual: ${afterValue.length}.`,
          registro_id: 'clientes_importador_sistema',
          dados_antes: { total: beforeValue.length },
          dados_depois: { total: afterValue.length, criados, alterados, excluidos }
        });
      }
      return;
    }

    if (Array.isArray(beforeValue) && Array.isArray(afterValue)) {
      const beforeMap = new Map(beforeValue.map((it, idx) => [auditRecordKey(it, idx), it]));
      const afterMap = new Map(afterValue.map((it, idx) => [auditRecordKey(it, idx), it]));
      const events = [];
      for (const [id, afterItem] of afterMap.entries()) {
        const beforeItem = beforeMap.get(id);
        if (!beforeMap.has(id)) {
          events.push({ acao: 'CRIOU_REGISTRO', id, detalhes: `${req.user.name || req.user.id} criou registro em ${modulo}: ${auditRecordName(afterItem)}.`, depois: afterItem });
        } else if (JSON.stringify(beforeItem) !== JSON.stringify(afterItem)) {
          events.push({ acao: 'EDITOU_REGISTRO', id, detalhes: `${req.user.name || req.user.id} editou registro em ${modulo}: ${auditRecordName(afterItem)}.`, antes: beforeItem, depois: afterItem });
        }
      }
      for (const [id, beforeItem] of beforeMap.entries()) {
        if (!afterMap.has(id)) {
          events.push({ acao: 'EXCLUIU_REGISTRO', id, detalhes: `${req.user.name || req.user.id} excluiu registro em ${modulo}: ${auditRecordName(beforeItem)}.`, antes: beforeItem });
        }
      }
      const limited = events.slice(0, 50);
      for (const ev of limited) {
        await registrarAuditoriaSistema(req, { acao: ev.acao, modulo, registro_id: ev.id, detalhes: ev.detalhes, dados_antes: ev.antes, dados_depois: ev.depois });
      }
      if (events.length > limited.length) {
        await registrarAuditoriaSistema(req, { acao: 'ATUALIZOU_LOTE', modulo, registro_id: key, detalhes: `${req.user.name || req.user.id} realizou atualização em lote em ${modulo}. Total de alterações: ${events.length}.`, dados_depois: { totalAlteracoes: events.length } });
      }
      return;
    }

    await registrarAuditoriaSistema(req, {
      acao: 'ALTEROU_CONFIGURACAO',
      modulo,
      registro_id: key,
      detalhes: `${req.user.name || req.user.id} alterou ${modulo}.`,
      dados_antes: beforeValue,
      dados_depois: afterValue
    });
  } catch (err) {
    console.warn('Falha ao registrar diferenças da store:', err.message);
  }
}

function canUseImportedEquipments(user) {
  const profile = normalizeRole(user && user.profile);
  const perms = Array.isArray(user && user.permissions) ? user.permissions.map(normalizeRole) : [];
  const text = [profile, ...perms].join(' | ');
  return profile.includes('admin') || profile.includes('administrador')
    || text.includes('movimentacao de equipamentos')
    || text.includes('movimentacao equipamento')
    || text.includes('equipamentos')
    || text.includes('responsavel equipamentos')
    || text.includes('responsavel equipamento')
    || text.includes('confirmacao de movimentacao')
    || text.includes('avaliacao de movimentacao');
}

function assertImportedEquipmentAccess(req, res) {
  if (!canUseImportedEquipments(req.user)) {
    res.status(403).json({ error: 'Sem permissao para acessar equipamentos importados.' });
    return false;
  }
  return true;
}

function normalizeEquipCode(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeEquipHeader(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pickImportedEquipmentColumns(row) {
  const out = { nr_contrato: '', dt_emissao: '', patrimonio: '', marca: '', nr_patrimonio: '' };
  for (const [key, value] of Object.entries(row || {})) {
    const h = normalizeEquipHeader(key);
    const val = String(value == null ? '' : value).trim();
    if (h.includes('contrato')) out.nr_contrato = val;
    if (h.includes('emissao') || h.includes('data')) out.dt_emissao = val;
    if (h === 'patrimonio' || (h.includes('patrimonio') && !h.includes('nr') && !h.includes('num'))) out.patrimonio = val;
    if (h.includes('marca')) out.marca = val;
    if (h.includes('nrpatrimonio') || h.includes('numpatrimonio') || h.includes('numero') || (h === 'patrimonio' && !out.nr_patrimonio)) {
      out.nr_patrimonio = normalizeEquipCode(value);
    }
  }
  return out;
}

function mapImportedEquipmentRow(row, mapping) {
  const source = row || {};
  const get = key => key ? source[key] : '';
  return {
    nr_contrato: String(get(mapping && mapping.nr_contrato) || '').trim(),
    dt_emissao: String(get(mapping && mapping.dt_emissao) || '').trim(),
    patrimonio: String(get(mapping && mapping.patrimonio) || '').trim(),
    marca: String(get(mapping && mapping.marca) || '').trim(),
    nr_patrimonio: String(get(mapping && mapping.nr_patrimonio) || '').trim()
  };
}

function parseImportedEquipmentFile(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    let XLSX;
    try { XLSX = require('xlsx'); } catch (_) { const err = new Error('Dependencia xlsx nao instalada. Rode npm install antes do deploy.'); err.statusCode = 500; throw err; }
    const wb = XLSX.readFile(file.path, { cellText: true, cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  }
  if (ext === '.csv' || ext === '.txt') {
    const raw = fs.readFileSync(file.path, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const delimiter = (lines[0] || '').includes(';') ? ';' : ',';
    const headers = (lines.shift() || '').split(delimiter).map(h => h.trim());
    return lines.map(line => {
      const cols = line.split(delimiter);
      const obj = {};
      headers.forEach((h, i) => obj[h] = (cols[i] || '').trim());
      return obj;
    });
  }
  const err = new Error('Formato invalido. Envie .xlsx ou .csv.');
  err.statusCode = 400;
  throw err;
}

async function saveImportedEquipmentRows({ rows, mapping, req }) {
  const empresaId = req.user.empresa_id || '001';
  const unitId = req.user.unitId && req.user.unitId !== 'all' ? req.user.unitId : (req.body.unitId || 'all');
  let created = 0, updated = 0, ignored = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i += 1) {
    const picked = mapping ? mapImportedEquipmentRow(rows[i], mapping) : pickImportedEquipmentColumns(rows[i]);
    const code = normalizeEquipCode(picked.nr_patrimonio);
    const name = String(picked.patrimonio || '').trim();
    if (!code || !name) { ignored += 1; errors.push('Linha ' + (i + 2) + ': Nr. Patrimônio ou Patrimônio vazio.'); continue; }
    
    const existing = await db('equipamentos_importados').where({ empresa_id: empresaId, unitId, codigo_equipamento: code }).first();
    const payload = {
      codigo_equipamento: code,
      nome_equipamento: name,
      empresa_nome: picked.marca || '',
      nr_contrato: picked.nr_contrato || '',
      dt_emissao: picked.dt_emissao || '',
      patrimonio: name,
      marca: picked.marca || '',
      nr_patrimonio: code,
      atualizado_por: req.user.id,
      updated_at: new Date().toISOString()
    };
    if (existing) {
      await db('equipamentos_importados').where({ id: existing.id }).update(payload);
      updated += 1;
    } else {
      await db('equipamentos_importados').insert({
        empresa_id: empresaId,
        unitId,
        criado_por: req.user.id,
        created_at: new Date().toISOString(),
        ...payload
      });
      created += 1;
    }
  }
  return { success: true, created, updated, ignored, errors: errors.slice(0, 10) };
}

function isFinancialUser(user) {
  return userHasRole(user, ['Financeiro', 'Aprovação de Saldo', 'Aprovacao de Saldo', 'Aprovação de Despesas', 'Aprovacao de Despesas']);
}

// Prospecções reais no banco. Admin/Gerente/Supervisor veem conforme perfil; vendedor vê apenas as próprias.
app.get('/api/prospeccoes', async (req, res) => {
  try {
    const isAdmin = isAdminUser(req.user);
    const isSeller = normalizeRole(req.user.profile) === 'vendedor';
    let q = db('prospeccoes');

    // ADMIN vê tudo. Não prender o admin na empresa 001/padrão.
    // Usuários comuns ficam limitados à empresa e, no caso de vendedor, ao próprio cadastro.
    if (!isAdmin) {
      q = q.where({ empresa_id: req.user.empresa_id });
      if (isFilterValValid(req.query.unitId) && req.query.unitId !== 'all') q = q.andWhere({ unitId: req.query.unitId });
      if (isSeller) {
        q = q.andWhere(function () {
          this.where('userId', req.user.id).orWhere('user_id', req.user.id);
        });
      }
    } else if (isFilterValValid(req.query.unitId) && req.query.unitId !== 'all') {
      q = q.where({ unitId: req.query.unitId });
    }

    const rows = await q.orderBy('createdAt', 'desc');
    res.json(rows);
  } catch (err) {
    console.error('Erro ao listar prospecções:', err);
    res.status(500).json({ error: 'Erro ao listar prospecções.' });
  }
});

app.post('/api/prospeccoes', async (req, res) => {
  try {
    const b = req.body || {};
    const id = b.id || ('PR-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase());
    const now = new Date();
    const targetUserId = normalizeRole(req.user.profile) === 'vendedor' ? req.user.id : (b.userId || b.user_id || req.user.id);
    if (!targetUserId) return res.status(401).json({ error: 'Usuário não autenticado.' });

    const row = {
      id,
      empresa_id: b.empresa_id || req.user.empresa_id || '001',
      unitId: b.unitId || req.user.unitId || 'all',
      userId: targetUserId,
      user_id: targetUserId,
      name: b.name || b.nomeFantasia || b.razaoSocial || '',
      contact: b.contact || '',
      phone: b.phone || '',
      city: b.city || '',
      neighborhood: b.neighborhood || '',
      address: b.address || '',
      number: b.number || '',
      zipcode: b.zipcode || '',
      category: b.category || '',
      competitor: b.competitor || '',
      observation: b.observation || '',
      photo: b.photo || '',
      status: b.status || 'prospectado',
      lossReason: b.lossReason || '',
      hasCnpj: b.hasCnpj ? 'true' : 'false',
      cnpj: b.cnpj || '',
      razaoSocial: b.razaoSocial || '',
      nomeFantasia: b.nomeFantasia || '',
      cnaePrincipal: b.cnaePrincipal || '',
      cnaeDescricao: b.cnaeDescricao || '',
      date: b.date || now.toISOString().slice(0, 10),
      time: b.time || now.toTimeString().slice(0, 5),
      createdAt: b.createdAt || now.toISOString(),
      updated_at: now.toISOString()
    };
    // Check for duplicates
    if (row.cnpj && String(row.cnpj).trim()) {
      const cleanCnpj = String(row.cnpj).replace(/\D/g, '');
      if (cleanCnpj) {
        const existing = await db('prospeccoes')
          .where({ empresa_id: row.empresa_id })
          .andWhere(db.raw("replace(replace(replace(replace(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?", [cleanCnpj]))
          .first();
        if (existing) {
          return res.status(409).json({ error: 'Já existe uma prospecção com este CNPJ cadastrada nesta empresa.' });
        }
      }
    } else if (row.name && String(row.name).trim()) {
      const existing = await db('prospeccoes')
        .where({ empresa_id: row.empresa_id, name: row.name.trim(), city: row.city.trim() })
        .first();
      if (existing) {
        return res.status(409).json({ error: 'Já existe uma prospecção com este nome nesta cidade.' });
      }
    }

    await db('prospeccoes').insert(row);

    await db('auditoria_logs').insert({
      usuario_id: req.user.id,
      acao: 'CRIOU_PROSPECCAO',
      detalhes: `Prospecção de lead comercial ${row.name || row.id} criada por ${req.user.name || req.user.id}`,
      empresa_id: row.empresa_id
    }).catch(() => {});

    res.status(201).json(row);
  } catch (err) {
    console.error('Erro ao criar prospecção:', err);
    res.status(500).json({ error: 'Erro ao criar prospecção.' });
  }
});

app.put('/api/prospeccoes/:id', async (req, res) => {
  try {
    const existing = await db('prospeccoes').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Prospecção não encontrada.' });
    const isAdmin = isAdminUser(req.user);
    const isSeller = normalizeRole(req.user.profile) === 'vendedor';
    if (!isAdmin && String(existing.empresa_id) !== String(req.user.empresa_id)) return res.status(403).json({ error: 'Acesso negado: empresa divergente.' });
    if (isSeller && String(existing.userId || existing.user_id) !== String(req.user.id)) return res.status(403).json({ error: 'Acesso negado.' });
    const updatePayload = { ...req.body, empresa_id: existing.empresa_id, id: existing.id, updated_at: new Date().toISOString() };
    if (updatePayload.userId && !updatePayload.user_id) updatePayload.user_id = updatePayload.userId;
    if (updatePayload.user_id && !updatePayload.userId) updatePayload.userId = updatePayload.user_id;
    await db('prospeccoes').where({ id: req.params.id }).update(updatePayload);
    const updated = await db('prospeccoes').where({ id: req.params.id }).first();
    
    await db('auditoria_logs').insert({
      usuario_id: req.user.id,
      acao: 'ALTEROU_PROSPECCAO',
      detalhes: `Prospecção de lead comercial ${updated.name || updated.id} alterada por ${req.user.name || req.user.id}. Status: "${updated.status}"`,
      empresa_id: updated.empresa_id
    }).catch(() => {});

    res.json(updated);
  } catch (err) {
    console.error('Erro ao atualizar prospecção:', err);
    res.status(500).json({ error: 'Erro ao atualizar prospecção.' });
  }
});

app.delete('/api/prospeccoes/:id', async (req, res) => {
  try {
    const existing = await db('prospeccoes').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Prospecção não encontrada.' });
    const isAdmin = isAdminUser(req.user);
    if (!isAdmin) return res.status(403).json({ error: 'Somente administrador pode excluir registros.' });
    await db('prospeccoes').where({ id: req.params.id }).delete();
    await registrarAuditoriaSistema(req, {
      acao: 'EXCLUIU_PROSPECCAO',
      modulo: 'Prospecção de Leads',
      registro_id: req.params.id,
      detalhes: `${req.user.name || req.user.id} excluiu prospecção ${existing.name || existing.nomeFantasia || req.params.id}.`,
      dados_antes: existing
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir prospecção:', err);
    res.status(500).json({ error: 'Erro ao excluir prospecção.' });
  }
});

// Upload físico antigo mantido por compatibilidade, mas agora também salva no banco.
// Assim as fotos continuam disponíveis em outro celular e após reinício do Render.
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Erro de upload: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      const id = 'UP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      const empresaId = (req.user && req.user.empresa_id) || '001';
      const userId = req.user ? String(req.user.id) : null;
      const mimeType = req.file.mimetype || 'application/octet-stream';
      const base64Data = fileBuffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      try {
        const external = await uploadDataUrlExternally({
          dataUrl,
          filename: req.file.originalname || req.file.filename || id,
          module: 'geral',
          empresaId
        });
        if (external && external.url) {
          fs.unlink(req.file.path, () => {});
          return res.json({ success: true, id, url: external.url, provider: external.provider, publicId: external.publicId, bytes: external.bytes });
        }
      } catch (externalErr) {
        console.warn('Upload externo falhou; usando fallback no banco:', externalErr.message);
        if (process.env.UPLOAD_EXTERNAL_REQUIRED === 'true') {
          fs.unlink(req.file.path, () => {});
          return res.status(502).json({ error: 'Falha ao salvar arquivo no armazenamento externo.' });
        }
      }
      const url = await saveUploadFallbackToDatabase({
        id,
        empresaId,
        userId,
        module: 'geral',
        filename: req.file.originalname || req.file.filename || id,
        mimeType,
        base64Data
      });
      fs.unlink(req.file.path, () => {});
      return res.json({ success: true, id, url, provider: 'database-fallback' });
    } catch (dbErr) {
      console.error('Erro ao persistir upload no banco:', dbErr);
      const companyId = req.user ? req.user.empresa_id : '001';
      const fileUrl = `/uploads/${companyId}/${req.file.filename}`;
      return res.json({ success: true, url: fileUrl, warning: 'Upload salvo apenas no disco.' });
    }
  });
});


// Equipamentos Importados
app.get('/api/equipamentos-importados', async (req, res) => {
  try {
    if (!assertImportedEquipmentAccess(req, res)) return;
    const qText = String(req.query.q || '').trim();
    const requestedUnit = String(req.query.unitId || '').trim();
    let query = db('equipamentos_importados').where({ empresa_id: req.user.empresa_id || '001' });
    if (req.user.unitId && req.user.unitId !== 'all') query = query.where({ unitId: req.user.unitId });
    else if (requestedUnit && requestedUnit !== 'all') query = query.where({ unitId: requestedUnit });
    if (qText) {
      query = query.andWhere(function() {
        this.where('codigo_equipamento', 'like', '%' + qText + '%')
          .orWhere('nome_equipamento', 'like', '%' + qText + '%')
          .orWhere('empresa_nome', 'like', '%' + qText + '%')
          .orWhere('nr_contrato', 'like', '%' + qText + '%')
          .orWhere('marca', 'like', '%' + qText + '%')
          .orWhere('patrimonio', 'like', '%' + qText + '%')
          .orWhere('nr_patrimonio', 'like', '%' + qText + '%');
      });
    }
    const rows = await query.orderBy('codigo_equipamento', 'asc');
    res.json(rows);
  } catch (err) {
    console.error('Erro ao listar equipamentos importados:', err);
    res.status(500).json({ error: 'Erro ao listar equipamentos importados.' });
  }
});

app.get('/api/equipamentos-importados/lookup/:codigo', async (req, res) => {
  try {
    if (!assertImportedEquipmentAccess(req, res)) return;
    const code = normalizeEquipCode(req.params.codigo);
    if (!code) return res.status(400).json({ error: 'Codigo nao informado.' });
    let query = db('equipamentos_importados').where({ empresa_id: req.user.empresa_id || '001', codigo_equipamento: code });
    if (req.user.unitId && req.user.unitId !== 'all') query = query.where(function() { this.where({ unitId: req.user.unitId }).orWhere({ unitId: 'all' }); });
    const row = await query.orderBy('updated_at', 'desc').first();
    res.json(row ? { found: true, equipamento: row } : { found: false });
  } catch (err) {
    console.error('Erro ao buscar equipamento importado:', err);
    res.status(500).json({ error: 'Erro ao buscar equipamento importado.' });
  }
});

app.post('/api/equipamentos-importados/preview', upload.single('file'), async (req, res) => {
  try {
    if (!assertImportedEquipmentAccess(req, res)) return;
    if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado.' });
    const rows = parseImportedEquipmentFile(req.file);
    fs.unlink(req.file.path, () => {});
    const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row || {}))));
    res.json({ success: true, headers, rows, sample: rows.slice(0, 5) });
  } catch (err) {
    if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
    console.error('Erro ao ler previa de equipamentos:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao ler planilha.' });
  }
});

app.post('/api/equipamentos-importados/import', upload.single('file'), async (req, res) => {
  try {
    if (!assertImportedEquipmentAccess(req, res)) return;
    let rows = [];
    let mapping = null;
    if (req.body.rows_json) {
      rows = JSON.parse(req.body.rows_json || '[]');
      mapping = JSON.parse(req.body.mapping_json || 'null');
    } else {
      if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado.' });
      rows = parseImportedEquipmentFile(req.file);
    }
    const result = await saveImportedEquipmentRows({ rows, mapping, req });
    if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
    res.json(result);
  } catch (err) {
    if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
    console.error('Erro ao importar equipamentos:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao importar equipamentos.' });
  }
});

app.put('/api/equipamentos-importados/:id', async (req, res) => {
  try {
    if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Somente administrador pode editar.' });
    const code = normalizeEquipCode(req.body.codigo_equipamento);
    const name = String(req.body.nome_equipamento || '').trim();
    const empresaNome = String(req.body.empresa_nome || '').trim();
    if (!code || !name) return res.status(400).json({ error: 'Patrimonio e modelo sao obrigatorios.' });
    await db('equipamentos_importados').where({ id: req.params.id, empresa_id: req.user.empresa_id || '001' }).update({
      codigo_equipamento: code,
      nome_equipamento: name,
      empresa_nome: empresaNome,
      nr_contrato: req.body.nr_contrato || '',
      dt_emissao: req.body.dt_emissao || '',
      patrimonio: name,
      marca: empresaNome,
      nr_patrimonio: code,
      atualizado_por: req.user.id,
      updated_at: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao editar equipamento importado:', err);
    res.status(500).json({ error: 'Erro ao editar equipamento.' });
  }
});

app.delete('/api/equipamentos-importados/:id', async (req, res) => {
  try {
    if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Somente administrador pode excluir.' });
    await db('equipamentos_importados').where({ id: req.params.id, empresa_id: req.user.empresa_id || '001' }).delete();
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir equipamento importado:', err);
    res.status(500).json({ error: 'Erro ao excluir equipamento.' });
  }
});

app.post('/api/equipamentos-importados/delete-all', async (req, res) => {
  try {
    if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Somente administrador pode excluir todos.' });
    const empresaId = req.user.empresa_id || '001';
    const count = await db('equipamentos_importados').where({ empresa_id: empresaId }).delete();
    res.json({ success: true, count });
  } catch (err) {
    console.error('Erro ao excluir todos os equipamentos importados:', err);
    res.status(500).json({ error: 'Erro ao excluir todos os equipamentos.' });
  }
});

// Persistência geral de listas/configurações do frontend no PostgreSQL.
// O aplicativo mostra primeiro o cache local para não sumir nada no celular e sincroniza aqui em segundo plano.
const ALLOWED_STORE_KEYS = new Set([
  'company_identity',
  'prospects',
  'clients',
  'clientes_importador_sistema',
  'equipments',
  'movements',
  'tickets',
  'expenses',
  'balances',
  'units',
  'client_categories',
  'equipment_types',
  'rejection_reasons',
  'prospect_loss_reasons',
  'expense_categories',
  'notification_emails'
]);

function getStoreKey(req, key) {
  if (key === 'company_identity' || key === 'units' || key === 'clientes_importador_sistema' || key === 'clients') {
    return key;
  }
  const userId = req.user && req.user.id ? String(req.user.id) : 'global';
  return `${userId}_${key}`;
}

function getStoreCompanyId(req) {
  return req.user && req.user.empresa_id ? String(req.user.empresa_id) : '001';
}

function safeParseStoreJson(value, fallback = null) {
  try { return JSON.parse(value || 'null'); } catch (_) { return fallback; }
}


function storeItemKey(item, index, prefix) {
  if (!item || typeof item !== 'object') return `${prefix || 'item'}-${index}`;
  return String(item.id || item.codigo || item.cnpj || item.cpf || item.name || item.fantasyName || `${prefix || 'item'}-${index}`);
}

function mergeStoreArrays(...lists) {
  const map = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    list.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const key = storeItemKey(item, index, 'row');
      const prev = map.get(key) || {};
      map.set(key, { ...prev, ...item });
    });
  }
  return Array.from(map.values());
}

function canApproveClientsUser(user) {
  const profile = normalizeRole(user && (user.profile || user.role || user.perfil));
  let perms = [];
  if (Array.isArray(user && user.permissions)) perms = user.permissions.map(normalizeRole);
  else {
    try { perms = JSON.parse((user && user.permissions) || '[]').map(normalizeRole); } catch (_) { perms = []; }
  }
  const joined = [profile, ...perms].join(' | ');
  if (profile.includes('admin') || profile.includes('administrador')) return true;
  if (profile.includes('responsavel') && profile.includes('equip')) return true;

  // Regra de segurança: permissão simples de Clientes/Cadastro NÃO libera aprovação.
  // Libera somente quem tem aprovação/liberação de clientes ou movimentação/liberação de equipamentos.
  const allowedPerms = [
    'aprovacao de clientes', 'aprovar clientes',
    'liberacao de cadastro de clientes', 'liberacao cadastro clientes', 'liberacao de clientes',
     'movimentacao de equipamentos', 'movimentacao equipamento',
    'liberacao de equipamento', 'liberacao de equipamentos',
    'confirmacao de movimentacao', 'avaliacao de movimentacao'
  ];
  return allowedPerms.some(p => joined.includes(p));
}

function isSupervisorLikeUser(user) {
  const profile = normalizeRole(user && (user.profile || user.role || user.perfil));
  return profile.includes('supervisor') || profile.includes('gerente');
}

function getClientOwnerId(item) {
  return String((item && (
    item.userId || item.user_id || item.usuario_id || item.usuarioId ||
    item.vendedor_id || item.vendedorId || item.seller_id || item.sellerId ||
    item.createdBy || item.created_by || item.created_by_id || item.ownerId
  )) || '');
}

function getClientOwnerName(item) {
  return String((item && (
    item.vendedor_nome || item.vendedorName || item.sellerName || item.seller_name ||
    item.vendedor || item.responsavel || item.responsavel_nome || item.userName || item.user_name
  )) || '');
}

function sameNormalizedText(a, b) {
  const na = normalizeRole(a);
  const nb = normalizeRole(b);
  return !!na && !!nb && na === nb;
}

function isClientPendingCorrection(status) {
  const s = normalizeRole(status);
  return s.includes('aguard') || s.includes('ajuste') || s.includes('correc') || s.includes('reprov');
}

function isClientPendingApproval(status) {
  const s = normalizeRole(status);
  return !s || s.includes('pendent') || s.includes('analise');
}

function isClientVisibleToUser(item, user) {
  if (!item) return false;
  if (canApproveClientsUser(user)) return true;
  const owner = getClientOwnerId(item);
  const ownerName = getClientOwnerName(item);
  const userId = String((user && user.id) || '');
  const userName = String((user && (user.name || user.username || user.email)) || '');
  const status = normalizeRole(item.status);
  const belongsToUser = (owner && userId && owner === userId) || sameNormalizedText(ownerName, userName);
  return belongsToUser && !status.includes('excl');
}

function filterClientsForUser(list, user) {
  if (!Array.isArray(list)) return [];
  return list.filter(item => isClientVisibleToUser(item, user));
}

async function filterClientsForUserAsync(list, user) {
  if (!Array.isArray(list)) return [];
  const activeList = list.filter(item => !normalizeRole(item && item.status).includes('excl'));
  if (isAdminUser(user)) return activeList;

  if (isSupervisorLikeUser(user)) {
    const permittedIds = (await getPermittedSellerIds(user, db)).map(String);
    const userName = String((user && (user.name || user.username || user.email)) || '');
    return activeList.filter(item => {
      const owner = getClientOwnerId(item);
      const ownerName = getClientOwnerName(item);
      return (owner && permittedIds.includes(String(owner))) || sameNormalizedText(ownerName, userName);
    });
  }

  if (canApproveClientsUser(user)) return activeList;

  return activeList.filter(item => isClientVisibleToUser(item, user));
}

async function getClientStoreRows(companyId) {
  return db('app_kv_store')
    .where({ company_id: companyId })
    .andWhere(function() {
      this.where('store_key', 'clients').orWhere('store_key', 'like', '%_clients');
    });
}

function clientRecordMatches(item, id, index = 0) {
  const wanted = String(id || '');
  const keys = [item && item.id, item && item.cnpj, item && item.codigo, storeItemKey(item, index, 'client')]
    .filter(Boolean)
    .map(String);
  return wanted && keys.includes(wanted);
}

async function getMergedClientsStore(companyId) {
  const rows = await getClientStoreRows(companyId);
  const globalRows = [];
  const scopedRows = [];
  for (const row of rows) {
    const parsed = safeParseStoreJson(row.data_json, []);
    if (row.store_key === 'clients') globalRows.push(parsed);
    else scopedRows.push(parsed);
  }
  // Listas antigas por usuario entram primeiro; a lista global da empresa vence conflitos.
  return mergeStoreArrays(...scopedRows, ...globalRows);
}

async function updateClientInEveryStore(companyId, id, updated, actingUserId) {
  const rows = await getClientStoreRows(companyId);

  const now = new Date().toISOString();
  for (const row of rows) {
    const list = safeParseStoreJson(row.data_json, []);
    if (!Array.isArray(list)) continue;
    let changed = false;
    const next = list.map((item, index) => {
      if (!clientRecordMatches(item, id, index)) return item;
      changed = true;
      return { ...(item || {}), ...updated };
    });
    if (changed) {
      await db('app_kv_store')
        .where({ company_id: companyId, store_key: row.store_key })
        .update({ data_json: JSON.stringify(next), updated_by: actingUserId, updated_at: now });
    }
  }
}


// Aprovação/reprovação de clientes por registro único.
// Evita perder dados ao salvar listas grandes e garante notificação ao vendedor dono do cadastro.
app.post('/api/clientes-aprovacao/:id/status', async (req, res) => {
  try {
    if (!canApproveClientsUser(req.user) && !isSupervisorLikeUser(req.user)) {
      return res.status(403).json({ error: 'Sem permissão para aprovar ou reprovar cadastro de cliente.' });
    }
    const companyId = getStoreCompanyId(req);
    const id = String(req.params.id || '');
    const bodyStatus = String((req.body && req.body.status) || '').trim();
    const reason = String((req.body && req.body.reason) || '').trim();
    const sendToCorrection = !!(req.body && req.body.sendToCorrection);
    const stNorm = normalizeRole(bodyStatus);
    const finalStatus = stNorm.includes('aprov')
      ? 'Aprovado'
      : (sendToCorrection || stNorm.includes('ajuste') || stNorm.includes('correc') ? 'Aguardando Ajuste' : 'Reprovado');

    const previousData = await getMergedClientsStore(companyId);
    const idx = previousData.findIndex((item, index) => clientRecordMatches(item, id, index));
    if (idx < 0) return res.status(404).json({ error: 'Cadastro não encontrado na base de clientes.' });

    const before = previousData[idx] || {};
    const visibleForReviewer = await filterClientsForUserAsync([before], req.user);
    if (!visibleForReviewer.length) {
      return res.status(403).json({ error: 'Cadastro fora da sua hierarquia de aprovação.' });
    }

    const nowText = new Date().toISOString();
    const updated = {
      ...before,
      status: finalStatus,
      reviewedBy: req.user.id,
      reviewedAt: nowText,
      updatedAt: nowText,
      updated_at: nowText,
      correctionRequested: finalStatus === 'Aguardando Ajuste'
    };
    if (finalStatus === 'Aprovado') {
      updated.rejectionReason = '';
      updated.approvalReason = '';
      updated.approvedBy = req.user.id;
      updated.approvedAt = nowText;
      updated.approved_at = nowText;
      updated.approvalDate = nowText;
      updated.rejectedBy = '';
      updated.rejectedAt = '';
      updated.rejected_at = '';
      updated.rejectionDate = '';
      updated.correctionRequestedAt = '';
    } else {
      updated.rejectionReason = reason || (finalStatus === 'Aguardando Ajuste' ? 'Correção necessária' : 'Reprovado');
      updated.approvalReason = updated.rejectionReason;
      updated.rejectedBy = req.user.id;
      updated.rejectedAt = nowText;
      updated.rejected_at = nowText;
      updated.rejectionDate = nowText;
      if (finalStatus === 'Aguardando Ajuste') updated.correctionRequestedAt = nowText;
    }

    const finalData = previousData.map((item, i) => i === idx ? updated : item);
    const dataJson = JSON.stringify(finalData);
    const now = new Date().toISOString();
    const existing = await db('app_kv_store').where({ company_id: companyId, store_key: 'clients' }).first();
    if (existing) {
      await db('app_kv_store').where({ company_id: companyId, store_key: 'clients' }).update({ data_json: dataJson, updated_by: req.user.id, updated_at: now });
    } else {
      await db('app_kv_store').insert({ company_id: companyId, store_key: 'clients', data_json: dataJson, updated_by: req.user.id, created_at: now, updated_at: now });
    }
    // Garante persistencia real: atualiza tambem copias antigas usuario_clients com o mesmo cliente.
    await updateClientInEveryStore(companyId, id, updated, req.user.id);

    // Sincroniza também a tabela física clientes quando existir, sem apagar fotos nem campos extras.
    try {
      const clientData = {
        name: updated.name || null,
        cnpj: updated.cnpj || null,
        phone: updated.phone || null,
        email: updated.email || null,
        unitId: updated.unitId || null,
        userId: updated.userId || updated.user_id || null,
        status: updated.status || null,
        companyName: updated.companyName || null,
        city: updated.city || null,
        address: updated.addressFull || updated.street || updated.address || null,
        aprovador: finalStatus === 'Aprovado' ? String(req.user.id) : null,
        data_aprovacao: finalStatus === 'Aprovado' ? nowText : null,
        motivo_reprovacao: finalStatus !== 'Aprovado' ? updated.rejectionReason : null,
        data_reprovacao: finalStatus !== 'Aprovado' ? nowText : null,
        data_reenvio: updated.correctionResubmittedAt || null,
        status_final: ['Aprovado', 'Reprovado', 'Pendente'].includes(updated.status) ? updated.status : 'Pendente'
      };
      const existingClient = await db('clientes').where({ id: updated.id || id }).first().catch(() => null);
      if (existingClient) {
        await db('clientes').where({ id: updated.id || id }).update(clientData).catch(() => null);
      } else if (updated.id) {
        await db('clientes').insert({ id: updated.id, ...clientData, data_cadastro: getBrasiliaDateTime().date }).catch(() => null);
      }
    } catch (syncErr) {
      console.warn('Falha ao sincronizar aprovação na tabela clientes:', syncErr.message);
    }

    await registrarDiferencasStore(req, 'clients', previousData, finalData).catch(err => console.warn('Falha auditoria aprovação cliente:', err.message));

    const owner = getClientOwnerId(updated);
    if (owner) {
      let title = 'Cliente aprovado';
      if (finalStatus === 'Aguardando Ajuste') title = 'Cadastro voltou para correção';
      if (finalStatus === 'Reprovado') title = 'Cliente reprovado';
      const clientName = updated.name || updated.nome || updated.companyName || updated.nomeFantasia || updated.fantasy_name || id;
      const reasonText = updated.rejectionReason ? ` Motivo: ${updated.rejectionReason}` : '';
      await notifyUsers([owner], {
        empresa_id: companyId,
        module: 'clientes',
        record_id: updated.id || id,
        target_hash: '#clientes',
        title,
        body: `O cadastro ${clientName} foi atualizado para: ${finalStatus}.${reasonText}`
      });
    }

    res.json({ success: true, client: updated, clients: await filterClientsForUserAsync(finalData, req.user) });
  } catch (err) {
    console.error('Erro ao atualizar aprovação de cliente:', err);
    res.status(500).json({ error: 'Erro ao salvar aprovação do cliente no banco.' });
  }
});

app.get('/api/store', async (req, res) => {
  try {
    const companyId = getStoreCompanyId(req);
    const userId = req.user && req.user.id ? String(req.user.id) : 'global';
    const rows = await db('app_kv_store')
      .where({ company_id: companyId })
      .andWhere(function() {
        this.where('store_key', 'company_identity')
            .orWhere('store_key', 'units')
            .orWhere('store_key', 'clientes_importador_sistema')
            .orWhere('store_key', 'clients')
            .orWhere('store_key', 'like', '%_clients')
            .orWhere('store_key', 'like', `${userId}_%`);
      });
    const payload = {};
    const scopedClientLists = [];
    const globalClientLists = [];
    for (const row of rows) {
      const isScoped = row.store_key.startsWith(`${userId}_`);
      const cleanKey = isScoped ? row.store_key.replace(`${userId}_`, '') : row.store_key;
      const parsed = safeParseStoreJson(row.data_json, null);

      // Migração segura: todos os cadastros comerciais agora são globais da empresa.
      // Também lê versões antigas salvas como usuario_clients para nenhum cadastro sumir.
      if (row.store_key === 'clients' || row.store_key.endsWith('_clients')) {
        if (Array.isArray(parsed)) {
          if (row.store_key === 'clients') globalClientLists.push(parsed);
          else scopedClientLists.push(parsed);
        }
        continue;
      }

      if (cleanKey === 'clientes_importador_sistema' && Object.prototype.hasOwnProperty.call(payload, cleanKey)) {
        const current = payload[cleanKey];
        const currentEmpty = !Array.isArray(current) || current.length === 0;
        if (row.store_key === cleanKey || currentEmpty) payload[cleanKey] = parsed;
      } else {
        payload[cleanKey] = parsed;
      }
    }
    // Listas antigas por usuario entram primeiro; a lista global da empresa vence conflitos.
    payload.clients = await filterClientsForUserAsync(mergeStoreArrays(...scopedClientLists, ...globalClientLists), req.user);
    res.json(payload);
  } catch (err) {
    console.error('Erro ao carregar store geral:', err);
    res.status(500).json({ error: 'Erro ao carregar dados do banco.' });
  }
});

app.get('/api/store/:key', async (req, res) => {
  try {
    const key = req.params.key;
    if (!ALLOWED_STORE_KEYS.has(key)) return res.status(400).json({ error: 'Chave inválida.' });
    const companyId = getStoreCompanyId(req);
    const dbKey = getStoreKey(req, key);
    if (key === 'clients') {
      const clients = await getMergedClientsStore(companyId);
      return res.json({ key, data: await filterClientsForUserAsync(clients, req.user) });
    }
    let row = await db('app_kv_store').where({ company_id: companyId, store_key: dbKey }).first();
    // Compatibilidade: versões anteriores salvaram o importador preso ao usuário.
    // Se ainda não existir a base global, tenta ler a antiga para o admin migrar automaticamente.
    if (!row && key === 'clientes_importador_sistema') {
      const userId = req.user && req.user.id ? String(req.user.id) : 'global';
      row = await db('app_kv_store').where({ company_id: companyId, store_key: `${userId}_${key}` }).first();
    }
    res.json({ key, data: row ? safeParseStoreJson(row.data_json, null) : null });
  } catch (err) {
    console.error('Erro ao carregar item da store:', err);
    res.status(500).json({ error: 'Erro ao carregar dado do banco.' });
  }
});

app.post('/api/store/:key', async (req, res) => {
  try {
    const key = req.params.key;
    if (!ALLOWED_STORE_KEYS.has(key)) return res.status(400).json({ error: 'Chave inválida.' });
    if (key === 'clientes_importador_sistema' && !isAdminUser(req.user)) {
      return res.status(403).json({ error: 'Somente administrador pode importar clientes.' });
    }
    const companyId = getStoreCompanyId(req);
    const dbKey = getStoreKey(req, key);
    const data = Object.prototype.hasOwnProperty.call(req.body || {}, 'data') ? req.body.data : req.body;
    let dataJson = JSON.stringify(data == null ? null : data);
    let previousMergedClientsForAudit = null;

    if (key === 'clients' && Array.isArray(data)) {
      const existingList = await getMergedClientsStore(companyId);
      previousMergedClientsForAudit = existingList;
      const canApprove = canApproveClientsUser(req.user);
      const currentUserId = req.user && req.user.id ? String(req.user.id) : '';
      const incoming = data.map(item => ({ ...(item || {}) }));
      const existingByKey = new Map(existingList.map((item, idx) => [storeItemKey(item, idx, 'existing'), item]));
      const sanitizedIncoming = incoming.map((item, idx) => {
        const itemKey = storeItemKey(item, idx, 'incoming');
        const previous = existingByKey.get(itemKey);
        if (!canApprove) {
          const owner = getClientOwnerId(previous) || getClientOwnerId(item) || currentUserId;
          const ownerName = getClientOwnerName(previous) || getClientOwnerName(item);
          const currentUserName = String((req.user && (req.user.name || req.user.username || req.user.email)) || '');
          const isOwner = (currentUserId && String(owner) === currentUserId) || sameNormalizedText(ownerName, currentUserName);

          // Usuário comum não pode alterar cadastro de outro vendedor.
          if (previous && !isOwner) return previous;

          // Novo cadastro de vendedor sempre entra pendente para aprovação.
          if (!previous) {
            item.userId = item.userId || currentUserId;
            item.status = 'Pendente';
            return item;
          }

          // Cadastro já aprovado não pode ser editado pelo vendedor por esta rota.
          if (normalizeRole(previous.status).includes('aprov')) return previous;

          const requestedStatus = String(item.status || '');
          const previousStatus = String(previous.status || 'Pendente');
          const resubmittingCorrection = isClientPendingCorrection(previousStatus) && normalizeRole(requestedStatus).includes('pendent');

          // O vendedor só pode reenviar para Pendente quando o cadastro voltou para correção.
          // Qualquer outra tentativa de mudar status é preservada como estava.
          if (resubmittingCorrection) {
            const nowText = new Date().toISOString();
            item.status = 'Pendente';
            item.rejectionReason = '';
            item.approvalReason = '';
            item.correctionRequested = false;
            item.correctionResubmittedAt = nowText;
            item.correctionResubmittedBy = currentUserId;
            item.updatedAt = nowText;
            item.updated_at = nowText;
          } else {
            item.status = previousStatus;
            item.rejectionReason = previous.rejectionReason || item.rejectionReason || '';
          }
          item.userId = previous.userId || previous.user_id || item.userId || currentUserId;
        }
        return item;
      });
      const mergedClients = mergeStoreArrays(existingList, sanitizedIncoming);
      const hardDeleteId = req.body && req.body.hardDeleteId ? String(req.body.hardDeleteId) : '';
      const finalClients = (hardDeleteId && canApprove) ? mergedClients.filter(c => String(c && c.id) !== hardDeleteId) : mergedClients;
      dataJson = JSON.stringify(finalClients);
    }
    
    if (['prospects', 'equipments'].includes(key) && Array.isArray(data)) {
      const existingRow = await db('app_kv_store').where({ company_id: companyId, store_key: dbKey }).first();
      if (existingRow) {
        let existingList = safeParseStoreJson(existingRow.data_json, []);
        if (Array.isArray(existingList)) {
          const permittedSellerIds = await getPermittedSellerIds(req.user, db);
          const permittedSellerIdsStr = permittedSellerIds.map(String);
          
          const getKey = (it) => String(it.id || it.cnpj || it.codigo || it.serial || '');
          const getUserId = (it) => String(it.userId || it.user_id || it.vendedor_id || '');
          
          // Partition existing list
          const preserved = existingList.filter(item => {
            const uid = getUserId(item);
            return !permittedSellerIdsStr.includes(uid);
          });
          
          const modifiableMap = new Map();
          existingList.forEach(item => {
            const uid = getUserId(item);
            if (permittedSellerIdsStr.includes(uid)) {
              const itemKey = getKey(item);
              if (itemKey) modifiableMap.set(itemKey, item);
            }
          });
          
          // Filter incoming list to only include what this user has permission to modify/create
          const allowedIncoming = data.filter(item => {
            const uid = getUserId(item);
            return permittedSellerIdsStr.includes(uid);
          });
          
          // Merge incoming into modifiable
          allowedIncoming.forEach(item => {
            const itemKey = getKey(item);
            if (itemKey) modifiableMap.set(itemKey, item);
          });
          
          const mergedList = [...preserved, ...Array.from(modifiableMap.values())];
          dataJson = JSON.stringify(mergedList);
        }
      }
    }

    const now = new Date().toISOString();
    const existing = await db('app_kv_store').where({ company_id: companyId, store_key: dbKey }).first();
    const previousData = previousMergedClientsForAudit || (existing ? safeParseStoreJson(existing.data_json, []) : []);
    if (existing) {
      await db('app_kv_store').where({ company_id: companyId, store_key: dbKey }).update({
        data_json: dataJson,
        updated_by: req.user.id,
        updated_at: now
      });
    } else {
      await db('app_kv_store').insert({
        company_id: companyId,
        store_key: dbKey,
        data_json: dataJson,
        updated_by: req.user.id,
        created_at: now,
        updated_at: now
      });
    }

    const finalData = safeParseStoreJson(dataJson, []);

    await registrarDiferencasStore(req, key, previousData, finalData);

    // Sincronização automática de mudanças (Vendedor, Supervisor, Dados etc.) no cadastro ativo quando o importador for atualizado
    if (key === 'clientes_importador_sistema' && Array.isArray(finalData)) {
      try {
        const clientsKey = getStoreKey(req, 'clients');
        const clientsRow = await db('app_kv_store').where({ company_id: companyId, store_key: clientsKey }).first();
        if (clientsRow) {
          const registeredClients = safeParseStoreJson(clientsRow.data_json, []);
          if (Array.isArray(registeredClients) && registeredClients.length > 0) {
            // Carrega usuários ativos para mapear vendedores
            const users = await db('usuarios').where({ empresa_id: companyId, status: 'LIBERADO' });
            const findUserByName = (name) => {
              if (!name) return null;
              const norm = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
              return users.find(u => {
                const uNameNorm = (u.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
                return uNameNorm === norm;
              });
            };

            let updatedAny = false;
            for (const reg of registeredClients) {
              const regCode = String(reg.route || '').trim();
              const regCnpj = String(reg.cnpj || '').replace(/\D/g, '');
              
              const impMatch = finalData.find(imp => {
                const impCode = String(imp.codigo || '').trim();
                const impCnpj = String(imp.cnpj || '').replace(/\D/g, '');
                return (regCode && impCode && regCode === impCode) || (regCnpj && impCnpj && regCnpj === impCnpj);
              });

              if (impMatch) {
                let changed = false;

                // 1. Mapear e atualizar Vendedor
                if (impMatch.vendedor) {
                  const targetUser = findUserByName(impMatch.vendedor);
                  if (targetUser && String(reg.userId) !== String(targetUser.id)) {
                    reg.userId = targetUser.id;
                    changed = true;
                  }
                }

                // 2. Atualizar outros dados se mudaram
                if (impMatch.fantasia && reg.name !== impMatch.fantasia) {
                  reg.name = impMatch.fantasia;
                  changed = true;
                }
                if (impMatch.empresaResponsavel && reg.companyName !== impMatch.empresaResponsavel) {
                  reg.companyName = impMatch.empresaResponsavel;
                  changed = true;
                }
                if (impMatch.fone && reg.phone !== impMatch.fone) {
                  reg.phone = impMatch.fone;
                  changed = true;
                }
                if (impMatch.email && reg.email !== impMatch.email) {
                  reg.email = impMatch.email;
                  changed = true;
                }
                if (impMatch.cidade && reg.city !== impMatch.cidade) {
                  reg.city = impMatch.cidade;
                  changed = true;
                }

                if (changed) {
                  updatedAny = true;
                  reg.updatedAt = new Date().toISOString();
                }
              }
            }

            if (updatedAny) {
              const updatedClientsJson = JSON.stringify(registeredClients);
              await db('app_kv_store').where({ company_id: companyId, store_key: clientsKey }).update({
                data_json: updatedClientsJson,
                updated_by: req.user.id,
                updated_at: new Date().toISOString()
              });

              for (const client of registeredClients) {
                if (!client.id) continue;
                const clientData = {
                  name: client.name || null,
                  cnpj: client.cnpj || null,
                  phone: client.phone || null,
                  email: client.email || null,
                  unitId: client.unitId || null,
                  userId: client.userId || null,
                  companyName: client.companyName || null,
                  city: client.city || null,
                  address: client.addressFull || client.street || null,
                  status_final: ['Aprovado', 'Reprovado', 'Pendente'].includes(client.status) ? client.status : 'Pendente'
                };
                await db('clientes').where({ id: client.id }).update(clientData);
              }
            }
          }
        }
      } catch (syncErr) {
        console.error('Erro ao propagar alterações de vendedor do importador para clientes:', syncErr);
      }
    }

    // Sincronização física com a tabela clientes
    if (key === 'clients' && Array.isArray(finalData)) {
      try {
        for (const client of finalData) {
          if (!client.id) continue;
          const existingClient = await db('clientes').where({ id: client.id }).first();
          const clientData = {
            name: client.name || null,
            cnpj: client.cnpj || null,
            phone: client.phone || null,
            email: client.email || null,
            unitId: client.unitId || null,
            userId: client.userId || null,
            status: client.status || null,
            companyName: client.companyName || null,
            city: client.city || null,
            address: client.addressFull || client.street || null,
            motivo_reprovacao: client.rejectionReason || null,
            data_reprovacao: client.rejectedAt || client.rejected_at || null,
            data_reenvio: client.correctionResubmittedAt || null,
            status_final: ['Aprovado', 'Reprovado', 'Pendente'].includes(client.status) ? client.status : 'Pendente'
          };
          if (existingClient) {
            if (client.status === 'Aprovado' && existingClient.status !== 'Aprovado') {
              clientData.data_aprovacao = getBrasiliaDateTime().date;
            }
            await db('clientes').where({ id: client.id }).update(clientData);
          } else {
            await db('clientes').insert({
              id: client.id,
              ...clientData,
              data_cadastro: getBrasiliaDateTime().date
            });
          }
        }
      } catch (syncErr) {
        console.error('Erro ao sincronizar tabela clientes:', syncErr);
      }
    }

    // Notificações para fluxo de clientes quando o frontend ainda usa app_kv_store.
    if (key === 'clients' && Array.isArray(finalData)) {
      try {
        const prevById = new Map((Array.isArray(previousData) ? previousData : []).map(it => [String(it.id || it.cnpj || it.codigo || ''), it]));
        for (const item of finalData) {
          const itemId = String(item.id || item.cnpj || item.codigo || '');
          if (!itemId) continue;
          const prev = prevById.get(itemId);
          const owner = item.userId || item.user_id || item.vendedor_id || item.seller_id;
          const status = String(item.status || '').trim();
          if (!prev && normalizeRole(status).includes('pendente')) {
            const targets = await obterDestinatarios('NOVO_CLIENTE', req.user, companyId);
            await notifyUsers(targets, { empresa_id: companyId, module:'clientes', record_id:itemId, target_hash:'#clientes', title:'Novo cliente para análise', body:`${req.user.name || 'Usuário'} cadastrou um novo cliente para aprovação.` });
          } else if (prev && String(prev.status || '') !== status) {
            const stNorm = normalizeRole(status);
            const prevNorm = normalizeRole(prev.status || '');
            const clientName = item.name || item.nome || item.fantasy_name || item.nomeFantasia || itemId;
            const reason = item.rejectionReason ? ` Motivo: ${item.rejectionReason}` : '';
            if (stNorm.includes('pendent') && (prevNorm.includes('ajuste') || prevNorm.includes('correc') || prevNorm.includes('reprov'))) {
              const targets = await obterDestinatarios('NOVO_CLIENTE', req.user, companyId);
              await notifyUsers(targets, { empresa_id: companyId, module:'clientes', record_id:itemId, target_hash:'#aprovacao', title:'Cadastro reenviado para aprovação', body:`${req.user.name || 'Usuário'} corrigiu e reenviou o cliente ${clientName} para análise.` });
            } else if (owner) {
              const title = stNorm.includes('reprov') ? 'Cliente reprovado' : ((stNorm.includes('correc') || stNorm.includes('analise') || stNorm.includes('ajuste')) ? 'Cadastro voltou para correção' : 'Cliente aprovado');
              await notifyUsers([owner], { empresa_id: companyId, module:'clientes', record_id:itemId, target_hash:'#clientes', title, body:`O cliente ${clientName} foi atualizado para: ${status}.${reason}` });
            }
          }
        }
      } catch (notifErr) { console.warn('Falha ao gerar notificações de clientes:', notifErr.message); }
    }
    res.json({ success: true, key });
  } catch (err) {
    console.error('Erro ao salvar item da store:', err);
    res.status(500).json({ error: 'Erro ao salvar dado no banco.' });
  }
});



function canApproveFinancial(user) {
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  return isAdminUser(user)
    || ['Financeiro', 'Responsável Financeiro', 'Responsavel Financeiro'].includes(user.profile)
    || perms.includes('Financeiro')
    || perms.includes('Aprovação de Saldo')
    || perms.includes('Aprovação de Despesas')
    || perms.includes('Despesas');
}

async function getRequestAndVerifyAccess(id, user) {
  const request = await db('despesas_solicitacoes').where({ id }).first();
  if (!request) return { errorStatus: 404, errorMessage: 'Solicitação não encontrada' };

  const isAdmin = isAdminUser(user);

  // Administrador enxerga e abre detalhes/PDF/exclui de qualquer empresa.
  // Para os demais perfis, compara como texto para evitar divergência 1 x "1"/"001".
  if (!isAdmin && String(request.empresa_id || '') !== String(user.empresa_id || '')) {
    return { errorStatus: 403, errorMessage: 'Acesso negado: empresa divergente' };
  }

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

  const bdt = getBrasiliaDateTime();
  const data_solicitacao = bdt.date;
  const hora_solicitacao = bdt.time;

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
    created_at: bdt.iso,
    updated_at: bdt.iso
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
        created_at: bdt.iso,
        updated_at: bdt.iso
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

    const targets = await obterDestinatarios('NOVA_SOLICITACAO_SALDO', req.user, targetEmpresaId);
    await notifyUsers(targets, {
      empresa_id: targetEmpresaId,
      module: 'saldo', record_id: String(id), target_hash: '#despesas',
      title: 'Nova solicitação de saldo',
      body: `${solicitante} solicitou saldo no valor total de R$ ${totalSolicitadoVal.toFixed(2)}.`
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
    const isActorAdmin = isAdminUser(req.user);

    let query = db('despesas_solicitacoes')
      .leftJoin('usuarios', 'despesas_solicitacoes.usuario_id', '=', 'usuarios.id')
      .select('despesas_solicitacoes.*', 'usuarios.unitId as unitId');

    if (!isActorAdmin) {
      query = query.where('despesas_solicitacoes.empresa_id', req.user.empresa_id);

      // Apply unit isolation
      if (req.user.unitId && req.user.unitId !== 'all') {
        query = query.where('usuarios.unitId', req.user.unitId);
      } else if (isFilterValValid(req.query.unitId) && req.query.unitId !== 'all') {
        query = query.where('usuarios.unitId', req.query.unitId);
      }
    } else {
      if (isFilterValValid(req.query.unitId) && req.query.unitId !== 'all') {
        query = query.where('usuarios.unitId', req.query.unitId);
      }
    }

    // Apply hierarchy limitation: vendedor -> só dele; supervisor -> vendedores vinculados; gerente -> supervisores/vendedores da cadeia.
    if (!isActorAdmin) {
      const permittedIds = await getPermittedSellerIds(req.user, db);
      query = query.whereIn('despesas_solicitacoes.usuario_id', permittedIds);
    }

    // Apply filters
    if (isFilterValValid(req.query.status)) {
      query = query.where('despesas_solicitacoes.status', req.query.status);
    }
    if (isFilterValValid(req.query.solicitante)) {
      query = query.where('despesas_solicitacoes.solicitante', 'like', `%${req.query.solicitante}%`);
    }
    if (isFilterValValid(req.query.data_inicio)) {
      query = query.where('despesas_solicitacoes.data_solicitacao', '>=', req.query.data_inicio);
    }
    if (isFilterValValid(req.query.data_fim)) {
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

      const isLiberado = reqRow.status === 'Aprovada' || reqRow.status === 'Aprovada (não valor total)';
      const itemApprovedValue = (item) => {
        const status = String(item.status || '').toLowerCase();
        if (status === 'reprovado' || status === 'correcao' || status === 'correção') return 0;
        return Number(item.valor_aprovado || 0);
      };
      const totalAprovado = items.length
        ? items.reduce((sum, item) => sum + itemApprovedValue(item), 0)
        : (isLiberado ? totalGeral : 0);

      const valorHotelAlimAprovado = items.length
        ? items.filter(item => /hosped|hotel|aliment/i.test(String(item.categoria || ''))).reduce((sum, item) => sum + itemApprovedValue(item), 0)
        : (isLiberado ? Number(reqRow.valor_hotel_alim || 0) : 0);
      const valorAbastecimentoAprovado = items.length
        ? items.filter(item => /abastec|combust/i.test(String(item.categoria || ''))).reduce((sum, item) => sum + itemApprovedValue(item), 0)
        : (isLiberado ? Number(reqRow.valor_abastecimento || 0) : 0);

      return {
        ...reqRow,
        extras,
        itens: items,
        totalGeral,
        totalAprovado,
        valor_hotel_alim_aprovado: valorHotelAlimAprovado,
        valor_abastecimento_aprovado: valorAbastecimentoAprovado,
        total_liberado: totalAprovado
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
      } else if (isFilterValValid(req.query.unitId) && req.query.unitId !== 'all') {
        query = query.where('usuarios.unitId', req.query.unitId);
      }
    } else {
      if (isFilterValValid(req.query.unitId) && req.query.unitId !== 'all') {
        query = query.where('usuarios.unitId', req.query.unitId);
      }
    }

    if (req.user.profile === 'Vendedor') {
      query = query.where('despesas_solicitacoes.usuario_id', req.user.id);
    }

    // Apply the same filters used by /api/despesas so dashboard metrics can follow the visible list.
    if (isFilterValValid(req.query.status)) {
      query = query.where('despesas_solicitacoes.status', req.query.status);
    }
    if (isFilterValValid(req.query.solicitante)) {
      query = query.where('despesas_solicitacoes.solicitante', 'like', `%${req.query.solicitante}%`);
    }
    if (isFilterValValid(req.query.data_inicio)) {
      query = query.where('despesas_solicitacoes.data_solicitacao', '>=', req.query.data_inicio);
    }
    if (isFilterValValid(req.query.data_fim)) {
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
    if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Somente administrador pode excluir registros.' });
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

  if (!canApproveFinancial(req.user)) {
    return res.status(403).json({ error: 'Acesso negado: perfil sem privilégio de aprovação financeira.' });
  }

  try {
    const { request, errorStatus, errorMessage } = await getRequestAndVerifyAccess(id, req.user);
    if (errorMessage) {
      return res.status(errorStatus).json({ error: errorMessage });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'A avaliação detalhada dos itens é obrigatória.' });
    }

    const bdt = getBrasiliaDateTime();
    const data_aprovacao = bdt.date;
    const hora_aprovacao = bdt.time;

    let generalStatus;
    let totalAprovado = 0;

    const result = await db.transaction(async (trx) => {
      let allApprovedIntegral = true;
      let allReproved = true;
      let hasCorrection = false;
      let localTotalAprovado = 0;

      for (const evalItem of items) {
        const dbItem = await trx('despesas_solicitacoes_itens')
          .where({ id: evalItem.id, solicitacao_id: id })
          .first();

        if (!dbItem) continue;

        let valAprovado = parseFloat(evalItem.valor_aprovado) || 0;
        const qtyAprovada = evalItem.quantidade_aprovada !== undefined && evalItem.quantidade_aprovada !== null ?
          parseInt(evalItem.quantidade_aprovada, 10) : null;

        const isReducedVal = valAprovado < dbItem.valor_solicitado;
        const isReducedQty = dbItem.quantidade_solicitada !== null && qtyAprovada < dbItem.quantidade_solicitada;

        let itemStatus = evalItem.status; // aprovado, aprovado parcialmente, reprovado, correcao
        if (itemStatus === 'correcao') {
          hasCorrection = true;
          allApprovedIntegral = false;
          allReproved = false;
        }
        if (itemStatus === 'aprovado' && (isReducedVal || isReducedQty)) {
          itemStatus = 'aprovado parcialmente';
        }

        if (itemStatus === 'correcao') {
          // Envio para correção não libera saldo e não reprova definitivamente.
          valAprovado = 0;
        }
        if (itemStatus !== 'reprovado' && itemStatus !== 'correcao') {
          allReproved = false;
          if (itemStatus === 'aprovado parcialmente') {
            allApprovedIntegral = false;
          }
          localTotalAprovado += valAprovado;
        } else {
          allApprovedIntegral = false;
        }

        // Update item in database
        await trx('despesas_solicitacoes_itens')
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
        const actionType = itemStatus === 'correcao' ? 'ENVIOU_ITEM_CORRECAO' : (itemStatus === 'reprovado' ? 'REPROVOU_ITEM' : (itemStatus === 'aprovado parcialmente' ? 'ALTEROU_VALOR' : 'APROVOU_ITEM'));
        await trx('auditoria_logs').insert({
          usuario_id: req.user.id,
          acao: actionType,
          detalhes: `Item ${dbItem.categoria} da solicitação #${id} avaliado como ${itemStatus.toUpperCase()} (Solicitado: R$ ${ccNum(dbItem.valor_solicitado).toFixed(2)}, Aprovado: R$ ${valAprovado.toFixed(2)}${dbItem.quantidade_solicitada ? ', Solicitado Qtd: ' + dbItem.quantidade_solicitada + ', Aprovado Qtd: ' + qtyAprovada : ''}). Justificativa: "${evalItem.justificativa || '-'}"`,
          empresa_id: req.user.empresa_id
        });
      }

      // Determine general status
      let localGeneralStatus = 'Pendente';
      if (hasCorrection) {
        localGeneralStatus = 'Correção Solicitada';
      } else if (allReproved) {
        localGeneralStatus = 'Rejeitada';
      } else if (allApprovedIntegral) {
        localGeneralStatus = 'Aprovada';
      } else {
        localGeneralStatus = 'Aprovada (não valor total)';
      }

      const now = new Date();

      // Update main request status
      await trx('despesas_solicitacoes').where({ id }).update({
        status: localGeneralStatus,
        updated_at: now.toISOString()
      });

      // Insert legacy approval log for backwards compatibility
      await trx('despesas_aprovacoes').insert({
        solicitacao_id: id,
        gerente_id: req.user.id,
        data_aprovacao,
        hora_aprovacao,
        observacao: observacao || `Avaliação detalhada concluída. Total Aprovado: R$ ${localTotalAprovado.toFixed(2)}`,
        status: localGeneralStatus,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      });

      // Auditoria Geral
      await trx('auditoria_logs').insert({
        usuario_id: req.user.id,
        acao: localGeneralStatus === 'Rejeitada' ? 'REPROVOU_ITEM' : 'APROVOU_ITEM',
        detalhes: `Solicitação #${id} finalizada com status geral ${localGeneralStatus.toUpperCase()} por ${req.user.name || req.user.id}. Total Aprovado Geral: R$ ${localTotalAprovado.toFixed(2)}`,
        empresa_id: req.user.empresa_id
      });

      return { generalStatus: localGeneralStatus, totalAprovado: localTotalAprovado };
    });

    generalStatus = result.generalStatus;
    totalAprovado = result.totalAprovado;

    // Log notification details
    const formattedItemsLog = items.map(evalItem => {
      const qStr = evalItem.quantidade_aprovada !== null && evalItem.quantidade_aprovada !== undefined ? `, Aprovado: ${evalItem.quantidade_aprovada} diárias` : '';
      return `${evalItem.categoria}:\nSolicitado: R$ ${evalItem.valor_solicitado || ''}\nAprovado: R$ ${evalItem.valor_aprovado}${qStr}\nMotivo: ${evalItem.justificativa || '-'}`;
    }).join('\n\n');
    console.log(`[NOTIFICAÇÃO EMAIL VENDEDOR] Sua solicitação de saldo foi analisada.\n\n${formattedItemsLog}`);

    const targets = await obterDestinatarios('PARECER_SALDO', request.usuario_id, request.empresa_id || req.user.empresa_id);
    await notifyUsers(targets, {
      empresa_id: request.empresa_id || req.user.empresa_id,
      module: 'saldo', record_id: String(id), target_hash: '#despesas',
      title: generalStatus === 'Correção Solicitada' ? 'Solicitação de saldo enviada para correção' : (generalStatus === 'Rejeitada' ? 'Solicitação de saldo reprovada' : 'Solicitação de saldo aprovada'),
      body: `Sua solicitação de saldo #${id} foi avaliada como ${generalStatus}. Total aprovado: R$ ${totalAprovado.toFixed(2)}.`
    });

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
    if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Somente administrador pode excluir registros.' });
    const { request, errorStatus, errorMessage } = await getRequestAndVerifyAccess(id, req.user);
    if (errorMessage) {
      return res.status(errorStatus).json({ error: errorMessage });
    }

    // Permitir que o administrador exclua solicitações em qualquer status

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

  if (!['Troca', 'Adição', 'Adição', 'Recolha', 'Adesivar'].includes(tipo_solicitacao)) {
    return res.status(400).json({ error: 'Tipo de solicitação inválido.' });
  }
  if (tipo_solicitacao === 'Troca' && (!patrimonio || !modelo || !detalhe_troca_adicao)) {
    return res.status(400).json({ error: 'Para registrar Troca, preencha patrimônio/modelo antigo e motivo da troca.' });
  }

  const now = new Date().toISOString();
  const empresaMovimentacao = empresa || req.user.empresa_name || req.user.empresa_id;

  try {
    // 1. Cadastra automaticamente o patrimônio antigo/único se não existir
    const pCode = (tipo_solicitacao === 'Troca') ? patrimonio : (patrimonio || patrimonio_novo);
    if (pCode) {
      const exists = await db('equipamentos_patrimonio').where({ patrimonio: pCode }).first();
      if (!exists) {
        await db('equipamentos_patrimonio').insert({
          patrimonio: pCode,
          empresa: empresaMovimentacao,
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
          empresa: empresaMovimentacao,
          modelo: modelo_novo || 'Modelo não especificado',
          voltagem: voltagem_nova || '110',
          status: 'Pendente',
          created_at: now,
          updated_at: now
        });
      }
    }

    // 3. Evita duplicidade por clique duplo/múltiplos listeners: se uma movimentação idêntica foi criada agora, retorna a mesma.
    const recentLimit = new Date(Date.now() - 15000).toISOString();
    const duplicate = await db('equipamentos_movimentacoes')
      .where({
        empresa: empresaMovimentacao,
        tipo_solicitacao,
        vendedor_id: req.user.id,
        cliente_nome,
        cliente_cidade,
        patrimonio: patrimonio || '',
        modelo: modelo || '',
        status: 'Pendente'
      })
      .where('created_at', '>=', recentLimit)
      .first();
    if (duplicate) {
      return res.json({ success: true, id: duplicate.id, duplicate_prevented: true });
    }

    // 4. Insere a movimentação
    const newId = await insertAndGetId('equipamentos_movimentacoes', {
      empresa: empresaMovimentacao,
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

    await registrarAuditoriaSistema(req, {
      acao: 'CRIOU_MOVIMENTACAO_EQUIPAMENTO',
      modulo: 'Movimentação de Equipamentos',
      registro_id: newId,
      detalhes: `${req.user.name || req.user.id} registrou ${tipo_solicitacao} de equipamento para o cliente ${cliente_nome}.`,
      dados_depois: { id: newId, empresa: empresaMovimentacao, tipo_solicitacao, cliente_codigo, cliente_nome, cliente_cidade, patrimonio, patrimonio_novo, vendedor_solicitante }
    });

    // Simulação de Notificação por E-mail
    try {
      const emailConfig = fs.existsSync(configFilePath) ? JSON.parse(fs.readFileSync(configFilePath, 'utf8')) : { emails: 'notificacoes@distribuidorajds.com.br, equipamentos@distribuidorajds.com.br' };
      console.log(`[NOTIFICAÇÃO EMAIL] Nova movimentação registrada (ID: ${newId}) por ${vendedor_solicitante}. Notificação de e-mail enviada para os responsáveis: ${emailConfig.emails}`);
    } catch (err) {
      console.error('Erro ao gerar log de notificação por e-mail:', err);
    }

    const companyId = req.user.empresa_id || '001';
    const targets = await obterDestinatarios('NOVA_MOVIMENTACAO_EQUIPAMENTO', req.user, companyId);
    await notifyUsers(targets, {
      empresa_id: companyId,
      module: 'movimentacao', record_id: String(newId), target_hash: '#movimentacao',
      title: 'Nova movimentação de equipamento',
      body: `${req.user.name || vendedor_solicitante} registrou ${tipo_solicitacao} para o cliente ${cliente_nome}.`
    });

    res.json({ success: true, id: newId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gravar movimentação de equipamento' });
  }
});

// Listagem de Movimentações (com filtros de pesquisa e restrições de perfil)
app.get('/api/equipamentos/movimentacoes', async (req, res) => {
  try {
    const profileNorm = normalizeRole(req.user && req.user.profile);
    const isActorAdmin = [
      'administrador', 'administrador sistema', 
      'responsavel equipamentos', 'gestor equipamentos', 'gestor de equipamentos', 
      'conferente', 'financeiro'
    ].includes(profileNorm) 
    || hasAnyPermission(req.user, [
      'Administrador', 'Administrador (Acesso Total)', 
      'Responsável Equipamentos', 'Gestor Equipamentos', 'Gestor de Equipamentos', 
      'Equipamentos', 'Avaliação de Movimentação', 'Confirmação de Movimentação'
    ]);

    let query = db('equipamentos_movimentacoes').where(function() {
      this.where('equipamentos_movimentacoes.excluido', false).orWhereNull('equipamentos_movimentacoes.excluido');
    });

    if (!isActorAdmin) {
      query = query.where(function(){ this.where('equipamentos_movimentacoes.empresa', req.user.empresa_name || '').orWhere('equipamentos_movimentacoes.empresa', req.user.empresa_id || '').orWhere('equipamentos_movimentacoes.vendedor_id', req.user.id); });

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
    if (isFilterValValid(req.query.empresa)) {
      query = query.where('equipamentos_movimentacoes.empresa', req.query.empresa);
    }
    if (isFilterValValid(req.query.cidade)) {
      query = query.where('equipamentos_movimentacoes.cliente_cidade', 'like', `%${req.query.cidade}%`);
    }
    if (isFilterValValid(req.query.vendedor)) {
      query = query.where('equipamentos_movimentacoes.vendedor_solicitante', 'like', `%${req.query.vendedor}%`);
    }
    if (isFilterValValid(req.query.patrimonio)) {
      const p = req.query.patrimonio;
      query = query.andWhere(function() {
        this.where('equipamentos_movimentacoes.patrimonio', 'like', `%${p}%`)
            .orWhere('equipamentos_movimentacoes.patrimonio_novo', 'like', `%${p}%`);
      });
    }
    if (isFilterValValid(req.query.tipo_solicitacao)) {
      query = query.where('equipamentos_movimentacoes.tipo_solicitacao', req.query.tipo_solicitacao);
    }
    if (isFilterValValid(req.query.status)) {
      query = query.where('equipamentos_movimentacoes.status', req.query.status);
    }
    if (isFilterValValid(req.query.data_inicio)) {
      query = query.where('equipamentos_movimentacoes.created_at', '>=', req.query.data_inicio);
    }
    if (isFilterValValid(req.query.data_fim)) {
      query = query.where('equipamentos_movimentacoes.created_at', '<=', req.query.data_fim + 'T23:59:59');
    }

    const list = await query.orderBy('equipamentos_movimentacoes.id', 'desc');
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar movimentações' });
  }
});

app.put('/api/equipamentos/movimentacoes/:id', async (req, res) => {
  try {
    if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Somente administrador pode editar movimentações.' });
    const mov = await db('equipamentos_movimentacoes').where({ id: req.params.id }).first();
    if (!mov) return res.status(404).json({ error: 'Movimentação não encontrada.' });
    const body = req.body || {};
    const allowed = [
      'empresa', 'tipo_solicitacao', 'vendedor_solicitante', 'cliente_codigo', 'cliente_nome', 'cliente_cidade',
      'cliente_endereco', 'cliente_vendedor', 'status', 'observacao', 'patrimonio', 'modelo', 'voltagem',
      'patrimonio_novo', 'modelo_novo', 'voltagem_nova', 'quantidade', 'detalhe_troca_adicao',
      'motivo_recolhimento', 'foto_equipamento_url', 'foto_antes_url', 'foto_depois_url', 'video_url',
      'equipamento_confirmado_patrimonio', 'equipamento_confirmado_modelo', 'equipamento_confirmado_voltagem',
      'parecer_gestor', 'motivo_reprovacao'
    ];
    const updates = { updated_at: new Date().toISOString() };
    for (const field of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, field)) updates[field] = body[field] == null ? '' : body[field];
    }
    await db('equipamentos_movimentacoes').where({ id: req.params.id }).update(updates);
    await registrarAuditoriaSistema(req, {
      acao: 'EDITOU_MOVIMENTACAO_EQUIPAMENTO',
      modulo: 'Movimentação de Equipamentos',
      registro_id: req.params.id,
      detalhes: `${req.user.name || req.user.id} editou movimentação #${req.params.id}.`,
      dados_antes: mov,
      dados_depois: { ...mov, ...updates }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao editar movimentação:', err);
    res.status(500).json({ error: 'Erro ao editar movimentação.' });
  }
});

// Exclusão lógica de movimentações com histórico de auditoria
app.post('/api/equipamentos/movimentacoes/delete', async (req, res) => {
  const { ids, motivo_exclusao } = req.body || {};
  if (!hasAnyPermission(req.user, ['Administrador', 'Administrador sistema', 'Administrador (Acesso Total)'])) {
    return res.status(403).json({ error: 'Somente administrador pode excluir movimentações.' });
  }
  const cleanIds = Array.isArray(ids) ? ids.map(id => String(id).trim()).filter(Boolean) : [];
  if (!cleanIds.length) return res.status(400).json({ error: 'Nenhuma movimentação selecionada.' });
  const now = new Date().toISOString();
  try {
    const rows = await db('equipamentos_movimentacoes').whereIn('id', cleanIds);
    for (const row of rows) {
      await db('historico_exclusoes').insert({
        modulo: 'Movimentação de Equipamento',
        registro_id: String(row.id),
        dados_json: JSON.stringify(row),
        criado_por: row.vendedor_solicitante || row.vendedor_id || '',
        excluido_por: req.user.name || req.user.nome || req.user.id,
        motivo: motivo_exclusao || 'Sem motivo informado',
        created_at: now
      });
      await registrarAuditoriaSistema(req, {
        acao: 'EXCLUIU_MOVIMENTACAO_EQUIPAMENTO',
        modulo: 'Movimentação de Equipamentos',
        registro_id: row.id,
        detalhes: `${req.user.name || req.user.id} excluiu movimentação #${row.id}. Motivo: ${motivo_exclusao || 'Sem motivo informado'}.`,
        dados_antes: row
      });
    }
    await db('equipamentos_movimentacoes').whereIn('id', cleanIds).delete();
    res.json({ success: true, count: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir movimentações.' });
  }
});

// Histórico de exclusões visível somente ao administrador
app.get('/api/historico-exclusoes', async (req, res) => {
  if (req.user.profile !== 'Administrador') {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  try {
    const rows = await db('historico_exclusoes').orderBy('id', 'desc').limit(500);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar histórico de exclusões.' });
  }
});

// Restaurar registro excluído (Movimentação de Equipamento)
app.post('/api/historico-exclusoes/restore/:id', async (req, res) => {
  try {
    if (req.user.profile !== 'Administrador') {
      return res.status(403).json({ error: 'Somente administrador pode restaurar exclusões.' });
    }
    const exclusion = await db('historico_exclusoes').where({ id: req.params.id }).first();
    if (!exclusion) {
      return res.status(404).json({ error: 'Registro de exclusão não encontrado.' });
    }
    
    const parsedData = JSON.parse(exclusion.dados_json);
    
    if (exclusion.modulo === 'Movimentação de Equipamento') {
      const existing = await db('equipamentos_movimentacoes').where({ id: parsedData.id }).first();
      if (existing) {
        return res.status(400).json({ error: 'Esta movimentação já existe no sistema.' });
      }
      
      await db('equipamentos_movimentacoes').insert(parsedData);
      
      await registrarAuditoriaSistema(req, {
        acao: 'RESTAUROU_MOVIMENTACAO_EQUIPAMENTO',
        modulo: 'Movimentação de Equipamentos',
        registro_id: parsedData.id,
        detalhes: `${req.user.name || req.user.id} restaurou a movimentação #${parsedData.id} que havia sido excluída.`,
        dados_depois: parsedData
      });
      
      await db('historico_exclusoes').where({ id: exclusion.id }).delete();
      
      return res.json({ success: true, message: 'Movimentação restaurada com sucesso!' });
    } else {
      return res.status(400).json({ error: 'Restauração não suportada para este tipo de módulo.' });
    }
  } catch (err) {
    console.error('Erro ao restaurar registro excluído:', err);
    res.status(500).json({ error: 'Erro ao restaurar registro.' });
  }
});

// Detalhes / Dossiê completo da Movimentação
app.get('/api/equipamentos/movimentacoes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const mov = await db('equipamentos_movimentacoes')
      .where({ id })
      .andWhere(function() { this.where('excluido', false).orWhereNull('excluido'); })
      .first();

    if (!mov) {
      return res.status(404).json({ error: 'Movimentação não encontrada' });
    }

    const profileNorm = normalizeRole(req.user && req.user.profile);
    const movementViewPerms = Array.isArray(req.user.permissions) ? req.user.permissions : asArrayPermissions(req.user);
    const isAdminOrStaff = ['administrador', 'administrador sistema', 'responsavel equipamentos', 'gestor equipamentos', 'gestor de equipamentos', 'conferente', 'financeiro']
      .includes(profileNorm)
      || hasAnyPermission(req.user, ['Administrador', 'Administrador (Acesso Total)', 'Responsável Equipamentos', 'Gestor Equipamentos', 'Gestor de Equipamentos', 'Equipamentos', 'Avaliação de Movimentação', 'Confirmação de Movimentação']);

    if (!isAdminOrStaff) {
      const permittedIds = await getPermittedSellerIds(req.user, db);
      const movSellerId = mov.vendedor_id == null ? null : String(mov.vendedor_id);
      const userId = req.user && req.user.id == null ? null : String(req.user.id);
      const canViewByHierarchy = movSellerId && permittedIds.map(String).includes(movSellerId);
      const canViewOwn = movSellerId && userId && movSellerId === userId;
      if (!canViewByHierarchy && !canViewOwn) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
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
  const { status, motivo_reprovacao, patrimonio_novo, modelo_novo, voltagem_nova } = req.body;

  const profileNorm = normalizeRole(req.user && req.user.profile);
  const canApproveMovement = ['administrador', 'administrador sistema', 'responsavel equipamentos', 'gestor equipamentos', 'gestor de equipamentos'].includes(profileNorm)
    || hasAnyPermission(req.user, [
      'Administrador',
      'Administrador (Acesso Total)',
      'Responsável Equipamentos',
      'Gestor Equipamentos',
      'Gestor de Equipamentos',
      'Confirmação de Movimentação',
      'Confirmação de Troca',
      'Avaliação de Movimentação',
      'Equipamentos'
    ]);
  if (!canApproveMovement) {
    return res.status(403).json({ error: 'Acesso negado: somente responsável por equipamentos ou usuário com permissão de confirmação pode aprovar movimentação.' });
  }

  if (status === 'Reprovado' && !motivo_reprovacao) {
    return res.status(400).json({ error: 'Motivo de reprovação é obrigatório' });
  }

  try {
    const mov = await db('equipamentos_movimentacoes')
      .where({ id })
      .andWhere(function() { this.where('excluido', false).orWhereNull('excluido'); })
      .first();
    if (!mov) {
      return res.status(404).json({ error: 'Movimentação não encontrada' });
    }

    const now = new Date().toISOString();

    if (status === 'Aprovado' && ['Troca', 'Adição'].includes(mov.tipo_solicitacao)) {
      if (!patrimonio_novo || !modelo_novo || !voltagem_nova) {
        return res.status(400).json({ error: 'Patrimônio, modelo e voltagem do equipamento confirmado são obrigatórios para aprovar.' });
      }
    }

    const updateMovement = {
      status,
      motivo_reprovacao: status === 'Reprovado' ? motivo_reprovacao : null,
      aprovado_por: req.user.id,
      aprovado_em: now,
      updated_at: now
    };
    if (status === 'Aprovado' && ['Troca', 'Adição'].includes(mov.tipo_solicitacao)) {
      updateMovement.patrimonio_novo = String(patrimonio_novo || '').trim().toUpperCase();
      updateMovement.modelo_novo = String(modelo_novo || '').trim();
      updateMovement.voltagem_nova = String(voltagem_nova || '').trim().replace(/\s*V$/i, '');
      if (mov.tipo_solicitacao === 'Adição') {
        updateMovement.patrimonio = updateMovement.patrimonio_novo;
        updateMovement.modelo = updateMovement.modelo_novo;
        updateMovement.voltagem = updateMovement.voltagem_nova;
      }
      Object.assign(mov, updateMovement);
    }

    // 1. Atualizar status da movimentação
    await db('equipamentos_movimentacoes').where({ id }).update(updateMovement);
    await registrarAuditoriaSistema(req, {
      acao: status === 'Aprovado' ? 'APROVOU_MOVIMENTACAO_EQUIPAMENTO' : (status === 'Reprovado' ? 'REPROVOU_MOVIMENTACAO_EQUIPAMENTO' : 'EDITOU_MOVIMENTACAO_EQUIPAMENTO'),
      modulo: 'Movimentação de Equipamentos',
      registro_id: id,
      detalhes: `${req.user.name || req.user.id} alterou movimentação #${id} para ${status}.`,
      dados_antes: mov,
      dados_depois: updateMovement
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
        const existsAdd = await db('equipamentos_patrimonio').where({ patrimonio: mov.patrimonio }).first();
        if (!existsAdd) {
          await db('equipamentos_patrimonio').insert({
            patrimonio: mov.patrimonio,
            empresa: req.user.empresa_name || req.user.empresa_id,
            modelo: mov.modelo || 'Modelo não especificado',
            voltagem: mov.voltagem || '',
            status: 'Instalado',
            cliente_atual_id: clientFields.cliente_atual_id,
            cliente_atual_nome: clientFields.cliente_atual_name,
            cliente_atual_cidade: clientFields.cliente_atual_cidade,
            cliente_atual_endereco: clientFields.cliente_atual_endereco,
            created_at: now,
            updated_at: now
          });
        } else {
          await db('equipamentos_patrimonio')
            .where({ patrimonio: mov.patrimonio })
            .update({
              modelo: mov.modelo || existsAdd.modelo,
              voltagem: mov.voltagem || existsAdd.voltagem,
              cliente_atual_id: clientFields.cliente_atual_id,
              cliente_atual_nome: clientFields.cliente_atual_name,
              cliente_atual_cidade: clientFields.cliente_atual_cidade,
              cliente_atual_endereco: clientFields.cliente_atual_endereco,
              status: 'Instalado',
              updated_at: now
            });
        }
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
        const existsNewInstall = await db('equipamentos_patrimonio').where({ patrimonio: mov.patrimonio_novo }).first();
        if (!existsNewInstall) {
          await db('equipamentos_patrimonio').insert({
            patrimonio: mov.patrimonio_novo,
            empresa: req.user.empresa_name || req.user.empresa_id,
            modelo: mov.modelo_novo || 'Modelo não especificado',
            voltagem: mov.voltagem_nova || '',
            cliente_atual_id: clientFields.cliente_atual_id,
            cliente_atual_nome: clientFields.cliente_atual_name,
            cliente_atual_cidade: clientFields.cliente_atual_cidade,
            cliente_atual_endereco: clientFields.cliente_atual_endereco,
            status: 'Instalado',
            created_at: now,
            updated_at: now
          });
        } else {
          await db('equipamentos_patrimonio')
            .where({ patrimonio: mov.patrimonio_novo })
            .update({
              modelo: mov.modelo_novo || existsNewInstall.modelo,
              voltagem: mov.voltagem_nova || existsNewInstall.voltagem,
              cliente_atual_id: clientFields.cliente_atual_id,
              cliente_atual_nome: clientFields.cliente_atual_name,
              cliente_atual_cidade: clientFields.cliente_atual_cidade,
              cliente_atual_endereco: clientFields.cliente_atual_endereco,
              status: 'Instalado',
              updated_at: now
            });
        }
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

    // 3. Sincronizar com o KV store 'equipments'
    try {
      const companyId = req.user.empresa_id || '001';
      const kvRows = await db('app_kv_store')
        .where({ company_id: companyId })
        .andWhere(function() {
          this.where('store_key', 'equipments')
              .orWhere('store_key', 'like', '%_equipments');
        });
      for (const kvRow of kvRows) {
        let equipments = safeParseStoreJson(kvRow.data_json, []);
        if (Array.isArray(equipments)) {
          let updatedAny = false;
          
          const updateEq = (pat, fields) => {
            equipments = equipments.map(eq => {
              const eqPatStr = String(eq.serial || eq.patrimonio || eq.codigo || '').trim();
              const targetPatStr = String(pat).trim();
              if (eqPatStr && targetPatStr && eqPatStr === targetPatStr) {
                updatedAny = true;
                return { ...eq, ...fields, updated_at: now };
              }
              return eq;
            });
          };

          if (status === 'Aprovado') {
            const clientFields = {
              cliente_atual_id: mov.cliente_codigo || null,
              cliente_atual_name: mov.cliente_nome,
              cliente_atual_cidade: mov.cliente_cidade,
              cliente_atual_endereco: mov.cliente_endereco || null
            };

            if (mov.tipo_solicitacao === 'Adição') {
              updateEq(mov.patrimonio, {
                cliente_atual_id: clientFields.cliente_atual_id,
                cliente_atual_name: clientFields.cliente_atual_name,
                cliente_atual_cidade: clientFields.cliente_atual_cidade,
                cliente_atual_endereco: clientFields.cliente_atual_endereco,
                status: 'Instalado'
              });
            } else if (mov.tipo_solicitacao === 'Recolha') {
              updateEq(mov.patrimonio, {
                cliente_atual_id: null,
                cliente_atual_name: null,
                cliente_atual_cidade: null,
                cliente_atual_endereco: null,
                status: 'Recolhido'
              });
            } else if (mov.tipo_solicitacao === 'Adesivar') {
              updateEq(mov.patrimonio, {
                status: 'Instalado'
              });
            } else if (mov.tipo_solicitacao === 'Troca') {
              // Antigo -> Recolhido
              updateEq(mov.patrimonio, {
                cliente_atual_id: null,
                cliente_atual_name: null,
                cliente_atual_cidade: null,
                cliente_atual_endereco: null,
                status: 'Recolhido'
              });
              // Novo -> Instalado
              updateEq(mov.patrimonio_novo, {
                cliente_atual_id: clientFields.cliente_atual_id,
                cliente_atual_name: clientFields.cliente_atual_name,
                cliente_atual_cidade: clientFields.cliente_atual_cidade,
                cliente_atual_endereco: clientFields.cliente_atual_endereco,
                status: 'Instalado'
              });
            }
          } else if (status === 'Reprovado') {
            const pCode = (mov.tipo_solicitacao === 'Troca') ? mov.patrimonio : (mov.patrimonio || mov.patrimonio_novo);
            if (pCode) {
              updateEq(pCode, {
                status: 'Pendente - Reprovado'
              });
            }
          }

          if (updatedAny) {
            await db('app_kv_store').where({ id: kvRow.id }).update({
              data_json: JSON.stringify(equipments),
              updated_by: req.user.id,
              updated_at: now
            });
          }
        }
      }
    } catch (kvErr) {
      console.error('Erro ao sincronizar KV store de equipamentos:', kvErr);
    }

    // 4. Notificar o vendedor solicitante sobre a decisão da movimentação
    try {
      let sellerId = mov.vendedor_id ? String(mov.vendedor_id) : null;
      if (!sellerId && mov.vendedor_solicitante) {
        const seller = await db('usuarios')
          .where(function() {
            this.where('name', mov.vendedor_solicitante)
              .orWhere('nome', mov.vendedor_solicitante)
              .orWhere('email', mov.vendedor_solicitante);
          })
          .first()
          .catch(() => null);
        if (seller && seller.id) sellerId = String(seller.id);
      }

      const companyId = mov.empresa_id || req.user.empresa_id || '001';
      const targets = await obterDestinatarios('APROVACAO_MOVIMENTACAO', sellerId, companyId);
      const isApproved = status === 'Aprovado';
      await notifyUsers(targets, {
        empresa_id: companyId,
        module: 'equipamentos_movimentacoes',
        record_id: String(id),
        target_hash: '#movimentacao',
        title: isApproved ? 'Movimentação aprovada' : 'Movimentação reprovada',
        body: isApproved
          ? `Sua movimentação de equipamento #${id} foi aprovada.`
          : `Sua movimentação de equipamento #${id} foi reprovada. Verifique o motivo no dossiê.`
      });
    } catch (notifyErr) {
      console.warn('Falha ao notificar vendedor sobre movimentação:', notifyErr.message);
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
app.post(['/api/login', '/api/auth/login'], async (req, res) => {
  const username = req.body.username || req.body.login || req.body.email;
  const { password } = req.body;
  const empresa_id = req.body.empresa_id || req.body.company_id || req.body.companyId || null;
  if (!username || !password) {
    return res.status(400).json({ error: 'Informe e-mail/usuário e senha' });
  }

  try {
    const loginKey = String(username).trim().toLowerCase();
    
    // 1. Tenta achar o usuário com username/email, empresa_id e senha corretos.
    // Se o frontend antigo não enviar empresa_id, busca em qualquer empresa.
    let loginQuery = db('usuarios')
      .where(function() {
        this.where('username', loginKey)
            .orWhere('email', loginKey);
      })
      .andWhere({ password });

    if (empresa_id) {
      loginQuery = loginQuery.andWhere({ empresa_id });
    }

    let user = await loginQuery.first();

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
      let userLookupQuery = db('usuarios')
        .where(function() {
          this.where('username', loginKey)
              .orWhere('email', loginKey);
        });

      if (empresa_id) {
        userLookupQuery = userLookupQuery.andWhere({ empresa_id });
      }

      user = await userLookupQuery.first();

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

// Permissões padrão por perfil
function getDefaultPermissionsForProfile(profile) {
  const defaults = {
    'Administrador': ['Dashboard','Clientes','Produtos','Estoque','Financeiro','Solicitação de Saldo','Aprovação de Saldo','Despesas','Despesas de Campo','Aprovação de Despesas','Relatórios','Usuários','Configurações','Administrador','Chamados','Chamados Mecânicos','Equipamentos','Simulador de Troca','Confirmação de Troca'],
    'Supervisor': ['Dashboard','Clientes','Prospecção','Despesas','Despesas de Campo','Chamados','Chamados Mecânicos','Movimentação','Solicitação de Saldo','Aprovação de Saldo','Aprovação de Despesas','Relatórios','Usuários','Simulador de Troca'],
    'Vendedor': ['Dashboard','Clientes','Prospecção','Despesas','Despesas de Campo','Movimentação','Solicitação de Saldo','Relatórios','Simulador de Troca'],
    'Financeiro': ['Dashboard','Financeiro','Solicitação de Saldo','Aprovação de Saldo','Despesas','Despesas de Campo','Aprovação de Despesas','Relatórios'],
    'Conferente': ['Dashboard','Chamados','Equipamentos','Movimentação'],
    'Responsável Equipamentos': ['Dashboard','Equipamentos','Movimentação','Chamados','Chamados Mecânicos'],
    'Mecânico': ['Dashboard','Chamados','Chamados Mecânicos']
  };
  return defaults[profile] || ['Dashboard'];
}

// Register / Create User
app.post('/api/usuarios', async (req, res) => {
  const { id, name, username, password, profile, unitId, email, phone, photo, linked_users, supervisor_id } = req.body;
  
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
      supervisor_id: profile === 'Vendedor' ? (supervisor_id || null) : null,
      status: canManageUsers ? 'LIBERADO' : 'AGUARDANDO LIBERAÇÃO',
      empresa_id: companyId,
      permissions: JSON.stringify(getDefaultPermissionsForProfile(profile)),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await db('usuarios').insert(newUser);

    // Se for Vendedor com supervisor vinculado, criar link hierárquico
    if (profile === 'Vendedor' && supervisor_id) {
      const now = new Date().toISOString();
      await db('user_hierarchy_links').insert({
        company_id: companyId,
        parent_user_id: supervisor_id,
        child_user_id: userId,
        relation_type: 'supervisor_seller',
        created_at: now,
        updated_at: now
      }).catch(() => {});
    }

    // Se for Supervisor com vendedores vinculados, criar links hierárquicos
    if (profile === 'Supervisor' && Array.isArray(linked_users) && linked_users.length > 0) {
      const now = new Date().toISOString();
      const linksToInsert = linked_users.map(childId => ({
        company_id: companyId,
        parent_user_id: userId,
        child_user_id: childId,
        relation_type: 'supervisor_seller',
        created_at: now,
        updated_at: now
      }));
      await db('user_hierarchy_links').insert(linksToInsert).catch(() => {});
    }

    // Auditoria
    await db('auditoria_logs').insert({
      usuario_id: req.user.id || 'sistema',
      acao: 'CRIOU_USUARIO',
      detalhes: `Usuário ${name} (${username}) criado com perfil ${profile} e status ${newUser.status}.`,
      empresa_id: companyId
    });

    res.json({ success: true, user: { id: userId, name, username, status: newUser.status } });
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

    query = query.where({ empresa_id: companyId });

    if (!isActorAdmin) {
      // Administrador/Usuário com permissão 'Usuários' enxerga todos os usuários da empresa, mesmo que ele esteja vinculado a uma unidade.
      // Usuário comum sem permissão continua preso somente à própria unidade.
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
// Lista apenas Vendedores ativos/aguardando para vínculo com Supervisor
app.get('/api/usuarios/vendedores', async (req, res) => {
  try {
    const companyId = req.user.empresa_id;
    const list = await db('usuarios')
      .where({ empresa_id: companyId, profile: 'Vendedor' })
      .whereIn('status', ['LIBERADO', 'AGUARDANDO LIBERAÇÃO'])
      .orderBy('name', 'asc');
    res.json(list.map(u => ({ id: u.id, name: u.name, username: u.username, status: u.status, unitId: u.unitId })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar vendedores' });
  }
});

// Lista apenas Supervisores ativos/aguardando para vínculo com Vendedor
app.get('/api/usuarios/supervisores', async (req, res) => {
  try {
    const companyId = req.user.empresa_id;
    const list = await db('usuarios')
      .where({ empresa_id: companyId, profile: 'Supervisor' })
      .whereIn('status', ['LIBERADO', 'AGUARDANDO LIBERAÇÃO'])
      .orderBy('name', 'asc');
    res.json(list.map(u => ({ id: u.id, name: u.name, username: u.username, status: u.status, unitId: u.unitId })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar supervisores' });
  }
});

app.get('/api/usuarios/:id', async (req, res) => {

  const { id } = req.params;

  try {
    const actor = req.user || {};
    const actorPerms = actor.permissions || [];
    const isActorAdmin = actor.profile === 'Administrador' || actorPerms.includes('Administrador');
    const canManageUsers = isActorAdmin || actorPerms.includes('Usuários');

    let user = await db('usuarios').where({ id, empresa_id: req.user.empresa_id }).first();

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
      supervisor_id: user.supervisor_id || null,
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
  let { permissions, status, profile, unitId, name, username, email, phone, password, photo, empresa_id, linked_users, supervisor_id } = req.body;

  try {
    let userToEdit = await db('usuarios').where({ id, empresa_id: req.user.empresa_id }).first();
    if (!userToEdit) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const actor = req.user || {};
    const actorPerms = actor.permissions || [];
    const canManageUsers = actor.profile === 'Administrador' || actorPerms.includes('Administrador') || actorPerms.includes('Usuários');
    
    const isSelf = String(actor.id) === String(id);
    if (!isSelf && !canManageUsers) {
      return res.status(403).json({ error: 'Acesso negado: sem permissão para editar outros usuários.' });
    }

    if (isSelf) {
      // Prevent user from self-escalating role/permissions
      permissions = undefined;
      status = undefined;
      profile = undefined;
      unitId = undefined;
      empresa_id = undefined;
      linked_users = undefined;
      supervisor_id = undefined;
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
    if (password !== undefined && String(password).trim() !== '') {
      updatedData.password = password;
    }
    if (photo !== undefined) {
      updatedData.photo = photo;
    }
    if (empresa_id !== undefined) {
      updatedData.empresa_id = empresa_id;
    }

    const targetProfile = profile !== undefined ? profile : userToEdit.profile;
    const targetEmpresa = empresa_id !== undefined ? empresa_id : originalEmpresaId;

    if (targetProfile !== 'Vendedor') {
      updatedData.supervisor_id = null;
    } else if (supervisor_id !== undefined) {
      updatedData.supervisor_id = supervisor_id || null;
    }

    await db('usuarios').where({ id }).update(updatedData);

    // Update supervisor link for Vendedor child
    if (targetProfile !== 'Vendedor') {
      await db('user_hierarchy_links')
        .where({ child_user_id: id, relation_type: 'supervisor_seller' })
        .del()
        .catch(() => {});
    } else if (supervisor_id !== undefined) {
      await db('user_hierarchy_links')
        .where({ child_user_id: id, relation_type: 'supervisor_seller' })
        .del()
        .catch(() => {});
      
      if (supervisor_id) {
        await db('user_hierarchy_links').insert({
          company_id: targetEmpresa,
          parent_user_id: supervisor_id,
          child_user_id: id,
          relation_type: 'supervisor_seller',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).catch(() => {});
      }
    }

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
    const canManageUsers = isActorAdmin;

    if (!canManageUsers) {
      return res.status(403).json({ error: 'Apenas administrador pode excluir usuários' });
    }

    if (actor.id === id) {
      return res.status(400).json({ error: 'Você não pode excluir o próprio usuário logado' });
    }

    let userToDelete = await db('usuarios').where({ id, empresa_id: req.user.empresa_id }).first();
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
    const bdt = getBrasiliaDateTime();
    const newRecord = {
      id,
      empresa_id,
      userId: req.user.id,
      unitId: (req.user.unitId && req.user.unitId !== 'all') ? req.user.unitId : (unitId || 'all'),
      date: date || bdt.date,
      time: time || bdt.time.slice(0, 5),
      finalidade,
      operacao,
      descreva: descreva || '',
      veiculo: veiculo || '',
      km: km ? parseInt(km, 10) : null,
      foto_odometro: foto_odometro || '',
      foto_comprovante: foto_comprovante || '',
      value: ccNum(value),
      observation: observation || '',
      status: 'Pendente',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const recentSimilar = await db('despesas_reembolsos')
      .where({
        empresa_id,
        userId: req.user.id,
        unitId: newRecord.unitId,
        date: newRecord.date,
        finalidade: newRecord.finalidade,
        operacao: newRecord.operacao
      })
      .orderBy('created_at', 'desc')
      .first();

    if (recentSimilar) {
      const recentTime = new Date(recentSimilar.created_at || recentSimilar.updated_at || 0).getTime();
      const sameValue = Number(recentSimilar.value || 0) === Number(newRecord.value || 0);
      if (sameValue && Number.isFinite(recentTime) && (Date.now() - recentTime) < 90000) {
        return res.json({ success: true, id: recentSimilar.id, duplicateIgnored: true });
      }
    }

    await db('despesas_reembolsos').insert(newRecord);

    // Auditoria
    await db('auditoria_logs').insert({
      usuario_id: req.user.id,
      acao: 'REGISTROU_DESPESA',
      detalhes: `Despesa de campo #${id} (${finalidade}) registrado por ${req.user.name || req.user.id} no valor de R$ ${(parseFloat(value || 0)).toFixed(2)}`,
      empresa_id
    });

    const targets = await obterDestinatarios('NOVA_DESPESA_CAMPO', req.user, empresa_id);
    await notifyUsers(targets, {
      empresa_id,
      module: 'despesas', record_id: id, target_hash: '#despesas',
      title: 'Nova despesa para analisar',
      body: `${req.user.name || 'Usuário'} lançou uma despesa de ${finalidade || 'campo'} no valor de R$ ${(parseFloat(value || 0)).toFixed(2)}.`
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
    const isActorAdmin = isAdminUser(req.user);

    let query = db('despesas_reembolsos as dr');

    if (!isActorAdmin) {
      query = query.where('dr.empresa_id', req.user.empresa_id);

      if (req.user.unitId && req.user.unitId !== 'all') {
        query = query.where('dr.unitId', req.user.unitId);
      }

      const permittedIds = await getPermittedSellerIds(req.user, db);
      query = query.whereIn('dr.userId', permittedIds);
    } else if (isFilterValValid(req.query.unitId) && req.query.unitId !== 'all') {
      query = query.where('dr.unitId', req.query.unitId);
    }

    const list = await query
      .leftJoin('usuarios as u', 'dr.userId', 'u.id')
      .select('dr.*', 'u.name as userName')
      .orderBy('dr.created_at', 'desc')
      .orderBy('dr.id', 'desc');
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
    const actorPerms = req.user.permissions || [];
    const isActorAdmin = isAdminUser(req.user);
    let recordQuery = db('despesas_reembolsos').where({ id });
    if (!isActorAdmin) recordQuery = recordQuery.where({ empresa_id: req.user.empresa_id });
    const record = await recordQuery.first();

    if (!record) {
      return res.status(404).json({ error: 'Despesa não encontrada' });
    }

    const permittedSellerIds = await getPermittedSellerIds(req.user, db);
    
    if (!isActorAdmin && !permittedSellerIds.map(String).includes(String(record.userId))) {
      return res.status(403).json({ error: 'Acesso negado: esta despesa está fora da sua cadeia de atendimento' });
    }

    const userRecord = record.userId ? await db('usuarios').where({ id: record.userId }).first() : null;
    res.json({ ...record, userName: userRecord?.name || record.userName || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao detalhar despesa de campo' });
  }
});

// Delete travel expense refund (somente administrador)
app.delete('/api/despesas-reembolsos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const actorPerms = req.user.permissions || [];
    const isAdmin = isAdminUser(req.user);
    let recordQuery = db('despesas_reembolsos').where({ id });
    if (!isAdmin) recordQuery = recordQuery.where({ empresa_id: req.user.empresa_id });
    const record = await recordQuery.first();

    if (!record) {
      return res.status(404).json({ error: 'Despesa não encontrada' });
    }

    // Permitir que o administrador exclua reembolsos em qualquer status

    const isOwner = String(record.userId) === String(req.user.id);
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Somente administrador pode excluir registros.' });
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


// Corrigir despesa devolvida para correção. Apenas o dono do lançamento pode reenviar.
app.put('/api/despesas-reembolsos/:id/correct', async (req, res) => {
  const { id } = req.params;
  try {
    const record = await db('despesas_reembolsos').where({ id }).first();
    if (!record) return res.status(404).json({ error: 'Despesa não encontrada.' });
    if (String(record.userId) !== String(req.user.id)) return res.status(403).json({ error: 'Você só pode corrigir despesas lançadas por você.' });
    if (record.status !== 'Correção Solicitada') return res.status(400).json({ error: 'Esta despesa não está aguardando correção.' });
    const b = req.body || {};
    const updates = {
      unitId: b.unitId !== undefined && b.unitId !== '' ? String(b.unitId) : record.unitId,
      date: b.date !== undefined && b.date !== '' ? String(b.date) : record.date,
      time: b.time !== undefined && b.time !== '' ? String(b.time) : record.time,
      finalidade: b.finalidade || record.finalidade,
      operacao: b.operacao || record.operacao,
      descreva: b.descreva !== undefined ? b.descreva : record.descreva,
      veiculo: b.veiculo !== undefined ? b.veiculo : record.veiculo,
      km: b.km === null || b.km === '' ? null : (b.km !== undefined && !isNaN(parseInt(b.km, 10)) ? parseInt(b.km, 10) : record.km),
      foto_odometro: b.foto_odometro !== undefined ? b.foto_odometro : record.foto_odometro,
      foto_comprovante: b.foto_comprovante !== undefined ? b.foto_comprovante : record.foto_comprovante,
      value: b.value !== undefined && b.value !== '' ? ccNum(b.value) : record.value,
      observation: b.observation !== undefined ? b.observation : (b.observacao !== undefined ? b.observacao : record.observation),
      status: 'Pendente',
      updated_at: new Date().toISOString()
    };
    await db('despesas_reembolsos').where({ id }).update(updates);
    await db('auditoria_logs').insert({ usuario_id: req.user.id, acao: 'CORRIGIU_DESPESA', detalhes: `Despesa #${id} corrigida e reenviada para aprovação.`, empresa_id: req.user.empresa_id }).catch(()=>{});
    const targets = await obterDestinatarios('DESPESA_CORRIGIDA', record.userId, record.empresa_id || req.user.empresa_id);
    await notifyUsers(targets, {
      empresa_id: record.empresa_id || req.user.empresa_id,
      module: 'despesas', record_id: id, target_hash: '#despesas', title: 'Despesa corrigida', body: `${req.user.name || 'Usuário'} corrigiu e reenviou a despesa #${id}.`
    });
    res.json({ success: true, id, status: 'Pendente' });
  } catch (err) {
    console.error('Erro ao corrigir despesa:', err);
    res.status(500).json({ error: 'Erro ao corrigir despesa.' });
  }
});

// Approve/Reject travel expense refund
app.put('/api/despesas-reembolsos/:id/approval', async (req, res) => {
  const { id } = req.params;
  const { status, observacao, observation } = req.body || {}; // status: Aprovado, Reprovado, Correção Solicitada
  const note = String(observacao || observation || '').trim();

  if (!['Aprovado','Reprovado','Correção Solicitada'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido para avaliação de despesa.' });
  }

  if ((status === 'Reprovado' || status === 'Correção Solicitada') && !note) {
    return res.status(400).json({ error: 'A justificativa é obrigatória para reprovar ou enviar a despesa para correção.' });
  }

  const perms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
  const canApproveExpense = req.user.profile === 'Administrador'
    || req.user.profile === 'Financeiro'
    || perms.includes('Aprovação de Despesas')
    || perms.includes('Financeiro')
    || perms.includes('Administrador')
    || perms.includes('Administrador (Acesso Total)');

  if (!canApproveExpense) {
    return res.status(403).json({ error: 'Sem permissão para aprovar despesas.' });
  }

  try {
    let recordQuery = db('despesas_reembolsos').where({ id });
    if (req.user.profile !== 'Administrador' && !perms.includes('Administrador') && req.user.empresa_id) {
      recordQuery = recordQuery.where({ empresa_id: req.user.empresa_id });
    }
    const record = await recordQuery.first();

    if (!record) {
      return res.status(404).json({ error: 'Despesa não encontrada.' });
    }

    const actorPerms = perms;
    const isActorAdmin = req.user.profile === 'Administrador' || actorPerms.includes('Administrador') || actorPerms.includes('Administrador (Acesso Total)');
    if (!isActorAdmin) {
      const permittedIds = await getPermittedSellerIds(req.user, db);
      if (!permittedIds.map(String).includes(String(record.userId))) {
        return res.status(403).json({ error: 'Acesso negado: esta despesa pertence a um vendedor fora da sua cadeia.' });
      }
    }

    await db('despesas_reembolsos').where({ id }).update({
      status,
      observation: note,
      updated_at: new Date().toISOString()
    });

    // Auditoria não pode transformar uma aprovação salva em erro para o usuário.
    try {
      await db('auditoria_logs').insert({
        usuario_id: req.user.id,
        acao: status === 'Aprovado' ? 'APROVOU_DESPESA' : (status === 'Reprovado' ? 'REPROVOU_DESPESA' : 'ENVIOU_DESPESA_CORRECAO'),
        detalhes: `Despesa de campo #${id} avaliada como ${status.toUpperCase()} por ${req.user.name || req.user.id}. Observação: "${note || '-'}"`,
        empresa_id: req.user.empresa_id
      });
    } catch (auditErr) {
      console.warn('Falha ao registrar auditoria da despesa, mas a aprovação foi salva:', auditErr.message);
    }

    const targets = await obterDestinatarios('APROVACAO_DESPESA', record.userId, record.empresa_id || req.user.empresa_id);
    await notifyUsers(targets, {
      empresa_id: record.empresa_id || req.user.empresa_id,
      module: 'despesas', record_id: id, target_hash: '#despesas',
      title: status === 'Aprovado' ? 'Despesa aprovada' : (status === 'Reprovado' ? 'Despesa reprovada' : 'Despesa enviada para correção'),
      body: status === 'Correção Solicitada' ? `Sua despesa #${id} precisa de correção. Motivo: ${note}` : `Sua despesa #${id} foi atualizada para ${status}. ${note ? 'Observação: ' + note : ''}`
    });

    res.json({ success: true, id, status, observacao: note });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao avaliar despesa de campo' });
  }
});

// GET Audit Logs - somente administrador. Registros são permanentes e não possuem rota de exclusão.
app.get('/api/auditoria', async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: 'Acesso negado. Somente administrador pode visualizar registros do sistema.' });
  }
  const companyId = (req.user && req.user.empresa_id) || '001';
  try {
    const auditRows = await db('auditoria_logs as a')
      .leftJoin('usuarios as u', 'a.usuario_id', 'u.id')
      .select(
        'a.id', 'a.usuario_id', 'a.acao', 'a.detalhes', 'a.empresa_id', 'a.created_at',
        'a.modulo', 'a.registro_id', 'a.dados_antes_json', 'a.dados_depois_json',
        'u.name as usuario_nome', 'u.username as usuario_login'
      )
      .where(function() {
        this.where('a.empresa_id', companyId).orWhereNull('a.empresa_id');
      })
      .orderBy('a.id', 'desc')
      .limit(1000);

    let deletionRows = [];
    if (await db.schema.hasTable('historico_exclusoes')) {
      deletionRows = await db('historico_exclusoes').orderBy('id', 'desc').limit(500);
    }

    const normalizeAudit = auditRows.map(row => ({
      origem: 'auditoria',
      id: `A-${row.id}`,
      data: row.created_at,
      usuario_id: row.usuario_id || '',
      usuario_nome: row.usuario_nome || row.usuario_login || row.usuario_id || 'Usuário não localizado',
      acao: row.acao || 'REGISTRO',
      modulo: row.modulo || inferAuditModule(row.acao, row.detalhes),
      registro_id: row.registro_id || '',
      detalhes: row.detalhes || '',
      empresa_id: row.empresa_id || companyId
    }));

    const normalizeDeletion = deletionRows.map(row => ({
      origem: 'historico_exclusoes',
      id: `E-${row.id}`,
      data: row.created_at,
      usuario_id: row.excluido_por || '',
      usuario_nome: row.excluido_por || 'Administrador',
      acao: 'EXCLUIU_REGISTRO',
      modulo: row.modulo || 'Exclusão',
      registro_id: row.registro_id || '',
      detalhes: `Exclusão registrada. Criado por: ${row.criado_por || '-'}. Motivo: ${row.motivo || '-'}.`,
      empresa_id: companyId
    }));

    const list = [...normalizeAudit, ...normalizeDeletion]
      .sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0))
      .slice(0, 1000);

    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar registros do sistema' });
  }
});

function inferAuditModule(acao = '', detalhes = '') {
  const text = `${acao} ${detalhes}`.toLowerCase();
  if (text.includes('prospec')) return 'Prospecção de Leads';
  if (text.includes('cliente')) return 'Clientes';
  if (text.includes('chamado')) return 'Chamados Mecânicos';
  if (text.includes('despesa')) return 'Despesas de Campo';
  if (text.includes('saldo')) return 'Solicitações de Saldo';
  if (text.includes('movimenta') || text.includes('equipamento')) return 'Movimentação de Equipamentos';
  if (text.includes('simula') || text.includes('troca')) return 'Simulador de Troca';
  if (text.includes('usuario') || text.includes('usuário') || text.includes('permiss')) return 'Usuários e Permissões';
  return 'Sistema';
}
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

function canSeeAllMechanicalTickets(user) {
  const profile = normalizeRole(user && (user.profile || user.role || user.perfil));
  const perms = Array.isArray(user && user.permissions) ? user.permissions.map(normalizeRole) : [];
  const joined = [profile, ...perms].join(' | ');
  return isAdminUser(user)
    || String(user && user.unitId || '').toLowerCase() === 'all'
    || joined.includes('responsavel equipamentos')
    || joined.includes('responsavel equipamento')
    || joined.includes('gestor equipamentos')
    || joined.includes('gestor de equipamentos')
    || joined.includes('chamados mecanicos');
}

async function getGlobalEquipmentTypeNames(req) {
  const companyId = getStoreCompanyId(req);
  const rows = await db('app_kv_store')
    .where({ company_id: companyId })
    .andWhere(function() {
      this.where('store_key', 'equipment_types').orWhere('store_key', 'like', '%_equipment_types');
    })
    .catch(() => []);
  const seen = new Set();
  const names = [];
  rows.forEach(row => {
    const list = safeParseStoreJson(row.data_json, []);
    if (!Array.isArray(list)) return;
    list.forEach(item => {
      const name = String(
        item && typeof item === 'object'
          ? (item.name || item.nome || item.label || item.value || item.descricao || '')
          : (item || '')
      ).trim();
      const key = normalizeRole(name);
      if (!name || key === 'undefined' || key === '[object object]' || seen.has(key)) return;
      seen.add(key);
      names.push(name);
    });
  });
  return names;
}

async function validateMechanicalEquipmentType(req, value) {
  const typeName = String(value || '').trim();
  const validTypes = await getGlobalEquipmentTypeNames(req);
  if (!typeName) return { ok: false, error: 'Tipo de equipamento é obrigatório.' };
  if (validTypes.length && !validTypes.some(t => normalizeRole(t) === normalizeRole(typeName))) {
    return { ok: false, error: 'Tipo de equipamento inválido. Selecione um tipo cadastrado em Configurações > Tipos de Equipamentos.' };
  }
  return { ok: true, typeName };
}

async function applyHierarchyScope(query, user, ownerColumn, companyColumn = 'empresa_id') {
  const actorPerms = user.permissions || [];
  query.where(companyColumn, user.empresa_id || '001');
  if (!canSeeAllMechanicalTickets(user)) {
    const allowedIds = await getPermittedSellerIds(user, db);
    query.whereIn(ownerColumn, allowedIds);
  }
  // Não retorne o query builder em função async: o Knex é thenable e seria executado antes da hora.
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
      equipmentType: typeCheck.typeName,
      client: body.client || '',
      fantasyName: body.fantasyName || '',
      city: body.city || '',
      address: body.address || '',
      clientCode: body.clientCode || body.cliente_codigo || '',
      clientSeller: body.clientSeller || body.cliente_vendedor || '',
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
    await applyHierarchyScope(query, req.user, 'userId', 'empresa_id');
    if (!canSeeAllMechanicalTickets(req.user) && isFilterValValid(req.query.unitId) && req.query.unitId !== 'all') query.where('unitId', req.query.unitId);
    if (isFilterValValid(req.query.status)) query.where('status', req.query.status);
    if (isFilterValValid(req.query.patrimonio)) query.where('equipmentSerial', 'like', `%${req.query.patrimonio}%`);
    const list = await query.orderBy('created_at', 'desc');
    res.json(list.map(normalizeChamado));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar chamados mecânicos' });
  }
});



// Delete chamado mecânico (somente administrador)
app.put('/api/chamados/:id', async (req, res) => {
  try {
    if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Somente administrador pode editar chamados.' });
    const chamado = await db('chamados_tecnicos').where({ id: req.params.id, empresa_id: req.user.empresa_id || '001' }).first();
    if (!chamado) return res.status(404).json({ error: 'Chamado nÃ£o encontrado.' });
    const body = req.body || {};
    const updates = { updated_at: new Date().toISOString() };
    const allowed = [
      'unitId', 'userId', 'equipmentSerial', 'equipmentType', 'client', 'fantasyName', 'city', 'address',
      'clientCode', 'clientSeller', 'title', 'priority', 'observations', 'defectPhoto', 'defectVideo',
      'status', 'mechanic', 'date', 'startTime', 'endTime', 'faultDescription', 'solutionDescription',
      'eqStatusAfter', 'gasCharge', 'additionalNotes', 'fotoAntes', 'fotoDepois', 'fotoPlaqueta', 'videoAtendimento'
    ];
    for (const field of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, field)) updates[field] = body[field] == null ? '' : body[field];
    }
    if (Object.prototype.hasOwnProperty.call(body, 'equipmentType')) {
      const typeCheck = await validateMechanicalEquipmentType(req, body.equipmentType);
      if (!typeCheck.ok) return res.status(400).json({ error: typeCheck.error });
      updates.equipmentType = typeCheck.typeName;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'parts')) updates.parts = JSON.stringify(Array.isArray(body.parts) ? body.parts : safeJsonArray(body.parts));
    if (Object.prototype.hasOwnProperty.call(body, 'services')) updates.services = JSON.stringify(Array.isArray(body.services) ? body.services : safeJsonArray(body.services));
    await db('chamados_tecnicos').where({ id: req.params.id, empresa_id: req.user.empresa_id || '001' }).update(updates);
    await registrarAuditoriaSistema(req, {
      acao: 'EDITOU_CHAMADO_MECANICO',
      modulo: 'Chamados MecÃ¢nicos',
      registro_id: req.params.id,
      detalhes: `${req.user.name || req.user.id} editou chamado mecÃ¢nico #${req.params.id}.`,
      dados_antes: chamado,
      dados_depois: { ...chamado, ...updates }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao editar chamado:', err);
    res.status(500).json({ error: 'Erro ao editar chamado.' });
  }
});

app.delete('/api/chamados/:id', async (req, res) => {
  try {
    const admin = isAdminUser(req.user);
    if (!admin) return res.status(403).json({ error: 'Somente administrador pode excluir chamados.' });
    const existing = await db('chamados_tecnicos').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Chamado não encontrado.' });
    await db('chamados_tecnicos').where({ id: req.params.id }).delete();
    await registrarAuditoriaSistema(req, {
      acao: 'EXCLUIU_CHAMADO_MECANICO',
      modulo: 'Chamados Mecânicos',
      registro_id: req.params.id,
      detalhes: `${req.user.name || req.user.id} excluiu chamado mecânico #${req.params.id}.`,
      dados_antes: existing
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir chamado:', err);
    res.status(500).json({ error: 'Erro ao excluir chamado.' });
  }
});

app.get('/api/chamados/:id', async (req, res) => {
  try {
    const chamado = await db('chamados_tecnicos').where({ id: req.params.id, empresa_id: req.user.empresa_id || '001' }).first();
    if (!chamado) return res.status(404).json({ error: 'Chamado não encontrado' });
    const allowedIds = await getPermittedSellerIds(req.user, db);
    const staff = canSeeAllMechanicalTickets(req.user);
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
    const staff = canSeeAllMechanicalTickets(req.user) || ['Gerente', 'Supervisor', 'Mecânico'].includes(req.user.profile);
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
    const staff = canSeeAllMechanicalTickets(req.user);
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
  const { cliente_codigo, cliente_nome_fantasia, cliente_vendedor, total, generated_message, items } = req.body;
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
      cliente_vendedor: cliente_vendedor || '',
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
});

// 6. Update simulation - somente o próprio usuário ou administrador pode editar
app.put('/api/exchange/simulations/:id', async (req, res) => {
  const { id } = req.params;
  const { cliente_codigo, cliente_nome_fantasia, cliente_vendedor, total, generated_message, items } = req.body;
  const companyId = (req.user && req.user.empresa_id) || '001';
  const userId = (req.user && req.user.id) || 'demo_user';

  if (!cliente_codigo || !cliente_nome_fantasia || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Dados da simulação inválidos ou incompletos.' });
  }

  try {
    const sim = await db('exchange_simulations')
      .where({ id, company_id: companyId })
      .first();

    if (!sim) return res.status(404).json({ error: 'Simulação não encontrada.' });

    const perfil = String((req.user && (req.user.profile || req.user.perfil || req.user.role)) || '').toLowerCase();
    const isAdminUser = perfil.includes('admin') || perfil.includes('administrador');
    if (!isAdminUser && String(sim.seller_id) !== String(userId)) {
      return res.status(403).json({ error: 'Você só pode editar trocas cadastradas por você.' });
    }

    await db('exchange_simulations')
      .where({ id })
      .update({
        cliente_codigo,
        cliente_nome_fantasia,
        cliente_vendedor: cliente_vendedor || '',
        total: parseFloat(total) || 0,
        generated_message,
        updated_at: new Date().toISOString()
      });

    await db('exchange_simulation_items').where({ simulation_id: id }).del();

    const itemsToInsert = items.map(it => ({
      simulation_id: id,
      product_id: it.product_id || null,
      codigo: it.codigo,
      produto: it.produto,
      categoria: it.categoria || 'Outros',
      tipo: it.tipo,
      quantidade: parseInt(it.quantidade, 10) || 0,
      valor_base: parseFloat(it.valor_base) || 0,
      total_item: parseFloat(it.total_item) || 0,
      created_at: new Date().toISOString()
    }));

    await db('exchange_simulation_items').insert(itemsToInsert);

    await db('auditoria_logs').insert({
      usuario_id: userId,
      acao: 'EDITOU_SIMULACAO_TROCA',
      detalhes: `Simulação de troca #${id} editada para cliente ${cliente_nome_fantasia} (${cliente_codigo}).`,
      empresa_id: companyId
    }).catch(() => {});

    res.json({ success: true, id });
  } catch (err) {
    console.error('Erro ao editar simulação:', err);
    res.status(500).json({ error: 'Erro ao editar simulação de troca.' });
  }
});

// 7. Delete simulation - somente o próprio usuário ou administrador pode excluir
app.delete('/api/exchange/simulations/:id', async (req, res) => {
  const { id } = req.params;
  const companyId = (req.user && req.user.empresa_id) || '001';
  const userId = (req.user && req.user.id) || 'demo_user';

  try {
    const sim = await db('exchange_simulations')
      .where({ id, company_id: companyId })
      .first();

    if (!sim) return res.status(404).json({ error: 'Simulação não encontrada.' });

    const perfil = String((req.user && (req.user.profile || req.user.perfil || req.user.role)) || '').toLowerCase();
    const isAdminUser = perfil.includes('admin') || perfil.includes('administrador');
    if (!isAdminUser && String(sim.seller_id) !== String(userId)) {
      return res.status(403).json({ error: 'Você só pode excluir trocas cadastradas por você.' });
    }

    // Deletar os itens associados primeiro
    await db('exchange_simulation_items').where({ simulation_id: id }).delete();

    // Deletar a simulação principal
    await db('exchange_simulations').where({ id }).delete();

    await db('auditoria_logs').insert({
      usuario_id: userId,
      acao: 'EXCLUIU_SIMULACAO_TROCA',
      detalhes: `Simulação de troca #${id} do cliente ${sim.cliente_nome_fantasia} excluída por ${req.user.name || req.user.id}.`,
      empresa_id: companyId
    }).catch(() => {});

    res.json({ success: true, id });
  } catch (err) {
    console.error('Erro ao excluir simulação:', err);
    res.status(500).json({ error: 'Erro ao excluir simulação de troca.' });
  }
});
// Client ficha route
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
