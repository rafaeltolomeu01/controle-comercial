# Relatório — Módulo de Prestação de Contas

Data: 21/07/2026  
Versão: 20260721.04

## Objetivo entregue

Foi adicionado um módulo novo e isolado para conciliar saldos e despesas de um usuário em uma unidade e período definidos. O módulo não altera, apaga ou reclassifica os registros originais de despesas, solicitações de saldo, aprovações ou movimentações diretas.

## Regras de acesso

| Perfil | Consulta | Usuários visíveis | Salvar como apurada | PDF |
|---|---|---|---|---|
| Administrador do sistema | Sim | Toda a empresa do login | Sim | Sim |
| Financeiro / responsável financeiro | Sim | Toda a empresa do login | Sim | Sim |
| Supervisor | Sim | Somente sua cadeia vinculada | Não | Sim |
| Gerente | Sim | Somente sua cadeia vinculada | Não | Sim |
| Vendedor | Sim | Somente o próprio usuário, com campo bloqueado | Não | Sim |

Todas as consultas também respeitam a empresa e as unidades autorizadas no token. A proteção é aplicada no servidor; alterar campos no navegador não amplia o acesso.

## Cálculo do período

- Saldo calculado: soma apenas valores efetivamente aprovados.
- Aprovação parcial: considera o valor aprovado, e não o valor originalmente solicitado.
- Saldo adicionado diretamente: entra como crédito aprovado.
- Saldo removido diretamente: entra como valor negativo.
- Despesas consideradas: somente despesas com status aprovado.
- Despesas pendentes, em correção ou reprovadas: aparecem no dossiê como não aprovadas, mas não entram no resultado.
- Resultado: saldo considerado menos despesas aprovadas.
- Se o aprovador informar saldo diferente do cálculo, o motivo do ajuste é obrigatório.

## Dossiê e PDF

O dossiê apresenta cronologicamente solicitações, aprovações, adições e retiradas de saldo. As despesas aprovadas exibem número, data, finalidade, valor e acesso ao comprovante na tela. O PDF é propositalmente textual e contém:

- usuário, perfil, unidade e período;
- saldo aprovado/considerado;
- despesas aprovadas e saldo final;
- todas as movimentações de saldo com datas e valores;
- números e valores das despesas aprovadas;
- aviso e relação das despesas não aprovadas, fora da soma;
- sem fotos de painel, KM ou comprovantes.

## Persistência segura

Foram criadas duas tabelas novas:

- `prestacoes_contas`: cabeçalho, totais, período, responsável, observações e snapshot integral;
- `prestacoes_contas_itens`: itens normalizados do dossiê e referências às origens.

Cada salvamento gera uma nova versão para o mesmo usuário, unidade e período. Isso permite refazer a apuração depois que uma pendência for aprovada, preservando as versões anteriores para auditoria.

O rollback da migração é deliberadamente não destrutivo. Não há `DROP TABLE`, alteração de tabelas legadas ou exclusão de dados financeiros existentes.

## Arquivos adicionados

- `backend/migrations/20260721_create_prestacoes_contas.js`
- `backend/src/prestacoes-contas.js`
- `pages/prestacao-contas.html`
- `css/prestacao-contas.css`
- `js/prestacao-contas.js`

## Arquivos ajustados

- `backend/src/index.js`: instalação do módulo antes do fallback do frontend;
- `index.html`: menu, painel, CSS e script do módulo;
- `js/app.js`: inicialização da rota;
- `js/store.js`: rotas permitidas por perfil;
- `js/ui.js`: exibição do menu conforme permissão;
- `sw.js` e `version.json`: versão e atualização de cache;
- `backend/test/security-regressions.test.js`: proteção contra regressões.

## Validações executadas

- sintaxe dos novos arquivos JavaScript;
- acesso por empresa, unidade e cadeia hierárquica;
- vendedor fixo sem seleção de terceiros;
- fechamento restrito a administrador/financeiro;
- cálculo apenas com despesas aprovadas;
- aprovação parcial pelo valor efetivamente aprovado;
- saldo direto positivo e retirada negativa;
- snapshot e auditoria no servidor;
- PDF sem imagens;
- layout isolado e responsivo, sem ocultar barra horizontal como paliativo;
- suíte completa: 56 testes aprovados, 0 falhas.

## Implantação

Ao iniciar o backend, o sistema executa `db.migrate.latest()` e cria somente as novas tabelas. Recomenda-se manter o backup atual já realizado antes do deploy, embora esta atualização não modifique dados legados.
