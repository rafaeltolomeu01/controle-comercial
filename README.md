# Controle Comercial / Controle de Campo

Sistema web para controle comercial e operacional de campo, com cadastro de leads, clientes, despesas, equipamentos, chamados, usuarios, empresas, relatorios, PWA e notificacoes.

## Status atual

O projeto esta rodando. Esta documentacao nao remove arquivos nem muda o fluxo de execucao; ela apenas registra qual caminho e oficial para evitar manutencao no arquivo errado.

## Como o projeto roda hoje

O deploy atual no Render usa o arquivo `render.yaml`:

```yaml
buildCommand: npm install
startCommand: npm start
```

Na raiz, o `package.json` executa:

```json
"start": "npm start --prefix backend"
```

Dentro de `backend/package.json`, o comando final e:

```json
"start": "node src/index.js"
```

Portanto, o backend oficial em execucao e:

```text
backend/src/index.js
```

## Arquivos principais

- `package.json`: scripts principais usados pelo Render.
- `render.yaml`: configuracao de deploy no Render.
- `backend/package.json`: inicializacao do backend.
- `backend/src/index.js`: servidor Express principal, API, autenticacao, banco, uploads, notificacoes e rotas.
- `backend/knexfile.js`: configuracao do banco local/producao.
- `index.html`: frontend principal servido pelo backend.
- `css/`: estilos principais.
- `js/store.js`: armazenamento local e sincronizacao com backend.
- `js/ui.js`: renderizacao e permissoes de interface.
- `js/app.js`: inicializacao, rotas, login e chamadas da aplicacao.
- `js/scoring.js`: regras de pontuacao/classificacao.
- `sw.js`: service worker do PWA e push notifications.
- `manifest.json`: configuracao PWA.

## Ordem dos scripts no frontend

O `index.html` carrega primeiro bibliotecas externas e depois os scripts principais nesta ordem:

1. `js/store.js`
2. `js/ui.js`
3. `js/scoring.js`
4. `js/app.js`
5. scripts de ajustes/correcoes por data
6. `js/general-filters.js`

Essa ordem e importante. Alterar a ordem pode quebrar funcoes globais como `Store`, `UI` e `App`.

## Antes de limpar arquivos

Como o sistema esta em uso, nao apague arquivos diretamente. Primeiro valide em ambiente de teste e confirme o deploy no Render.

Veja tambem:

- `docs/MAPA_EXECUCAO.md`
- `docs/ARQUIVOS_LEGADOS.md`
- `docs/PLANO_LIMPEZA_SEGURA.md`
