import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'troque-esta-chave';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
const uploadsDir = path.join(__dirname, '../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({ dest: uploadsDir, limits: { fileSize: 8 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, '../../frontend/public')));

const q = (text, params=[]) => pool.query(text, params);
const clean = (v) => (v ?? '').toString().trim();
const isAdmin = (u) => ['ADMIN','ADMINISTRADOR'].includes((u?.role||'').toUpperCase());
const isFinance = (u) => ['FINANCEIRO','ADMIN','ADMINISTRADOR'].includes((u?.role||'').toUpperCase()) || (u?.permissions||[]).some(p => /financeiro|aprova/i.test(p));
function tokenFor(user){ return jwt.sign({ id:user.id, role:user.role, company_id:user.company_id, name:user.name, permissions:user.permissions||[] }, JWT_SECRET, { expiresIn:'7d' }); }
async function auth(req,res,next){
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if(!token) return res.status(401).json({error:'Token ausente'});
  try{
    const p = jwt.verify(token, JWT_SECRET);
    const { rows } = await q('select u.*, c.name company_name, c.logo_url company_logo from users u left join companies c on c.id=u.company_id where u.id=$1 and u.active=true',[p.id]);
    if(!rows[0]) return res.status(401).json({error:'Sessão inválida'});
    rows[0].permissions = rows[0].permissions || [];
    req.user = rows[0]; next();
  }catch(e){ return res.status(401).json({error:'Sessão expirada'}); }
}
function scopeWhere(req, alias=''){
  const p = alias ? alias+'.' : '';
  if(isAdmin(req.user)) return { sql:'1=1', params:[] };
  if(['GERENTE','SUPERVISOR'].includes((req.user.role||'').toUpperCase())) return { sql:`(${p}company_id=$1)`, params:[req.user.company_id] };
  return { sql:`(${p}user_id=$1)`, params:[req.user.id] };
}
async function migrate(){
 await q(`create table if not exists companies(id text primary key, name text not null, document text, logo_url text, active boolean default true, created_at timestamptz default now())`);
 await q(`create table if not exists users(id text primary key, name text not null, email text unique, username text unique, password_hash text not null, role text not null, company_id text references companies(id), active boolean default true, photo_url text, permissions jsonb default '[]', created_at timestamptz default now())`);
 await q(`create table if not exists leads(id text primary key, company_id text references companies(id), user_id text references users(id), name text, contact text, phone text, city text, address text, number text, neighborhood text, zipcode text, category text, competitor text, status text default 'prospectado', cnpj text, razao_social text, nome_fantasia text, cnae text, cnae_desc text, photo_url text, observation text, created_at timestamptz default now(), updated_at timestamptz default now())`);
 await q(`create table if not exists clients(id text primary key, company_id text references companies(id), user_id text references users(id), name text, cnpj text, category text, phone text, email text, address text, status text default 'pendente', score text, photo_url text, created_at timestamptz default now())`);
 await q(`create table if not exists expenses(id text primary key, company_id text references companies(id), user_id text references users(id), purpose text, operation_type text, route text, plate text, hotel numeric default 0, food numeric default 0, fuel numeric default 0, value numeric default 0, status text default 'pendente', note text, photos jsonb default '[]', approved_by text, rejected_reason text, created_at timestamptz default now(), updated_at timestamptz default now())`);
 await q(`create table if not exists balances(id text primary key, company_id text references companies(id), user_id text references users(id), destination text, amount numeric default 0, status text default 'pendente', note text, approved_by text, rejected_reason text, created_at timestamptz default now())`);
 await q(`create table if not exists equipments(id text primary key, company_id text references companies(id), user_id text references users(id), client_name text, patrimony text, model text, voltage text, status text default 'ativo', created_at timestamptz default now())`);
 await q(`create table if not exists movements(id text primary key, company_id text references companies(id), user_id text references users(id), client_name text, type text, patrimony text, equipment text, status text default 'pendente', created_at timestamptz default now())`);
 await q(`create table if not exists service_calls(id text primary key, company_id text references companies(id), user_id text references users(id), client_name text, patrimony text, urgency text, issue text, status text default 'aberto', created_at timestamptz default now())`);
 await q(`create table if not exists products(id text primary key, company_id text references companies(id), code text, name text, category text, box_qty numeric default 1, box_price numeric default 0, unit_price numeric default 0, active boolean default true, created_at timestamptz default now())`);
 await q(`create table if not exists settings(key text primary key, value jsonb, updated_at timestamptz default now())`);
 const company = await q('select id from companies where id=$1',['amaretto']);
 if(!company.rowCount) await q('insert into companies(id,name,document) values($1,$2,$3)',['amaretto','Amaretto Sorvetes','']);
 const admin = await q('select id from users where username=$1 or email=$2',['master','master@controle.com']);
 if(!admin.rowCount){
   const hash = await bcrypt.hash('Master@2026',10);
   await q('insert into users(id,name,email,username,password_hash,role,company_id,permissions) values($1,$2,$3,$4,$5,$6,$7,$8)', ['usr_admin_master','Administrador Master','master@controle.com','master',hash,'ADMIN','amaretto',JSON.stringify(['financeiro','aprovacao','admin'])]);
 }
}

app.get('/api/health', (_,res)=>res.json({ok:true}));
app.post('/api/auth/login', async (req,res)=>{
 const login = clean(req.body.login || req.body.email || req.body.username).toLowerCase();
 const pass = req.body.password || '';
 const {rows} = await q('select u.*, c.name company_name, c.logo_url company_logo from users u left join companies c on c.id=u.company_id where lower(u.email)=$1 or lower(u.username)=$1',[login]);
 const u=rows[0]; if(!u || !u.active || !(await bcrypt.compare(pass,u.password_hash))) return res.status(401).json({error:'E-mail, usuário ou senha incorretos'});
 res.json({token:tokenFor(u), user:{id:u.id,name:u.name,email:u.email,username:u.username,role:u.role,company_id:u.company_id,company_name:u.company_name,company_logo:u.company_logo,photo_url:u.photo_url,permissions:u.permissions||[]}});
});
app.get('/api/me', auth, (req,res)=>res.json({user:req.user}));
app.get('/api/companies', auth, async (req,res)=>{ const r=isAdmin(req.user)?await q('select * from companies order by name'):await q('select * from companies where id=$1',[req.user.company_id]); res.json(r.rows); });
app.post('/api/companies', auth, upload.single('logo'), async (req,res)=>{ if(!isAdmin(req.user)) return res.status(403).json({error:'Apenas admin'}); const id=clean(req.body.id)||'emp_'+Date.now(); const logo=req.file?'/uploads/'+req.file.filename:null; await q(`insert into companies(id,name,document,logo_url) values($1,$2,$3,$4) on conflict(id) do update set name=excluded.name,document=excluded.document,logo_url=coalesce(excluded.logo_url,companies.logo_url)`,[id,clean(req.body.name),clean(req.body.document),logo]); res.json({ok:true,id,logo_url:logo}); });
app.get('/api/users', auth, async (req,res)=>{ const r=isAdmin(req.user)?await q('select id,name,email,username,role,company_id,active,photo_url from users order by name'):await q('select id,name,email,username,role,company_id,active,photo_url from users where company_id=$1 order by name',[req.user.company_id]); res.json(r.rows); });
app.post('/api/users', auth, upload.single('photo'), async (req,res)=>{ if(!isAdmin(req.user)) return res.status(403).json({error:'Apenas admin'}); const id=req.body.id||'usr_'+Date.now(); const hash=req.body.password?await bcrypt.hash(req.body.password,10):await bcrypt.hash('Senha@123',10); const photo=req.file?'/uploads/'+req.file.filename:null; await q(`insert into users(id,name,email,username,password_hash,role,company_id,photo_url,active) values($1,$2,$3,$4,$5,$6,$7,$8,true) on conflict(id) do update set name=excluded.name,email=excluded.email,username=excluded.username,role=excluded.role,company_id=excluded.company_id,photo_url=coalesce(excluded.photo_url,users.photo_url)`,[id,req.body.name,req.body.email,req.body.username,hash,req.body.role,req.body.company_id,photo]); res.json({ok:true,id}); });
async function listTable(req,res,table){ const s=scopeWhere(req); const r=await q(`select t.*, c.name company_name, u.name user_name from ${table} t left join companies c on c.id=t.company_id left join users u on u.id=t.user_id where ${s.sql} order by t.created_at desc`,s.params); res.json(r.rows); }
async function insertGeneric(req,res,table,fields){ const id=(table.slice(0,3)+'_'+Date.now()+Math.floor(Math.random()*999)); const data=req.body||{}; const company_id = isAdmin(req.user) && data.company_id ? data.company_id : req.user.company_id; const cols=['id','company_id','user_id',...fields]; const vals=[id,company_id,req.user.id,...fields.map(f=>data[f] ?? null)]; const ph=vals.map((_,i)=>'$'+(i+1)); await q(`insert into ${table}(${cols.join(',')}) values(${ph.join(',')})`,vals); res.json({ok:true,id}); }
app.get('/api/leads', auth, (req,res)=>listTable(req,res,'leads'));
app.post('/api/leads', auth, upload.single('photo'), async (req,res)=>{ const b={...req.body}; if(req.file) b.photo_url='/uploads/'+req.file.filename; await insertGeneric({ ...req, body:b },res,'leads',['name','contact','phone','city','address','number','neighborhood','zipcode','category','competitor','status','cnpj','razao_social','nome_fantasia','cnae','cnae_desc','photo_url','observation']); });
app.get('/api/clients', auth, (req,res)=>listTable(req,res,'clients'));
app.post('/api/clients', auth, upload.single('photo'), async (req,res)=>{ const b={...req.body}; if(req.file) b.photo_url='/uploads/'+req.file.filename; await insertGeneric({ ...req, body:b },res,'clients',['name','cnpj','category','phone','email','address','status','score','photo_url']); });
app.get('/api/expenses', auth, (req,res)=>listTable(req,res,'expenses'));
app.post('/api/expenses', auth, upload.array('photos',6), async (req,res)=>{ const files=(req.files||[]).map(f=>'/uploads/'+f.filename); const total=Number(req.body.value||0)||['hotel','food','fuel'].reduce((a,k)=>a+(Number(req.body[k]||0)||0),0); const b={...req.body,value:total,photos:JSON.stringify(files)}; await insertGeneric({ ...req, body:b },res,'expenses',['purpose','operation_type','route','plate','hotel','food','fuel','value','status','note','photos']); });
app.patch('/api/expenses/:id/status', auth, async (req,res)=>{ if(!isFinance(req.user)) return res.status(403).json({error:'Sem permissão'}); await q('update expenses set status=$1, approved_by=$2, rejected_reason=$3, updated_at=now() where id=$4',[req.body.status,req.user.id,req.body.reason||null,req.params.id]); res.json({ok:true}); });
app.delete('/api/expenses/:id', auth, async (req,res)=>{ if(!isAdmin(req.user)) return res.status(403).json({error:'Apenas admin'}); await q('delete from expenses where id=$1',[req.params.id]); res.json({ok:true}); });
app.get('/api/balances', auth, (req,res)=>listTable(req,res,'balances'));
app.post('/api/balances', auth, (req,res)=>insertGeneric(req,res,'balances',['destination','amount','status','note']));
app.patch('/api/balances/:id/status', auth, async (req,res)=>{ if(!isFinance(req.user)) return res.status(403).json({error:'Sem permissão'}); await q('update balances set status=$1, approved_by=$2, rejected_reason=$3 where id=$4',[req.body.status,req.user.id,req.body.reason||null,req.params.id]); res.json({ok:true}); });
app.get('/api/equipments', auth, (req,res)=>listTable(req,res,'equipments'));
app.post('/api/equipments', auth, (req,res)=>insertGeneric(req,res,'equipments',['client_name','patrimony','model','voltage','status']));
app.get('/api/movements', auth, (req,res)=>listTable(req,res,'movements'));
app.post('/api/movements', auth, (req,res)=>insertGeneric(req,res,'movements',['client_name','type','patrimony','equipment','status']));
app.get('/api/calls', auth, (req,res)=>listTable(req,res,'service_calls'));
app.post('/api/calls', auth, (req,res)=>insertGeneric(req,res,'service_calls',['client_name','patrimony','urgency','issue','status']));
app.get('/api/products', auth, async (req,res)=>{ const r=await q('select * from products where active=true and ($1::text is null or company_id=$1 or $2=true) order by name',[req.user.company_id,isAdmin(req.user)]); res.json(r.rows); });
app.post('/api/products', auth, async (req,res)=>{ if(!isAdmin(req.user)) return res.status(403).json({error:'Apenas admin'}); const arr=Array.isArray(req.body)?req.body:[req.body]; for(const p of arr){ await q('insert into products(id,company_id,code,name,category,box_qty,box_price,unit_price) values($1,$2,$3,$4,$5,$6,$7,$8)', ['prd_'+Date.now()+Math.random(),p.company_id||req.user.company_id,p.code,p.name,p.category,p.box_qty||1,p.box_price||0,p.unit_price||0]); } res.json({ok:true,count:arr.length}); });
app.get('/api/cnpj/:cnpj', auth, async (req,res)=>{ const c=req.params.cnpj.replace(/\D/g,''); if(c.length!==14) return res.status(400).json({error:'CNPJ inválido'}); const urls=[`https://brasilapi.com.br/api/cnpj/v1/${c}`,`https://publica.cnpj.ws/cnpj/${c}`]; for(const url of urls){ try{ const r=await fetch(url,{headers:{'user-agent':'controle-campo'}}); if(!r.ok) continue; const d=await r.json(); return res.json({cnpj:c,razao_social:d.razao_social||d.razao_social_nome||d.estabelecimento?.nome_fantasia||'',nome_fantasia:d.nome_fantasia||d.estabelecimento?.nome_fantasia||'',cep:d.cep||d.estabelecimento?.cep||'',logradouro:d.logradouro||d.estabelecimento?.logradouro||'',numero:d.numero||d.estabelecimento?.numero||'',bairro:d.bairro||d.estabelecimento?.bairro||'',cidade:d.municipio||d.estabelecimento?.cidade?.nome||'',estado:d.uf||d.estabelecimento?.estado?.sigla||'',cnae:String(d.cnae_fiscal||d.estabelecimento?.atividade_principal?.id||''),atividade_principal:d.cnae_fiscal_descricao||d.estabelecimento?.atividade_principal?.descricao||''}); }catch{} } res.status(404).json({error:'CNPJ não encontrado'}); });
app.get('*', (_,res)=>res.sendFile(path.join(__dirname,'../../frontend/public/index.html')));

migrate().then(()=>app.listen(PORT,()=>console.log('Controle de Campo novo rodando',PORT))).catch(e=>{console.error('Falha ao iniciar',e); process.exit(1);});
