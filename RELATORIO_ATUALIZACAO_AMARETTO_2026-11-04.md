# Relatório de atualização — Controle Comercial Amaretto

Data: 04/11/2026  
Escopo: histórico de movimentações e chamados mecânicos  
Ambiente alterado: somente a cópia local recebida; nenhuma ação foi executada em produção.

## Resultado

As alterações solicitadas foram implementadas de forma aditiva e compatível com os registros antigos. Não foram removidas tabelas, colunas, mídias ou informações históricas.

### Correção complementar de status, laudo e paginação

- A tabela relacional de chamados passou a ser a fonte única do status, impedindo que uma cópia antiga do navegador mostre **Aberto** depois da finalização.
- O botão **Ver Laudo** abre os detalhes somente para consulta e geração de PDF; ele não reabre o formulário de finalização.
- Abertura, início da manutenção e hora de conclusão usam o registro atualizado do chamado.
- A finalização preenche data/hora de início e conclusão quando um registro antigo não possuir esses valores.
- A lista de Chamados Mecânicos foi limitada a **10 chamados por página**, preservando filtros e ordenação.
- A correção foi isolada ao módulo de Chamados Mecânicos; os demais módulos e suas paginações não foram alterados.

### Padronização das visualizações de PDF

- As telas internas de PDF mantêm o botão de impressão e passam a exibir uma ação visível **Fechar**.
- As janelas de impressão de dossiê de movimentação, ficha técnica e solicitações de saldo receberam a mesma ação de fechamento.
- O conteúdo, os cálculos e os anexos dos documentos não foram modificados.
- PDFs baixados diretamente continuam fechados normalmente pelo visualizador nativo do navegador ou do dispositivo.

## 1. Histórico de movimentações

- Adicionado o filtro **Operação**, preenchido pelos tipos reais presentes nas movimentações (`tipo_solicitacao`, `operacao`, `operation` ou `tipo_operacao`).
- Os seletores passaram a recalcular suas opções com base nos demais filtros ativos.
- A última seleção feita pelo usuário é preservada; seleções anteriores que se tornarem incompatíveis são limpas individualmente com aviso.
- Busca textual, período, empresa, unidade, vendedor, cliente, status, patrimônio, responsável e operação continuam combinados.
- A exportação filtrada usa a mesma combinação de filtros.
- **Exportar Tudo** continua usando somente o conjunto já carregado e autorizado pelo backend; não amplia permissões.
- Incluída mensagem clara quando a combinação não possui resultados.

## 2. Atendimento mecânico simplificado

O novo formulário apresenta somente:

- identificação do chamado/equipamento;
- datas de abertura e início, além do tempo de espera;
- **Descrição do Serviço Realizado** obrigatória;
- **Estado do Equipamento Após Atendimento** obrigatório;
- foto antes do reparo obrigatória;
- foto depois do reparo obrigatória;
- foto complementar opcional.

Foram retirados da interface nova:

- seleção de peças;
- seleção de serviços;
- campos redundantes de problema/solução;
- carga de gás;
- observações adicionais redundantes;
- vídeo do atendimento.

As estruturas antigas (`parts`, `services`, `gasCharge`, `videoAtendimento`, laudos e mídias anteriores) foram mantidas no banco, nas consultas históricas, nos detalhes e nos PDFs. Ao concluir uma ficha nova, o backend não apaga esses valores históricos.

## 3. Abertura de chamado

- Adicionado o campo obrigatório **Marca da Geladeira / Freezer**.
- A marca é preenchida automaticamente quando a busca por patrimônio retorna essa informação, mas pode ser corrigida no chamado.
- A correção não altera o cadastro patrimonial original.
- A foto obrigatória foi identificada como **Foto do Equipamento Completo**, com orientação e suporte à câmera traseira do celular.
- Foram adicionadas **Foto do Defeito 1** e **Foto do Defeito 2**, ambas obrigatórias e também validadas pelo backend.
- A fotografia da abertura é armazenada separadamente das fotos do atendimento.
- O vídeo de abertura saiu do formulário novo, mas vídeos existentes continuam preservados e acessíveis nos registros históricos.
- O backend também valida marca e as três fotografias, evitando contornar a obrigatoriedade pela API.

## 4. Datas e tempo de espera

- `openedAt`: registrado na criação do chamado.
- `maintenanceStartedAt`: registrado somente no primeiro clique de início.
- Ao clicar em **Iniciar Atendimento**, o chamado passa imediatamente a ser exibido como **Em manutenção**, com data e hora persistidas.
- O início não é regravado em edições ou novas aberturas da ficha.
- O tempo de espera é calculado entre esses dois timestamps, exibindo dias completos e horas restantes.
- Sem início, a interface mostra **Aguardando início**.
- Diferenças negativas não são exibidas como duração válida.
- Registros antigos usam `created_at` e, quando disponível, o par legado data/hora; não é inventada uma data de início ausente.
- Apresentação configurada para `America/Sao_Paulo`.

## 5. Compatibilidade, permissões e relatórios

- Preservadas as buscas existentes por código e patrimônio.
- Mantidos os escopos de empresa, unidade, hierarquia de vendedores e equipe técnica.
- Mantidos login, autenticação, auditoria e regras de edição/exclusão.
- PDFs foram atualizados para incluir marca, abertura, início, espera, descrição única e novas fotografias, mantendo seções históricas.
- O dossiê, a exportação e o PDF incluem a foto do equipamento completo, as duas fotos do defeito e as fotos do atendimento.
- Exportações de chamados incluem os novos campos sem remover as colunas antigas.
- A opção **Recolhimento necessário** apenas registra a necessidade; nenhuma movimentação patrimonial é criada automaticamente.

## 6. Banco de dados

Migração aditiva incluída:

`backend/migrations/20261104_add_chamados_manutencao_fields.js`

Novas colunas:

- `equipmentBrand`
- `openingEquipmentPhoto`
- `defectPhoto2`
- `openedAt`
- `maintenanceStartedAt`
- `serviceDescription`
- `fotoComplementar`

O rollback foi deliberadamente deixado não destrutivo para não apagar dados. O inicializador do backend também garante as colunas em bancos existentes.

### Dependências

- Frontend mantido em HTML/CSS/JavaScript, sem nova biblioteca.
- Backend mantido em Express/Knex/PostgreSQL/SQLite conforme o projeto recebido.
- `package.json` e `package-lock.json` não foram alterados.
- Nenhuma dependência nova precisa ser instalada além das já declaradas pelo projeto.

## 7. Responsividade

- Formulário técnico ocupa a tela inteira no celular, com rolagem controlada e ações acessíveis.
- Campos passam para uma coluna em telas menores.
- Filtros usam grade adaptativa: duas colunas em celular maior e uma em telas estreitas.
- Fotos aceitam câmera do celular e mantêm pré-visualização/substituição já existentes.
- A fila exibe todas as informações em cartões responsivos no celular, sem remover dados importantes.
- Em computador, a fila usa uma tabela estilo planilha com as 14 colunas alinhadas aos cabeçalhos e quebra de texto interna para não cortar a lateral.
- A mudança da fila para formato planilha foi limitada a telas de computador; o formato de cartões do celular foi mantido.
- O botão final do atendimento foi renomeado para **Enviar Finalização da Manutenção**.

## 8. Validações executadas

- Verificação de sintaxe JavaScript: 5 arquivos principais aprovados.
- Testes específicos da atualização: **6/6 aprovados**.
- Suíte de regressões de segurança e funcionamento existente: **69/69 aprovados**.
- Verificação de IDs HTML combinados entre `index.html` e `pages/chamados.html`: **272 IDs únicos**.
- Verificação nominal de arquivos sensíveis reais (`.env`, chaves e credenciais): nenhum encontrado; somente exemplos de configuração permanecem.
- Verificação da nova migração: nenhuma operação destrutiva.

## 9. Limitações e validações recomendadas em homologação

- O pacote recebido não contém `node_modules`, banco de homologação nem credenciais; por isso não foi iniciado um servidor completo com PostgreSQL e uploads reais.
- O projeto declara Node.js `>=20.17.0`, enquanto o executor local disponível era Node.js 18.17.1; foram executados testes estáticos e de regressão, mas o boot completo deve ser validado com a versão declarada pelo projeto.
- Não foram enviados e-mails, notificações, fotos ou vídeos para serviços externos.
- Câmera, galeria, teclado virtual e aparência final devem ser confirmados em dispositivos reais nas larguras de 320, 375, 430, 768, 1366 e 1920 px.
- A marca só é preenchida automaticamente quando a fonte consultada já possui `marca`; caso contrário, o vendedor deve digitá-la.
- Antes da produção, recomenda-se backup do banco, execução da migração em homologação e teste completo dos perfis Administrador, Supervisor, Vendedor, Mecânico e Responsável por Equipamentos.

## Arquivos principais alterados

- `pages/chamados.html`
- `index.html`
- `js/app.js`
- `js/compatibilidade-consolidada.js`
- `js/amaretto-manutencao-20261104.js`
- `backend/src/index.js`
- `backend/migrations/20261104_add_chamados_manutencao_fields.js`
- `backend/test/amaretto-maintenance.test.js`
- `sw.js`
- `version.json`

