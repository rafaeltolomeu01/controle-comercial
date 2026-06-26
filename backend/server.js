require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'controle-campo-v2-dev';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });

app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use(express.static(path.join(__dirname, '../public'), { maxAge: '5m', etag: true }));

const q = (text, params=[]) => pool.query(text, params);
const now = () => new Date();
const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const cleanCnpj = (v='') => String(v).replace(/\D/g,'');

function normalizeRole(role='') { return String(role).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function isAdmin(user){ const r=normalizeRole(user?.role); return r.includes('admin') || r.includes('administrador'); }
function isFinance(user){ const r=normalizeRole(user?.role); return isAdmin(user) || r.includes('finance') || r.includes('aprovacao') || r.includes('aprova'); }
function canSeeAll(user){ const r=normalizeRole(user?.role); return isAdmin(user) || r.includes('gerente') || r.includes('supervisor') || isFinance(user); }
function pick(obj, keys){ const out={}; keys.forEach(k=>{ if(obj[k]!==undefined) out[k]=obj[k]; }); return out; }

async function auth(req,res,next){
  try{
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if(!token) return res.status(401).json({error:'Token ausente'});
    const data = jwt.verify(token, JWT_SECRET);
    const result = await q(`SELECT u.*, c.name as company_name, c.logo_url as company_logo FROM users u LEFT JOIN companies c ON c.id=u.company_id WHERE u.id=$1`, [data.id]);
    if(!result.rows[0]) return res.status(401).json({error:'Usuário não encontrado'});
    if(!['ATIVO','LIBERADO','ACTIVE'].includes(String(result.rows[0].status||'').toUpperCase())) return res.status(403).json({error:'Usuário inativo'});
    req.user = result.rows[0];
    next();
  }catch(e){ res.status(401).json({error:'Sessão expirada ou inválida'}); }
}

async function initDb(){
  await q(`CREATE TABLE IF NOT EXISTS companies(
    id SERIAL PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL, cnpj TEXT, logo_url TEXT, city TEXT, state TEXT, active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS users(
    id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE, email TEXT UNIQUE, phone TEXT, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'Vendedor', status TEXT NOT NULL DEFAULT 'ATIVO', company_id INTEGER REFERENCES companies(id), supervisor_id TEXT, manager_id TEXT, avatar_url TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS prospects(
    id TEXT PRIMARY KEY, company_id INTEGER REFERENCES companies(id), user_id TEXT REFERENCES users(id), seller_id TEXT, name TEXT, contact TEXT, phone TEXT, city TEXT, address TEXT, number TEXT, neighborhood TEXT, zipcode TEXT, category TEXT, competitor TEXT, status TEXT DEFAULT 'prospectado', observation TEXT, has_cnpj BOOLEAN DEFAULT FALSE, cnpj TEXT, razao_social TEXT, nome_fantasia TEXT, cnae_principal TEXT, cnae_descricao TEXT, photo_url TEXT, next_date TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS clients(
    id TEXT PRIMARY KEY, company_id INTEGER REFERENCES companies(id), user_id TEXT REFERENCES users(id), seller_id TEXT, name TEXT, fantasy_name TEXT, cnpj TEXT, phone TEXT, email TEXT, city TEXT, address TEXT, number TEXT, neighborhood TEXT, zipcode TEXT, category TEXT, score INTEGER DEFAULT 0, status TEXT DEFAULT 'pendente', approval_reason TEXT, photo_url TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS equipment(
    id TEXT PRIMARY KEY, company_id INTEGER REFERENCES companies(id), user_id TEXT REFERENCES users(id), client_id TEXT, patrimony TEXT, model TEXT, voltage TEXT, status TEXT DEFAULT 'ativo', observation TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS movements(
    id TEXT PRIMARY KEY, company_id INTEGER REFERENCES companies(id), user_id TEXT REFERENCES users(id), type TEXT, client_name TEXT, patrimony TEXT, equipment_model TEXT, priority TEXT, status TEXT DEFAULT 'pendente', observation TEXT, photo_url TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS tickets(
    id TEXT PRIMARY KEY, company_id INTEGER REFERENCES companies(id), user_id TEXT REFERENCES users(id), client_name TEXT, patrimony TEXT, urgency TEXT, status TEXT DEFAULT 'aberto', description TEXT, execution_note TEXT, parts JSONB DEFAULT '[]'::jsonb, photo_url TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS expenses(
    id TEXT PRIMARY KEY, company_id INTEGER REFERENCES companies(id), user_id TEXT REFERENCES users(id), finalidade TEXT, operation_type TEXT, vendor_name TEXT, route TEXT, plate TEXT, amount NUMERIC DEFAULT 0, hotel_amount NUMERIC DEFAULT 0, fuel_amount NUMERIC DEFAULT 0, food_amount NUMERIC DEFAULT 0, status TEXT DEFAULT 'pendente', reason TEXT, receipt_url TEXT, km_photo_url TEXT, panel_photo_url TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS balances(
    id TEXT PRIMARY KEY, company_id INTEGER REFERENCES companies(id), user_id TEXT REFERENCES users(id), destination TEXT, amount NUMERIC DEFAULT 0, category TEXT, status TEXT DEFAULT 'pendente', approved_amount NUMERIC, reason TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS products(
    id TEXT PRIMARY KEY, company_id INTEGER REFERENCES companies(id), code TEXT, name TEXT, category TEXT, box_qty NUMERIC DEFAULT 1, box_price NUMERIC DEFAULT 0, unit_price NUMERIC DEFAULT 0, unit TEXT DEFAULT 'UN', active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS exchanges(
    id TEXT PRIMARY KEY, company_id INTEGER REFERENCES companies(id), user_id TEXT REFERENCES users(id), client_code TEXT, client_name TEXT, total NUMERIC DEFAULT 0, items JSONB DEFAULT '[]'::jsonb, status TEXT DEFAULT 'finalizada', created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS settings(
    key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT now()
  )`);
  // Campos extras do cadastro completo de cliente. Mantém compatibilidade com bancos já criados.
  await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS razao_social TEXT`);
  await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ie TEXT`);
  await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS state TEXT`);
  await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_full TEXT`);
  await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS location_type TEXT`);
  await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS pavement_type TEXT`);
  await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS delivery_schedule TEXT`);
  await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS nearby_amaretto TEXT`);
  await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS nearby_competitor TEXT`);
  await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ice_cream_experience TEXT`);
  await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS dual_brand_preference TEXT`);
  await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS equipment_qty TEXT`);
  await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS requested_eq_type TEXT`);
  await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS sendable_eq_type TEXT`);

  const comp = await q(`INSERT INTO companies(code,name,logo_url) VALUES('001','Amaretto Sorvetes','/assets/amaretto.jpeg') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name RETURNING *`);
  await q(`INSERT INTO companies(code,name,logo_url) VALUES('JDS','JDS Distribuidora','/assets/jds.png') ON CONFLICT(code) DO NOTHING`);
  await q(`INSERT INTO companies(code,name,logo_url) VALUES('JAD','JAD Distribuidora','/assets/jds.png') ON CONFLICT(code) DO NOTHING`);
  const hash = await bcrypt.hash('Master@2026', 10);
  await q(`INSERT INTO users(id,name,username,email,password_hash,role,status,company_id) VALUES($1,'Administrador Master','master','master@controle.com',$2,'Administrador','ATIVO',$3) ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='Administrador', status='ATIVO'`, ['master', hash, comp.rows[0].id]);
}

function scopeSql(req, alias=''){
  const p = alias ? `${alias}.` : '';
  if(isAdmin(req.user)) return { where:'1=1', params:[] };
  if(isFinance(req.user)) return { where:`${p}company_id=$1`, params:[req.user.company_id] };
  const r = normalizeRole(req.user.role);
  if(r.includes('gerente') || r.includes('supervisor')) return { where:`${p}company_id=$1`, params:[req.user.company_id] };
  return { where:`${p}user_id=$1`, params:[req.user.id] };
}
function selectedCompany(req){
  if(isAdmin(req.user) && req.query.company_id) return Number(req.query.company_id);
  return req.user.company_id;
}
async function listTable(req,res, table, order='created_at DESC'){
  const scope = scopeSql(req);
  const companyFilter = req.query.company_id && isAdmin(req.user) ? ` AND company_id=$${scope.params.length+1}` : '';
  const params = req.query.company_id && isAdmin(req.user) ? [...scope.params, Number(req.query.company_id)] : scope.params;
  const r = await q(`SELECT * FROM ${table} WHERE ${scope.where}${companyFilter} ORDER BY ${order}`, params);
  res.json(r.rows);
}
async function approve(req,res, table){
  const { id } = req.params; const { status, reason, approved_amount } = req.body;
  if(!isFinance(req.user)) return res.status(403).json({error:'Sem permissão para aprovar'});
  const r = await q(`UPDATE ${table} SET status=$1, reason=COALESCE($2, reason), approved_amount=COALESCE($3, approved_amount), updated_at=now() WHERE id=$4 RETURNING *`, [status, reason||null, approved_amount||null, id]);
  if(!r.rows[0]) return res.status(404).json({error:'Registro não encontrado'});
  res.json(r.rows[0]);
}
async function saveUpload(base64, name='arquivo'){
  if(!base64 || !String(base64).startsWith('data:')) return null;
  const m = String(base64).match(/^data:(.+);base64,(.+)$/);
  if(!m) return null;
  const ext = (m[1].split('/')[1] || 'bin').replace('jpeg','jpg').split('+')[0];
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const file = path.join(__dirname, '../public/uploads', filename);
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
  return `/uploads/${filename}`;
}

app.post('/api/login', async (req,res)=>{
  const { login, username, email, password } = req.body;
  const l = login || username || email;
  const r = await q(`SELECT u.*, c.name as company_name, c.logo_url as company_logo FROM users u LEFT JOIN companies c ON c.id=u.company_id WHERE lower(u.username)=lower($1) OR lower(u.email)=lower($1) LIMIT 1`, [l]);
  const user = r.rows[0];
  if(!user || !(await bcrypt.compare(password||'', user.password_hash))) return res.status(401).json({error:'E-mail, usuário ou senha incorretos'});
  const token = jwt.sign({id:user.id}, JWT_SECRET, {expiresIn:'7d'});
  delete user.password_hash;
  res.json({token,user});
});
app.get('/api/me', auth, (req,res)=>{ const u={...req.user}; delete u.password_hash; res.json(u); });

app.get('/api/companies', auth, async (req,res)=>{ const r=await q(`SELECT * FROM companies ORDER BY name`); res.json(r.rows); });
app.post('/api/companies', auth, async (req,res)=>{ if(!isAdmin(req.user)) return res.status(403).json({error:'Sem permissão'}); let logo=req.body.logo_url; if(req.body.logo_base64) logo=await saveUpload(req.body.logo_base64,'logo'); const r=await q(`INSERT INTO companies(code,name,cnpj,logo_url,city,state) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [req.body.code,req.body.name,req.body.cnpj,logo,req.body.city,req.body.state]); res.json(r.rows[0]); });
app.put('/api/companies/:id', auth, async (req,res)=>{ if(!isAdmin(req.user)) return res.status(403).json({error:'Sem permissão'}); let logo=req.body.logo_url; if(req.body.logo_base64) logo=await saveUpload(req.body.logo_base64,'logo'); const r=await q(`UPDATE companies SET code=COALESCE($1,code), name=COALESCE($2,name), cnpj=COALESCE($3,cnpj), logo_url=COALESCE($4,logo_url), city=COALESCE($5,city), state=COALESCE($6,state), updated_at=now() WHERE id=$7 RETURNING *`, [req.body.code,req.body.name,req.body.cnpj,logo,req.body.city,req.body.state,req.params.id]); res.json(r.rows[0]); });

app.get('/api/users', auth, async (req,res)=>{ const where=isAdmin(req.user)?'1=1':'company_id=$1'; const params=isAdmin(req.user)?[]:[req.user.company_id]; const r=await q(`SELECT u.id,u.name,u.username,u.email,u.phone,u.role,u.status,u.company_id,u.avatar_url,c.name company_name FROM users u LEFT JOIN companies c ON c.id=u.company_id WHERE ${where} ORDER BY u.name`, params); res.json(r.rows); });
app.post('/api/users', auth, async (req,res)=>{ if(!isAdmin(req.user) && !normalizeRole(req.user.role).includes('gerente')) return res.status(403).json({error:'Sem permissão'}); const id=uid('usr'); const hash=await bcrypt.hash(req.body.password||'123456',10); let avatar=req.body.avatar_url; if(req.body.avatar_base64) avatar=await saveUpload(req.body.avatar_base64,'avatar'); const r=await q(`INSERT INTO users(id,name,username,email,phone,password_hash,role,status,company_id,supervisor_id,manager_id,avatar_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,name,username,email,phone,role,status,company_id,avatar_url`, [id,req.body.name,req.body.username,req.body.email,req.body.phone,hash,req.body.role||'Vendedor',req.body.status||'ATIVO',req.body.company_id||req.user.company_id,req.body.supervisor_id,req.body.manager_id,avatar]); res.json(r.rows[0]); });

app.get('/api/cnpj/:cnpj', auth, async (req,res)=>{
  const cnpj=cleanCnpj(req.params.cnpj); if(cnpj.length!==14) return res.status(400).json({error:'CNPJ inválido'});
  const urls=[`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, `https://publica.cnpj.ws/cnpj/${cnpj}`];
  for(const url of urls){ try{ const rr=await fetch(url,{headers:{'User-Agent':'ControleCampo/2.0'}}); if(!rr.ok) continue; const d=await rr.json(); const est=d.estabelecimento||{}; const at=(d.atividade_principal||est.atividade_principal||{}); return res.json({cnpj, razao_social:d.razao_social||d.razaoSocial||'', nome_fantasia:d.nome_fantasia||est.nome_fantasia||'', cep:d.cep||est.cep||'', logradouro:d.logradouro||est.logradouro||'', numero:d.numero||est.numero||'', bairro:d.bairro||est.bairro||'', cidade:d.municipio||est.cidade?.nome||'', estado:d.uf||est.estado?.sigla||'', cnae_principal:String(d.cnae_fiscal||at.id||''), cnae_descricao:d.cnae_fiscal_descricao||at.descricao||''}); }catch(e){} }
  res.status(404).json({error:'CNPJ não encontrado'});
});
app.post('/api/upload-base64', auth, async (req,res)=>{ const url=await saveUpload(req.body.data, req.body.name); if(!url) return res.status(400).json({error:'Arquivo inválido'}); res.json({url}); });

app.get('/api/prospects', auth, (req,res)=>listTable(req,res,'prospects'));
app.post('/api/prospects', auth, async (req,res)=>{ const b=req.body; let photo=b.photo_url; if(b.photo_base64) photo=await saveUpload(b.photo_base64); const r=await q(`INSERT INTO prospects(id,company_id,user_id,seller_id,name,contact,phone,city,address,number,neighborhood,zipcode,category,competitor,status,observation,has_cnpj,cnpj,razao_social,nome_fantasia,cnae_principal,cnae_descricao,photo_url,next_date) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14,'prospectado'),$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`, [uid('pr'), selectedCompany(req), req.user.id,b.name,b.contact,b.phone,b.city,b.address,b.number,b.neighborhood,b.zipcode,b.category,b.competitor,b.status,b.observation,!!b.has_cnpj,b.cnpj,b.razao_social,b.nome_fantasia,b.cnae_principal,b.cnae_descricao,photo,b.next_date]); res.json(r.rows[0]); });
app.put('/api/prospects/:id', auth, async (req,res)=>{ const b=req.body; const r=await q(`UPDATE prospects SET status=COALESCE($1,status), observation=COALESCE($2,observation), updated_at=now() WHERE id=$3 RETURNING *`, [b.status,b.observation,req.params.id]); res.json(r.rows[0]); });
app.delete('/api/prospects/:id', auth, async (req,res)=>{ if(!isAdmin(req.user)) return res.status(403).json({error:'Sem permissão'}); await q(`DELETE FROM prospects WHERE id=$1`,[req.params.id]); res.json({ok:true}); });
app.post('/api/prospects/:id/convert-client', auth, async(req,res)=>{
  const pr = await q(`SELECT * FROM prospects WHERE id=$1`, [req.params.id]);
  const p = pr.rows[0];
  if(!p) return res.status(404).json({error:'Prospecção não encontrada'});
  if(!isAdmin(req.user) && p.user_id !== req.user.id && Number(p.company_id)!==Number(req.user.company_id)) return res.status(403).json({error:'Sem permissão'});
  const r = await q(`INSERT INTO clients(id,company_id,user_id,seller_id,name,fantasy_name,cnpj,phone,email,city,address,number,neighborhood,zipcode,category,status,photo_url,razao_social,address_full,nearby_competitor) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pendente',$15,$16,$17,$18) RETURNING *`, [uid('cli'),p.company_id,p.user_id,p.name||p.nome_fantasia,p.nome_fantasia||p.name,p.cnpj,p.phone,null,p.city,p.address,p.number,p.neighborhood,p.zipcode,p.category,p.photo_url,p.razao_social,[p.address,p.number,p.neighborhood,p.city].filter(Boolean).join(', '),p.competitor]);
  await q(`UPDATE prospects SET status='convertido', updated_at=now() WHERE id=$1`, [p.id]);
  res.json(r.rows[0]);
});

app.get('/api/clients', auth, (req,res)=>listTable(req,res,'clients'));
app.post('/api/clients', auth, async(req,res)=>{ const b=req.body; let photo=b.photo_url; if(b.photo_base64) photo=await saveUpload(b.photo_base64); const r=await q(`INSERT INTO clients(id,company_id,user_id,seller_id,name,fantasy_name,cnpj,phone,email,city,address,number,neighborhood,zipcode,category,status,photo_url,razao_social,ie,state,address_full,location_type,pavement_type,delivery_schedule,nearby_amaretto,nearby_competitor,ice_cream_experience,dual_brand_preference,equipment_qty,requested_eq_type,sendable_eq_type) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,COALESCE($15,'pendente'),$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30) RETURNING *`, [uid('cli'),selectedCompany(req),req.user.id,b.name,b.fantasy_name,b.cnpj,b.phone,b.email,b.city,b.address,b.number,b.neighborhood,b.zipcode,b.category,b.status,photo,b.razao_social,b.ie,b.state,b.address_full,b.location_type,b.pavement_type,b.delivery_schedule,b.nearby_amaretto,b.nearby_competitor,b.ice_cream_experience,b.dual_brand_preference,b.equipment_qty,b.requested_eq_type,b.sendable_eq_type]); res.json(r.rows[0]); });
app.put('/api/clients/:id/approve', auth, (req,res)=>approve(req,res,'clients'));
app.delete('/api/clients/:id', auth, async(req,res)=>{ if(!isAdmin(req.user)) return res.status(403).json({error:'Sem permissão'}); await q(`DELETE FROM clients WHERE id=$1`,[req.params.id]); res.json({ok:true}); });

app.get('/api/expenses', auth, (req,res)=>listTable(req,res,'expenses'));
app.post('/api/expenses', auth, async(req,res)=>{ const b=req.body; const receipt=b.receipt_base64?await saveUpload(b.receipt_base64):b.receipt_url; const km=b.km_photo_base64?await saveUpload(b.km_photo_base64):b.km_photo_url; const panel=b.panel_photo_base64?await saveUpload(b.panel_photo_base64):b.panel_photo_url; const amount=Number(b.amount||b.valor||0)||0; const r=await q(`INSERT INTO expenses(id,company_id,user_id,finalidade,operation_type,vendor_name,route,plate,amount,hotel_amount,fuel_amount,food_amount,status,receipt_url,km_photo_url,panel_photo_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pendente',$13,$14,$15) RETURNING *`, [uid('desp'),selectedCompany(req),req.user.id,b.finalidade,b.operation_type||b.tipo,b.vendor_name||req.user.name,b.route,b.plate,amount,b.hotel_amount||0,b.fuel_amount||0,b.food_amount||0,receipt,km,panel]); res.json(r.rows[0]); });
app.put('/api/expenses/:id/approve', auth, (req,res)=>approve(req,res,'expenses'));
app.delete('/api/expenses/:id', auth, async(req,res)=>{ if(!isFinance(req.user)) return res.status(403).json({error:'Sem permissão'}); await q(`DELETE FROM expenses WHERE id=$1`,[req.params.id]); res.json({ok:true}); });

app.get('/api/balances', auth, (req,res)=>listTable(req,res,'balances'));
app.post('/api/balances', auth, async(req,res)=>{ const b=req.body; const r=await q(`INSERT INTO balances(id,company_id,user_id,destination,amount,category,status) VALUES($1,$2,$3,$4,$5,$6,'pendente') RETURNING *`, [uid('saldo'),selectedCompany(req),req.user.id,b.destination,b.amount||0,b.category]); res.json(r.rows[0]); });
app.put('/api/balances/:id/approve', auth, (req,res)=>approve(req,res,'balances'));

app.get('/api/equipment', auth, (req,res)=>listTable(req,res,'equipment'));
app.post('/api/equipment', auth, async(req,res)=>{ const b=req.body; const r=await q(`INSERT INTO equipment(id,company_id,user_id,client_id,patrimony,model,voltage,status,observation) VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'ativo'),$9) RETURNING *`, [uid('eq'),selectedCompany(req),req.user.id,b.client_id,b.patrimony,b.model,b.voltage,b.status,b.observation]); res.json(r.rows[0]); });
app.get('/api/movements', auth, (req,res)=>listTable(req,res,'movements'));
app.post('/api/movements', auth, async(req,res)=>{ const b=req.body; const photo=b.photo_base64?await saveUpload(b.photo_base64):b.photo_url; const r=await q(`INSERT INTO movements(id,company_id,user_id,type,client_name,patrimony,equipment_model,priority,status,observation,photo_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pendente',$9,$10) RETURNING *`, [uid('mov'),selectedCompany(req),req.user.id,b.type,b.client_name,b.patrimony,b.equipment_model,b.priority,b.observation,photo]); res.json(r.rows[0]); });

app.get('/api/tickets', auth, (req,res)=>listTable(req,res,'tickets'));
app.post('/api/tickets', auth, async(req,res)=>{ const b=req.body; const photo=b.photo_base64?await saveUpload(b.photo_base64):b.photo_url; const r=await q(`INSERT INTO tickets(id,company_id,user_id,client_name,patrimony,urgency,status,description,photo_url) VALUES($1,$2,$3,$4,$5,$6,'aberto',$7,$8) RETURNING *`, [uid('ch'),selectedCompany(req),req.user.id,b.client_name,b.patrimony,b.urgency,b.description,photo]); res.json(r.rows[0]); });
app.put('/api/tickets/:id', auth, async(req,res)=>{ const b=req.body; const r=await q(`UPDATE tickets SET status=COALESCE($1,status), execution_note=COALESCE($2,execution_note), parts=COALESCE($3,parts), updated_at=now() WHERE id=$4 RETURNING *`, [b.status,b.execution_note,b.parts?JSON.stringify(b.parts):null,req.params.id]); res.json(r.rows[0]); });

app.get('/api/products', auth, async(req,res)=>{ const company=selectedCompany(req); const term=`%${String(req.query.q||'')}%`; const r=await q(`SELECT * FROM products WHERE (company_id=$1 OR $2=true) AND active=true AND (name ILIKE $3 OR code ILIKE $3 OR category ILIKE $3) ORDER BY category,name LIMIT 300`, [company,isAdmin(req.user),term]); res.json(r.rows); });
app.post('/api/products', auth, async(req,res)=>{ if(!isAdmin(req.user)) return res.status(403).json({error:'Sem permissão'}); const b=req.body; const r=await q(`INSERT INTO products(id,company_id,code,name,category,box_qty,box_price,unit_price,unit) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [uid('prod'),selectedCompany(req),b.code,b.name,b.category,b.box_qty||1,b.box_price||0,b.unit_price||0,b.unit||'UN']); res.json(r.rows[0]); });
app.post('/api/products/import', auth, async(req,res)=>{ if(!isAdmin(req.user)) return res.status(403).json({error:'Sem permissão'}); const list=Array.isArray(req.body.products)?req.body.products:[]; const out=[]; for(const p of list){ const r=await q(`INSERT INTO products(id,company_id,code,name,category,box_qty,box_price,unit_price,unit) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [uid('prod'),selectedCompany(req),p.code,p.name,p.category,p.box_qty||1,p.box_price||0,p.unit_price||0,p.unit||'UN']); out.push(r.rows[0]); } res.json({count:out.length, products:out}); });
app.get('/api/exchanges', auth, (req,res)=>listTable(req,res,'exchanges'));
app.post('/api/exchanges', auth, async(req,res)=>{ const b=req.body; const items=Array.isArray(b.items)?b.items:[]; const total=items.reduce((s,i)=>s+(Number(i.total)||0),0); const r=await q(`INSERT INTO exchanges(id,company_id,user_id,client_code,client_name,total,items) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [uid('troca'),selectedCompany(req),req.user.id,b.client_code,b.client_name,total,JSON.stringify(items)]); res.json(r.rows[0]); });

app.get('/api/dashboard', auth, async(req,res)=>{ const scope=scopeSql(req); const params=scope.params; const [p,c,t,e,b]=await Promise.all([
  q(`SELECT count(*)::int total FROM prospects WHERE ${scope.where}`,params),
  q(`SELECT count(*)::int total FROM clients WHERE status='pendente' AND ${scope.where}`,params),
  q(`SELECT count(*)::int total FROM tickets WHERE status IN ('aberto','pendente') AND ${scope.where}`,params),
  q(`SELECT COALESCE(SUM(amount),0)::numeric total FROM expenses WHERE ${scope.where}`,params),
  q(`SELECT COALESCE(SUM(CASE WHEN status='aprovado' THEN COALESCE(approved_amount,amount) ELSE 0 END),0)::numeric total FROM balances WHERE ${scope.where}`,params)
]); res.json({prospects:p.rows[0].total, pending_clients:c.rows[0].total, active_tickets:t.rows[0].total, expenses:Number(e.rows[0].total||0), balance:Number(b.rows[0].total||0)}); });

app.get('/health', (req,res)=>res.json({ok:true}));
app.get('*', (req,res)=>res.sendFile(path.join(__dirname, '../public/index.html')));

initDb().then(()=>app.listen(PORT,()=>console.log(`Controle Campo V2 rodando na porta ${PORT}`))).catch(err=>{ console.error('Erro inicializando banco',err); process.exit(1); });
