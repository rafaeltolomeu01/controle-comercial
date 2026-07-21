# Relatório de auditoria completa do Controle Comercial

**Data:** 20/07/2026  
**Tipo de trabalho:** análise somente de leitura, sem alteração do aplicativo ou do banco de dados  
**Objetivo:** verificar perfis, hierarquia, unidades, módulos, segurança, integridade, responsividade e igualdade funcional entre Minas Gerais e Espírito Santo.

## 1. Resumo executivo

O sistema possui uma base funcional ampla e várias proteções importantes já implementadas: autenticação com JWT, senha com hash, isolamento de uploads por empresa, auditoria em operações sensíveis, preservação de fotos em edições, aprovação parcial de saldo e regras específicas para vendedor/supervisor em parte dos módulos.

Entretanto, ele **ainda não pode ser considerado plenamente aderente às regras informadas**. Os principais motivos são:

1. O cadastro de usuário suporta apenas **uma unidade ou todas as unidades**. Não existe representação segura de “Minas e Espírito Santo, mas nenhuma outra unidade”.
2. A lista de tipos/modelos de equipamentos é salva por usuário. Por isso um administrador pode cadastrar opções e um vendedor de outra unidade não recebê-las.
3. Algumas regras estão apenas na interface; determinadas rotas do servidor não repetem a autorização com o mesmo rigor.
4. Há consultas administrativas sem filtro obrigatório de empresa em despesas, chamados e movimentações.
5. Perfis não previstos na função hierárquica recebem, por padrão, todos os usuários da empresa. Essa regra é permissiva demais.
6. A unidade da movimentação de equipamento não é salva em uma coluna própria; para registros antigos e novos ela é inferida por nome de empresa ou pelo usuário, o que é frágil.
7. O código de navegação e responsividade recebeu várias camadas de correção que se sobrepõem. Isso aumenta o risco de um ajuste corrigir uma tela e quebrar outra.

### Classificação geral

- **Críticos:** 7 pontos
- **Altos:** 9 pontos
- **Médios:** 8 pontos
- **Positivos confirmados:** 10 pontos

Recomendação: corrigir primeiro autorização e estrutura de unidades em uma cópia de teste, com backup, sem alterar valores financeiros históricos automaticamente.

## 2. O que foi analisado

- servidor Node/Express e acesso ao PostgreSQL;
- autenticação e carregamento do usuário;
- cadastro de usuários, perfis, permissões e hierarquia;
- unidade ativa e filtros de unidade;
- clientes, fila de aprovação e fotos;
- equipamentos, movimentações e tipos/modelos;
- chamados mecânicos;
- despesas de campo, saldos e aprovações;
- armazenamento geral do frontend;
- menus, rotas e telas permitidas;
- CSS responsivo para celular, tablet e computador;
- testes automatizados existentes.

### Limites desta auditoria

Esta análise foi realizada sobre o código entregue. Não foram alterados banco, dados, usuários, arquivos de produção ou configurações do Render. Também não houve acesso direto às contas reais de cada perfil nem execução de uma matriz completa no banco de produção. Assim:

- falhas demonstráveis pelo código estão marcadas como **confirmadas**;
- comportamentos dependentes dos dados reais estão marcados como **validação obrigatória em homologação**.

## 3. Pontos críticos confirmados

### C-01 — Usuário não suporta múltiplas unidades específicas

**Situação atual:** cada usuário possui somente o campo `unitId`. O formulário de usuário também possui uma única seleção de unidade. O token autenticado carrega apenas esse valor.

**Consequência:** hoje o sistema representa somente:

- uma unidade específica; ou
- `all`, que significa todas as unidades.

Não é possível representar corretamente um vendedor ou supervisor ligado exatamente a duas unidades. Usar `all` para resolver isso amplia o acesso além do necessário.

**Impacto nos perfis:** vendedor, supervisor, gerente, mecânico, motorista, ajudante, conferente e responsável por equipamentos.

**Correção segura:** criar uma tabela associativa de usuários e unidades, mantendo temporariamente o `unitId` antigo para compatibilidade. A migração deve ser aditiva, sem apagar o campo antigo até todos os módulos usarem o novo resolvedor de unidades permitidas.

### C-02 — Catálogo de equipamentos é salvo por usuário

**Situação atual:** `equipment_types` não está entre as configurações globais da empresa. O servidor transforma a chave em `<id-do-usuario>_equipment_types`.

**Consequência confirmada:** o administrador pode cadastrar “Slim”, “Cervejeira Grande” e outros modelos, mas o vendedor de Minas ou Espírito Santo pode receber a lista padrão ou sua própria lista antiga.

**Onde aparece:** cadastro de cliente, chamado mecânico e formulários que usam tipos/modelos de equipamento.

**Causa do relato Minas x Espírito Santo:** confirmada. Não existem dois aplicativos diferentes; existe um único aplicativo responsivo, mas cada usuário pode estar lendo um catálogo diferente.

**Correção segura:** tornar o catálogo global por empresa e administrável apenas por quem possui permissão de configuração. Migrar os catálogos antigos fazendo união sem duplicatas, apresentar a lista ao administrador para conferência e só depois ativá-la para todos.

### C-03 — Configurações globais podem ser gravadas por usuário autenticado

**Situação atual:** a rota genérica de gravação protege a importação de clientes, mas não aplica a mesma restrição explícita a `company_identity` e `units`, que são globais da empresa.

**Risco:** um usuário autenticado que fizer uma chamada direta ao servidor pode tentar alterar identidade da empresa ou unidades, mesmo que o botão esteja oculto na tela.

**Correção:** criar uma tabela de autorização por chave. Identidade, unidades, catálogos e motivos devem exigir administrador ou permissão específica no servidor.

### C-04 — Função hierárquica é permissiva para perfis não tratados

**Situação atual:** a função trata Vendedor, Supervisor e Gerente. Para qualquer outro perfil, retorna todos os usuários da empresa.

**Perfis afetados:** Financeiro, Conferente, Responsável por Equipamentos, Mecânico, Motorista e Ajudante de Motorista.

**Risco:** rotas que reutilizam essa função podem liberar registros de toda a empresa para esses perfis, mesmo quando a intenção seria acesso próprio, por unidade ou por atribuição.

**Correção:** adotar regra de negação por padrão. Cada perfil deve declarar explicitamente o escopo: próprio, subordinados, unidade(s), atribuídos ou empresa inteira.

### C-05 — Falta de empresa em consultas administrativas sensíveis

Foram confirmados pontos em que o administrador consulta/exclui por `id` sem acrescentar `empresa_id`:

- detalhe e exclusão de despesa de campo;
- exclusão de chamado mecânico;
- detalhe, edição e exclusão de movimentação de equipamento.

**Risco:** se houver mais de uma empresa no mesmo banco e um identificador for conhecido ou enviado incorretamente, um administrador de uma empresa pode atingir registro de outra.

**Correção:** toda leitura, edição e exclusão deve incluir empresa obrigatoriamente, inclusive para administrador. “Administrador total” deve significar total dentro da própria empresa, salvo um perfil separado de superadministrador da plataforma.

### C-06 — Movimentação não guarda unidade própria e aceita empresa enviada pelo formulário

**Situação atual:** a movimentação grava `empresa`, mas não uma unidade normalizada. A listagem tenta inferir a unidade pelo nome da Empresa Base, pelo responsável ou pelo autor.

**Riscos:**

- registros podem desaparecer ao selecionar unidade;
- alteração de nome da unidade quebra associação histórica;
- usuário `all` pode gerar associação ambígua;
- o formulário pode enviar um texto de empresa diferente do vínculo real;
- edição/exclusão administrativa não está limitada pela empresa.

**Correção:** adicionar `empresa_id` e `unit_id` explícitos à movimentação. Validar a unidade contra as unidades permitidas do usuário. Para histórico, preencher apenas registros que puderem ser associados com segurança e gerar relatório dos ambíguos, sem adivinhar silenciosamente.

### C-07 — Permissão de chamado mecânico amplia o alcance para toda a empresa

**Situação atual:** quem possui “Chamados Mecânicos”, quem possui `unitId = all` ou determinados perfis de equipamentos pode visualizar todos os chamados da empresa. Supervisor recebe essa permissão por padrão.

**Consequência:** um supervisor pode ver chamados fora da sua cadeia de vendedores. Um usuário de uma unidade com `all` também recebe escopo total.

**Correção:** separar “pode abrir chamado”, “pode atender chamados atribuídos”, “pode ver chamados da unidade” e “pode administrar todos os chamados da empresa”.

## 4. Matriz de perfis: esperado x situação encontrada

### Administrador

**Esperado:** acesso total dentro da empresa.  
**Encontrado:** o menu oferece acesso amplo, mas algumas rotas deixam de filtrar empresa justamente para administrador.  
**Avaliação:** funcionalmente amplo, porém com risco crítico de isolamento entre empresas.

### Supervisor

**Esperado:** seus próprios dados e os vendedores ligados a ele, respeitando suas unidades.  
**Encontrado:** clientes e despesas possuem partes da cadeia hierárquica; porém o modelo de unidade única não suporta duas unidades e chamados mecânicos podem ser ampliados para toda a empresa.  
**Avaliação:** parcialmente conforme.

### Gerente

**Esperado:** supervisores vinculados, vendedores diretos e vendedores desses supervisores.  
**Encontrado:** essa cadeia existe na função central. Continua limitada pelo problema de unidades e por rotas que não usam a função de forma uniforme.  
**Avaliação:** cadeia implementada, aplicação inconsistente por módulo.

### Vendedor

**Esperado:** somente seus clientes, despesas, saldos, movimentações e chamados, nas unidades autorizadas.  
**Encontrado:** o escopo próprio é aplicado em vários fluxos. Não há suporte a duas unidades específicas. No chamado, o corpo da requisição pode prevalecer sobre a unidade do usuário em uma criação, exigindo validação adicional no servidor. O catálogo de equipamentos é individual e pode divergir.  
**Avaliação:** parcialmente conforme, com falha crítica para múltiplas unidades.

### Mecânico / Manutenção

**Esperado:** chamados atribuídos ou da unidade, lançamentos de manutenção e informações necessárias ao atendimento.  
**Encontrado:** perfil padrão recebe chamados, mas a regra atual tende a mostrar todos os chamados da empresa. Não foi encontrada uma cadeia explícita de “mecânico responsável” limitando a listagem.  
**Avaliação:** acesso funcional, escopo amplo demais.

### Responsável por Equipamentos / Conferente

**Esperado:** equipamentos e movimentações conforme empresa/unidade e função.  
**Encontrado:** esses perfis recebem acesso amplo a movimentações; a unidade é inferida e não persistida. A função hierárquica genérica retorna todos os usuários.  
**Avaliação:** precisa de regra explícita por unidade e atribuição.

### Financeiro

**Esperado:** saldos, despesas e aprovações financeiras autorizadas.  
**Encontrado:** permissões de tela são coerentes em boa parte, mas a função hierárquica genérica o coloca no grupo que recebe todos os usuários da empresa.  
**Avaliação:** alcance precisa ser formalizado e não herdado por padrão.

### Motorista / Ajudante de Motorista

**Esperado:** despesas e solicitação de saldo próprias, nas unidades permitidas.  
**Encontrado:** permissões padrão existem, mas não há tratamento próprio na função hierárquica; portanto rotas que a utilizam podem retornar todos os usuários.  
**Avaliação:** menu criado, segurança de dados incompleta.

## 5. Auditoria por módulo

### 5.1 Login e sessão

**Pontos positivos:**

- JWT validado no servidor;
- usuário é relido no banco em cada requisição;
- usuário inativo ou aguardando liberação é bloqueado;
- senhas usam hash e existe migração gradual;
- diagnóstico do sistema é protegido;
- área operacional fica oculta até autenticação no frontend.

**Ajuste:** a autorização precisa ser centralizada após a autenticação; hoje muitas rotas fazem verificações diferentes.

### 5.2 Usuários, permissões e hierarquia

**Pontos positivos:** existem vínculos `supervisor_seller`, `manager_supervisor` e `manager_seller`.  
**Problemas:** unidade única, permissões padrão muito amplas para supervisor, múltiplas implementações de rotas permitidas no frontend e ausência de uma matriz única aplicada pelo servidor.

**Risco de manutenção:** `getUserAllowedRoutes` é redefinida várias vezes em arquivos diferentes. A última redefinição carregada vence, tornando o comportamento dependente da ordem dos scripts.

### 5.3 Clientes e fila de aprovação

**Pontos positivos:** vendedor comum não deve alterar cliente de outro vendedor; supervisor/gerente usam vínculos; aprovação e correção mantêm auditoria e notificações; fotos antigas têm camada de compatibilidade.

**Problemas:**

- catálogo de equipamento solicitado é por usuário;
- a rota de ficha completa de cliente aprovado verifica empresa e aprovação, mas não aplica claramente a cadeia vendedor/supervisor;
- essa rota consulta tabelas auxiliares que não aparecem na criação/migrações analisadas, podendo causar erro se elas não existirem no banco;
- clientes operacionais ficam em JSON e também parcialmente em tabela física, aumentando risco de divergência;
- filtro por unidade é fortemente dependente do frontend.

### 5.4 Equipamentos e movimentações

**Pontos positivos:** existe prevenção de clique duplicado, auditoria, notificação tolerante a falha e preservação dos links de mídia.  
**Problemas:** unidade inferida; empresa vinda do formulário; ausência de filtro de empresa em detalhes/edição/exclusão; histórico de patrimônio usa nome ou id da empresa; perfis de staff têm alcance amplo.

**Validação obrigatória:** testar Troca, Adição, Recolha e Adesivar com vendedor de MG, vendedor de ES, supervisor e responsável por equipamentos, incluindo fotos e rede lenta.

### 5.5 Chamados mecânicos

**Pontos positivos:** consulta individual e atualização normalmente usam empresa; status permitidos são validados.  
**Problemas:** exclusão administrativa sem empresa; `unitId` enviado pelo formulário pode prevalecer na criação; permissão “Chamados Mecânicos” equivale a enxergar tudo; catálogo de equipamento diverge por usuário.

### 5.6 Despesas e saldos

**Pontos positivos:** testes existentes cobrem preservação de fotos, correção pelo dono/admin, aprovação parcial, saldo direto transacionado e auditado, unidade do saldo e resumo por período.  
**Problemas:** detalhe/exclusão administrativa sem empresa; usuários de múltiplas unidades não podem ser representados; as rotas de reembolso usam autorização própria e não um middleware central único; cartões e filtros precisam de teste real com dados de cada unidade e perfil.

### 5.7 Configurações e armazenamento

O sistema mistura:

- tabelas relacionais do PostgreSQL;
- listas JSON em `app_kv_store`;
- cache local do navegador;
- compatibilidade com chaves antigas por usuário.

Isso preservou dados durante várias evoluções, mas hoje cria risco de listas diferentes em aparelhos diferentes e de dados antigos reaparecerem durante a sincronização. Catálogos e configurações devem migrar para estruturas globais por empresa com versão e auditoria.

### 5.8 Relatórios e exportações

As exportações dependem das listas já filtradas em alguns pontos. Deve existir teste garantindo que a exportação respeita empresa, unidades permitidas, hierarquia e filtros atuais. Não foi encontrada uma suíte de integração que prove isso para todos os módulos.

## 6. Responsividade: celular, tablet e computador

O sistema é um aplicativo web responsivo único. Não há um aplicativo separado para Minas, Espírito Santo ou celular.

Foram encontradas muitas regras móveis sobrepostas. Exemplos confirmados:

- uma regra transforma tabelas em cartões e define largura mínima zero;
- outra regra posterior define largura mínima de 720 px;
- tabelas financeiras chegam a definir 1120 px;
- arquivos diferentes aplicam transformações por `:has()` e por identificador de tabela.

**Risco:** coluna, caixa de seleção ou botão pode desaparecer dependendo da largura e da ordem final do CSS. Isso é compatível com os defeitos visuais relatados anteriormente.

**Correção recomendada:** definir somente dois padrões oficiais:

1. tabela rolável horizontalmente quando comparação de colunas for necessária;
2. cartão móvel com `data-label` quando leitura individual for melhor.

Remover regras duplicadas por etapas, com comparação visual antes/depois. Testar 360, 390, 430, 768, 1024, 1366 e 1920 px.

## 7. Segurança e integridade de dados

### Proteções confirmadas

- senha com bcrypt;
- ausência de credencial administrativa padrão no servidor;
- JWT e verificação de status do usuário;
- uploads de banco vinculados à empresa;
- pasta física de uploads protegida por empresa;
- raiz inteira do projeto não é publicada;
- auditoria em várias operações críticas;
- valores financeiros não são convertidos automaticamente na inicialização;
- lançamento direto de saldo usa transação e auditoria;
- mídia antiga é lida sem regravação automática.

### Riscos que precisam de correção

- filtros de empresa ausentes em rotas administrativas;
- configuração global gravável sem autorização específica;
- regra hierárquica permissiva para perfis não tratados;
- unidade do chamado/movimentação não validada de forma única;
- autorização distribuída e divergente entre frontend e backend;
- mistura de JSON, cache local e tabelas físicas.

## 8. Testes automatizados

A suíte existente foi executada e apresentou:

- **38 testes executados**;
- **38 aprovados**;
- **0 falhas**.

Isso confirma várias regressões já protegidas, mas os testes são majoritariamente estáticos: verificam trechos e padrões no código. Existe apenas um arquivo principal de testes e não foram encontrados testes completos de API, banco, navegador, perfis, dispositivos ou múltiplas unidades.

### Testes que faltam

- login de cada perfil e matriz de rotas permitidas/proibidas;
- tentativa direta à API sem depender do menu;
- vendedor próprio x vendedor alheio;
- supervisor vinculado x não vinculado;
- duas unidades específicas por usuário;
- isolamento entre duas empresas;
- criação e listagem por unidade em todos os módulos;
- cadastro de cliente MG/ES com o mesmo catálogo;
- movimentação completa com upload lento e falha de notificação;
- despesas e saldos com aprovação parcial;
- exportação respeitando filtros;
- testes visuais em celular/tablet/desktop.

## 9. Plano seguro de correção

### Fase 0 — Proteção

1. manter backup lógico baixado;
2. criar cópia restaurada do banco;
3. usar serviço de homologação separado;
4. congelar alterações manuais durante a migração;
5. nunca converter valores ou apagar registros automaticamente.

### Fase 1 — Segurança imediata

1. acrescentar `empresa_id` em todas as consultas por id;
2. bloquear gravação de configurações globais por perfil não autorizado;
3. substituir o padrão “outros perfis veem todos” por negação;
4. validar permissão e unidade em cada POST/PUT/DELETE;
5. criar middleware central de módulo + ação + escopo.

### Fase 2 — Múltiplas unidades

1. criar `usuario_unidades`;
2. migrar o `unitId` atual sem removê-lo;
3. criar `getAllowedUnitIds(user)` no servidor;
4. retornar unidades permitidas no login;
5. filtrar todas as consultas no servidor;
6. permitir escolher apenas entre unidades autorizadas;
7. remover o uso de `all` como solução para duas unidades.

### Fase 3 — Catálogo único por empresa

1. criar catálogo de tipos/modelos global por empresa;
2. copiar e unir catálogos antigos por usuário;
3. revisar duplicatas com administrador;
4. fazer clientes, chamados e movimentações usarem a mesma origem;
5. restringir manutenção do catálogo por permissão.

### Fase 4 — Normalização dos módulos

1. persistir `empresa_id` e `unit_id` em movimentações;
2. consolidar clientes e configurações hoje duplicados entre JSON e tabelas;
3. manter leitores de compatibilidade temporários;
4. gerar relatório de registros ambíguos, sem corrigi-los por suposição;
5. simplificar regras repetidas de menu e rotas.

### Fase 5 — Responsividade e testes

1. consolidar CSS móvel;
2. criar testes de API com banco descartável;
3. criar testes de navegador por perfil;
4. testar matriz de resoluções;
5. validar primeiro em homologação e só então promover para produção.

## 10. Critérios de aceite antes de publicar

Para cada perfil, validar em Minas e Espírito Santo:

- vê somente unidades autorizadas;
- não acessa outra unidade alterando URL ou requisição;
- não acessa outra empresa por id;
- menus correspondem às permissões do servidor;
- filtros e totais usam a mesma base;
- exportação contém apenas o que está permitido;
- opções de equipamentos são idênticas na empresa;
- fotos antigas e novas permanecem visíveis;
- formulários não apagam dados após erro;
- celular permite ver todas as ações necessárias;
- supervisor vê somente subordinados vinculados;
- vendedor vê somente registros próprios;
- mecânico vê somente escopo definido;
- administrador tem acesso total apenas dentro da empresa.

## 11. Conclusão

O sistema tem boa cobertura funcional e várias correções de integridade importantes, mas cresceu por camadas. A maior necessidade agora não é adicionar mais uma correção visual isolada: é consolidar o modelo de autorização, unidades e configurações globais.

O defeito específico dos tipos de geladeira diferentes entre Minas e Espírito Santo está explicado pelo catálogo por usuário e deve ser corrigido tornando-o global por empresa. O requisito de vendedor/supervisor com duas unidades exige mudança estrutural aditiva; não deve ser improvisado com `all`.

Nenhuma correção descrita neste relatório foi aplicada. O código e o banco permaneceram intactos durante a auditoria.
