# Relatório de correções — saldos Corporativo e Benefício

Data: 21/07/2026  
Versão: `20260721.07`

## Resultado

O módulo financeiro passou a controlar separadamente os saldos e despesas das finalidades **Corporativo** e **Benefício**. A despesa do tipo **Requisição** continua registrada e auditável, mas não consome nenhum desses dois saldos.

Nenhuma tabela ou registro existente foi apagado. A implementação reutiliza a estrutura atual e mantém compatibilidade com solicitações antigas.

## Regras financeiras implementadas

- Despesa `Corporativo` reduz somente o saldo Corporativo.
- Despesa `Benefício` reduz somente o saldo Benefício.
- Despesa `Requisição` aparece em box próprio e não reduz saldo.
- Solicitação de saldo de hospedagem/alimentação é classificada como Benefício.
- Solicitação de saldo de abastecimento é classificada como Corporativo.
- Itens extras de uma solicitação agora permitem escolher Corporativo ou Benefício.
- Lançamento direto e remoção direta de saldo exigem a escolha da finalidade.
- A remoção valida o saldo disponível apenas na finalidade escolhida.
- Aprovações parciais continuam considerando o valor efetivamente aprovado por item.

## Prestação de contas

A prestação de contas agora apresenta separadamente:

- saldo Corporativo aprovado;
- saldo Benefício aprovado;
- despesas Corporativas aprovadas;
- despesas de Benefício aprovadas;
- despesas Corporativas pendentes;
- despesas de Benefício pendentes;
- restante Corporativo;
- restante Benefício;
- gasto por Requisição.

O dossiê e o PDF textual também identificam a finalidade de cada saldo e despesa. O salvamento continua usando histórico versionado e `snapshot_json`, sem alterar ou eliminar apurações anteriores.

## Registro de despesas

- Restaurado o botão **+ Registrar Despesa** para Administrador e Vendedor.
- Mantido também para Supervisor, Gerente, Financeiro e demais perfis autorizados ao módulo.
- O formulário permanece oculto somente quando o usuário está expressamente na aba de aprovação de despesas.
- A regra foi aplicada após os módulos legados para impedir que outra rotina volte a ocultar o botão.

## Clientes, chamados e equipamentos preservados

Também foram mantidas no pacote as correções já realizadas nesta sequência:

- busca de cliente importado por código em todas as unidades permitidas da empresa;
- preenchimento de rua e número no retorno de CNPJ, com complemento por CEP quando necessário;
- paginação de cinco registros em clientes cadastrados e fila de aprovação;
- layout responsivo específico para clientes, sem alterar CSS global;
- histórico de movimentações e chamados respeitando unidade, empresa, hierarquia e responsável;
- preservação das fotos antigas durante edição/correção e uso de links externos para novos uploads.

## Proteção dos dados

- Não foi criada migração destrutiva.
- Não há `DELETE`, limpeza ou conversão em massa de saldos existentes.
- Registros antigos sem classificação explícita continuam compatíveis:
  - hospedagem/hotel/alimentação/refeição → Benefício;
  - abastecimento/combustível/corporativo e itens legados sem classificação → Corporativo;
  - requisição → categoria independente, sem consumo de saldo.
- O isolamento por `empresa_id`, unidade e cadeia de usuários permanece no servidor.

## Validação executada

- Verificação de sintaxe em seis arquivos JavaScript alterados: aprovada.
- Suíte de **64 testes de regressão**: aprovada integralmente.
- Testes adicionados para:
  - separação Corporativo/Benefício;
  - Requisição fora do consumo de saldo;
  - prestação de contas separada;
  - visibilidade do registro de despesas para Administrador e Vendedor;
  - ausência de alteração destrutiva na estrutura financeira.

## Verificação recomendada após o deploy

1. Entrar como Administrador e confirmar o botão **+ Registrar Despesa**.
2. Entrar como Vendedor e confirmar o mesmo botão apenas nas unidades permitidas.
3. Solicitar R$ 100,00 Corporativo e R$ 80,00 Benefício.
4. Aprovar os dois saldos.
5. Registrar uma despesa Corporativa e outra de Benefício.
6. Confirmar que cada despesa reduziu somente o saldo correspondente.
7. Registrar uma Requisição e confirmar que ela aparece no box próprio sem reduzir os saldos.
8. Abrir a prestação de contas e gerar o PDF para conferir os dois blocos separados.

