# Manutencao — cliente

Estado: inventory-required. Este roteiro combina o escopo informado com boas práticas de verificação. Confirme regras no código do produto e registre commit/data; não presumir implementação.

## Entidades e contratos
Plano; serviço; ordem; veículo; oficina; vencimento por data/km; custo; anexos.

## Regras a conferir
Programada versus realizada; limites de odômetro; peças/serviços; reabertura; vínculo ao financeiro.

## Fluxo principal
Planejar → gerar ordem → executar → registrar custo → atualizar próxima manutenção.

## Aceitação específica
Atraso; execução parcial; alertas; duplicação de ordem; atualização do veículo e financeiro.

## Estados e permissões
Verificar carregamento, vazio, sucesso, erro, acesso negado, offline e dados obsoletos quando aplicáveis. Relacionar o operador ao escopo de dados autorizado. Operações em lote preservam seleção e informam resultado parcial.

## Referências e arquitetura
Registrar rotas, componentes, serviços, modelos, APIs, versão do esquema e contratos externos. Usar identidade global FrotaK e contexto do produto. Documentar dependências entre módulos em dependsOn.

## Evidência e continuidade
Checkpoint com concluído, pendente, próxima ação, commit, ambiente e evidência. Separar teste simulado, teste de interface e teste de integração real. Decisões aprovadas mantêm versão e origem; dúvidas permanecem explícitas.
