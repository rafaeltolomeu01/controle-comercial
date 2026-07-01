# Plano de Limpeza Segura

O objetivo e organizar o projeto sem derrubar o app que ja esta rodando.

## Etapa 1 - Documentar o oficial

Concluido nesta organizacao:

- README criado.
- Fluxo do Render documentado.
- Backend oficial identificado: `backend/src/index.js`.
- Frontend oficial identificado: `index.html` da raiz.
- Candidatos a legado registrados.

## Etapa 2 - Validar ambiente

Antes de apagar ou mover arquivos:

1. Conferir no Render que o servico usa este repositorio e a branch correta.
2. Conferir que o Build Command e `npm install`.
3. Conferir que o Start Command e `npm start`.
4. Fazer um deploy manual e validar login.

## Etapa 3 - Testes minimos antes de limpeza

Testar:

- Login e logout.
- Dashboard.
- Cadastro/listagem de leads.
- Cadastro/listagem de clientes.
- Despesas e aprovacoes.
- Solicitacao de saldo.
- Equipamentos e movimentacoes.
- Chamados mecanicos.
- Upload de foto.
- Relatorios/exportacao.
- Notificacoes/PWA, se estiverem em uso.

## Etapa 4 - Limpeza sem risco

Primeiro movimento recomendado:

1. Criar uma branch de limpeza.
2. Mover arquivos legados para uma pasta `legacy/`, sem deletar.
3. Testar o app.
4. Se tudo funcionar, abrir PR/merge.
5. So apagar definitivamente depois de alguns dias de uso estavel.

## Etapa 5 - Consolidar scripts

Os scripts de correcao devem ser absorvidos aos poucos:

- Regras de dados e sincronizacao: `store.js`.
- Renderizacao e permissoes visuais: `ui.js`.
- Fluxo da aplicacao, rotas e eventos: `app.js`.
- Filtros e exportacao: `general-filters.js` ou modulo dedicado.

Nao consolidar tudo de uma vez. O risco de regressao e alto.
