# Relatório de correções — clientes e chamados mecânicos

Data: 21/07/2026

## Cadastro de clientes

- Corrigida a leitura de valores monetários brasileiros no cadastro e na edição.
- Entradas como `2000`, `2.000`, `2.000,50` e `2000.50` passam a ser tratadas sem transformar R$ 2.000,00 em R$ 2,00.
- O botão **Editar** aparece enquanto o cadastro estiver pendente para o autor do cadastro e para o administrador.
- Depois da aprovação, o botão de edição deixa de aparecer e o servidor bloqueia novas alterações.
- As fotos já cadastradas continuam preservadas durante a edição, salvo quando houver remoção ou substituição explícita.
- Nenhum valor antigo foi alterado automaticamente, pois não é seguro adivinhar quais registros já estavam corretos.

## Chamados mecânicos

- Mecânico, manutenção, responsável por equipamentos, gestor de equipamentos e administrador recebem a listagem operacional autorizada.
- A seleção de unidade do topo passou a ser respeitada também na tela de chamados.
- Chamados novos continuam sendo gravados com uma unidade obrigatória e autorizada.
- Chamados antigos gravados como `all`, vazios ou sem unidade podem reaparecer pela unidade atualmente vinculada ao autor.
- A compatibilidade dos chamados antigos é somente de leitura: nenhum registro do banco é regravado ou apagado.
- Registros antigos ambíguos, cujo autor possui acesso irrestrito a todas as unidades, não são atribuídos automaticamente a uma unidade para evitar mistura de dados.

## Segurança dos dados

- Não foi criada rotina de exclusão, limpeza ou conversão em massa.
- O isolamento por empresa foi mantido.
- A exibição continua limitada às unidades autorizadas do usuário.
- Não houve alteração direta no banco de produção.

## Validação

- Verificação de sintaxe do servidor e dos arquivos principais: aprovada.
- Testes automatizados de regressão: **48 aprovados, 0 falhas**.
- Auditoria estática de perfis, unidades, uploads, saldos, filtros e responsividade: **29 verificações aprovadas**.

