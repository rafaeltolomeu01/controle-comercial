# Relatorio de correcao - Requisicao e Prestacao de Contas

Data: 21/07/2026  
Versao: 20260721.06

## Alteracoes realizadas

1. O detalhe de uma despesa aberto na Prestacao de Contas agora e fechado ao:
   - trocar a unidade;
   - trocar o vendedor ou usuario;
   - alterar a data inicial ou final;
   - calcular novamente;
   - sair da pagina de Prestacao de Contas.
2. Foi incluido um botao explicito para fechar os detalhes da despesa.
3. Despesas aprovadas cujo tipo de operacao seja Requisicao continuam visiveis no dossie, mas nao reduzem o saldo aprovado.
4. A regra considera tambem despesas antigas, pois a classificacao e feita pelo campo de operacao ja gravado, sem reescrever registros.
5. Foi adicionado o indicador Valor gasto por Requisicao na tela de Despesas de Campo.
6. A Prestacao de Contas ganhou um indicador separado para requisicoes e o PDF identifica que elas nao descontam saldo.
7. Cartoes, saldo restante, graficos financeiros e ranking por unidade passaram a descontar somente despesas aprovadas que nao sejam requisicao.
8. O painel inicial continua mostrando o total geral de despesas aprovadas para informacao, mas o saldo restante exclui corretamente as requisicoes.

## Protecao de dados

- Nenhum cadastro, despesa, saldo, foto ou historico foi apagado.
- Nenhuma migracao destrutiva foi criada.
- Nenhum registro antigo foi alterado automaticamente.
- A mudanca atua apenas na classificacao e nos calculos apresentados.

## Validacao executada

- Verificacao de sintaxe dos arquivos JavaScript alterados.
- Suite completa de regressao: 61 testes aprovados, 0 falhas.
- Testes adicionais confirmam que requisicoes nao reduzem saldo e que o detalhe fecha ao trocar filtros ou sair da pagina.
