# Mapa de Execucao

Este documento registra o fluxo oficial identificado no projeto.

## Deploy no Render

Arquivo: `render.yaml`

```yaml
buildCommand: npm install
startCommand: npm start
```

## Script da raiz

Arquivo: `package.json`

```json
"build": "npm install --prefix backend",
"postinstall": "npm install --prefix backend",
"start": "npm start --prefix backend"
```

## Script do backend

Arquivo: `backend/package.json`

```json
"start": "node src/index.js"
```

## Backend oficial

```text
backend/src/index.js
```

Esse e o arquivo que deve receber novas rotas, correcoes de API, ajustes de banco, uploads, autenticacao e notificacoes.

## Frontend oficial

O backend serve a raiz do projeto como frontend:

```js
const FRONTEND_ROOT = path.join(__dirname, '..', '..');
app.use(express.static(FRONTEND_ROOT, ...));
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_ROOT, 'index.html'));
});
```

Portanto, o frontend oficial e composto por:

- `index.html`
- `css/`
- `js/`
- `pages/`
- `icon.svg`
- `manifest.json`
- `sw.js`
