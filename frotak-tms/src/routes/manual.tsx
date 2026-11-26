import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ComponentType } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  Fuel,
  Landmark,
  MapPinned,
  MonitorCheck,
  Route as RouteIcon,
  Search,
  ShieldCheck,
  Smartphone,
  Truck,
  Users,
  WalletCards,
  X,
} from "lucide-react";

export const Route = createFileRoute("/manual")({
  head: () => ({
    meta: [
      { title: "Suporte e Manual - Frotak" },
      { name: "description", content: "Guias de uso da Central Frotak e do app motorista." },
    ],
  }),
  component: ManualPage,
});

type Topic = "operacao" | "motorista" | "financeiro" | "cadastros" | "suporte";
type IconType = ComponentType<{ className?: string }>;

interface Guide {
  title: string;
  detail: string;
}

interface GuideGroup {
  id: string;
  title: string;
  topic: Topic;
  icon: IconType;
  summary: string;
  steps: string[];
  checks: string[];
  guides: Guide[];
}

const topics: Array<{ key: "todos" | Topic; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "operacao", label: "Operação" },
  { key: "motorista", label: "App motorista" },
  { key: "financeiro", label: "Financeiro" },
  { key: "cadastros", label: "Cadastros" },
  { key: "suporte", label: "Administração e suporte" },
];

const guideGroups: GuideGroup[] = [
  {
    id: "acesso",
    title: "Acesso e navegação",
    topic: "suporte",
    icon: ShieldCheck,
    summary: "Entrada no sistema, empresa selecionada, permissões e problemas de acesso.",
    steps: [
      "Acesse o endereço oficial do sistema e informe suas credenciais nos campos de login.",
      "Depois de entrar, confira o nome da empresa/tenant no cabeçalho antes de consultar ou lançar dados.",
      "Use o menu lateral para abrir o módulo desejado; use a busca da página para localizar registros.",
      "Ao terminar em um computador compartilhado, encerre a sessão pelo menu da conta.",
    ],
    checks: [
      "Confirme se está na empresa correta antes de criar, editar ou pagar qualquer registro.",
      "Acesso a menus depende do perfil definido para o usuário.",
    ],
    guides: [
      { title: "Como acessar o sistema pela primeira vez", detail: "Abra o endereço oficial informado pela empresa e entre com o usuário e a senha que o administrador forneceu. Se o convite ou credencial não funcionar, confirme com o administrador que o usuário foi criado no tenant correto." },
      { title: "Como fazer login e sair da conta", detail: "Informe suas credenciais na tela de entrada. Para sair, abra o menu da conta e encerre a sessão; em seguida, confirme que voltou à tela de login, especialmente em aparelho compartilhado." },
      { title: "Como recuperar ou trocar a senha", detail: "Use a opção de recuperação/troca de senha disponível na tela de acesso ou peça ao administrador para redefinir a credencial. Após a troca, entre novamente e evite compartilhar a senha temporária em grupos públicos." },
      { title: "Como identificar o tenant e a empresa selecionada", detail: "Confira o nome e a identificação da empresa exibidos no cabeçalho ou menu lateral. Os cadastros e consultas pertencem à empresa ativa; confirme-a antes de iniciar qualquer operação." },
      { title: "Como navegar pelo menu lateral", detail: "Escolha a área pelo menu lateral, como Gestão de Frota, Abastecimentos, Cadastros ou Financeiro. Em telas menores, abra o menu recolhido e selecione o módulo desejado." },
      { title: "Como pesquisar e filtrar informações nas telas", detail: "Use o campo de pesquisa com placa, nome, número ou outra identificação disponível e combine-o com os filtros da tela. Remova filtros antigos quando o registro esperado não aparecer." },
      { title: "Como entender permissões e perfis de usuário", detail: "O perfil determina quais áreas e ações ficam disponíveis. Se faltar um menu ou botão, peça ao administrador para conferir o usuário, o tenant e as permissões atribuídas." },
      { title: "O que fazer quando uma tela não carrega ou o acesso é negado", detail: "Atualize a página uma vez, confirme a conexão e verifique se a sessão continua ativa. Se persistir, registre endereço da tela, usuário, horário e mensagem exibida para o administrador/suporte." },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    topic: "operacao",
    icon: MonitorCheck,
    summary: "Leitura dos indicadores e localização rápida de situações operacionais.",
    steps: [
      "Abra o Dashboard e observe os totais e alertas da frota.",
      "Pesquise por placa, motorista, caçamba, cidade ou status para reduzir a lista.",
      "Abra o veículo para conferir o frete atual, a etapa, a localização e o horário da última atualização.",
      "Use Gestão de Frota para executar comandos; o painel serve para acompanhar e localizar pendências.",
    ],
    checks: [
      "Um status resume a informação recebida pelo sistema; confira os detalhes antes de agir.",
      "Compare o horário de atualização com o horário do evento informado pelo motorista.",
    ],
    guides: [
      { title: "Como interpretar o painel operacional", detail: "Leia os indicadores como um resumo da operação e depois abra o registro para entender cada veículo e frete. O painel ajuda a priorizar atenção, mas a ação deve ser feita na tela operacional correspondente." },
      { title: "Como consultar a situação geral da frota", detail: "Confira os totais por situação e percorra a lista de veículos. Se um total parecer incorreto, remova filtros e compare os registros individuais." },
      { title: "Como localizar um veículo, motorista ou frete", detail: "Digite a placa, o nome do motorista ou a identificação do frete no campo de busca. Abra o resultado para conferir a associação entre veículo, condutor e operação atual." },
      { title: "Como entender os indicadores e contadores do painel", detail: "Cada contador agrupa registros segundo o status atual exibido pelo sistema. Abra a lista correspondente para ver quais veículos formam aquele total e identificar eventuais exceções." },
      { title: "Como interpretar a data da última atualização", detail: "Use o horário como referência da última informação recebida para aquele registro. Um horário antigo pode indicar falta de atualização do app, conexão ou evento ainda não enviado." },
      { title: "O que fazer quando os dados do painel parecem desatualizados", detail: "Atualize a página e abra o registro na Gestão de Frota para comparar status e horário. Se continuar divergente, anote placa, etapa, hora do evento e telas em que a diferença aparece." },
    ],
  },
  {
    id: "gestao-frota",
    title: "Gestão de frota e fretes",
    topic: "operacao",
    icon: RouteIcon,
    summary: "Criação e acompanhamento de fretes, tiros longos, etapas e disponibilidade da frota.",
    steps: [
      "Antes de criar, confirme os cadastros do cliente, remetente, destinatário, produto, motorista, veículo e caçamba.",
      "Na Gestão de Frota, escolha o tipo de operação e preencha os dados comerciais e da rota.",
      "Revise a disponibilidade dos recursos e salve; depois abra o frete para acompanhar as etapas e documentos.",
      "Avance a operação conforme as confirmações recebidas. Para encerrar um tiro longo, solicite o retorno ao pátio e acompanhe a confirmação do motorista.",
    ],
    checks: [
      "Não atribua motorista, cavalo ou caçamba que estejam ocupados em outra operação ativa.",
      "Não altere manualmente um status sem conferir a etapa, os documentos e o estado real da viagem.",
      "Se o app e a Central divergirem, registre placa, frete, horário e etapa antes de corrigir.",
    ],
    guides: [
      { title: "Como criar um frete individual", detail: "Use a criação individual quando a viagem tiver um caminhão. Selecione o veículo e motorista disponíveis, informe cliente/pagador, remetente, destinatário, origem, destino, produto e valores; revise a placa e a rota antes de salvar." },
      { title: "Como preencher os dados comerciais e operacionais de um frete", detail: "Preencha os campos da operação com os dados confirmados pelo setor responsável. Confira especialmente responsabilidade CIF/FOB, forma de cobrança, valor ou preço por tonelada, locais, produto e observações necessárias." },
      { title: "Como escolher veículo, motorista e caçamba", detail: "Selecione recursos disponíveis para a operação e confira os vínculos exibidos. Se a caçamba estiver indisponível, verifique vínculo com outro cavalo ou uso em frete ativo antes de tentar novamente." },
      { title: "Como criar um frete para vários caminhões", detail: "Escolha a opção de frete em grupo, informe os dados que serão comuns à operação e selecione os caminhões participantes. Revise a lista de recursos e confirme que cada caminhão deve executar o mesmo serviço antes de salvar." },
      { title: "Como criar um tiro longo", detail: "Abra o fluxo de tiro longo, escolha trator e motorista e monte a sequência de fretes na ordem em que serão executados. Complete os dados de cada trecho e confira qual será liberado primeiro ao motorista." },
      { title: "Como adicionar fretes à rota de um tiro longo", detail: "Abra a rota/tiro longo em andamento e use a ação de adicionar frete. Preencha os dados do próximo trecho e confirme a ordem; o novo trecho deve ficar associado à viagem existente do motorista." },
      { title: "Como acompanhar um frete pela Gestão de Frota", detail: "Localize o cartão/registro pelo código, placa ou motorista e confira etapa, status, documentos e eventos. Use o detalhe do frete como referência para decidir o próximo comando operacional." },
      { title: "Como acompanhar um tiro longo do início ao fim", detail: "Acompanhe a sequência de fretes, confirmações do motorista, documentos e retorno. Ao concluir cada trecho, confira se o próximo da fila foi liberado e se o veículo manteve o status esperado." },
      { title: "Como editar os dados de um frete", detail: "Abra o frete correto e use a ação de edição disponível. Altere somente os campos confirmados, revise os dados que afetam documento, valor ou rota e salve; confira o registro atualizado." },
      { title: "Como atribuir outro motorista, veículo ou caçamba", detail: "Abra os dados do frete e escolha o recurso substituto disponível. Confirme que ele está ativo e livre, salve a alteração e verifique que o app motorista e o quadro operacional passaram a mostrar a associação correta." },
      { title: "Como solicitar o retorno ao pátio", detail: "Quando o ciclo estiver concluído, localize a operação e use o comando de solicitar retorno. Confirme o envio e acompanhe se a Central mostra retorno solicitado e se o app do motorista apresenta a ação de chegada ao pátio." },
      { title: "Como registrar a chegada do caminhão ao pátio", detail: "Após a solicitação de retorno, o motorista confirma a chegada pelo app. A gestão deve aguardar essa confirmação e conferir a atualização do status antes de considerar o veículo disponível para outro frete." },
      { title: "Como finalizar ou encerrar um frete", detail: "Confira se a etapa final foi confirmada e se os documentos/comprovantes exigidos estão anexados. Use a ação de encerramento indicada na tela e depois verifique o histórico e a disponibilidade dos recursos." },
      { title: "Como iniciar um novo frete após concluir o anterior", detail: "Confirme que o frete anterior foi encerrado e que o veículo, motorista e caçamba aparecem disponíveis. Crie a nova operação pelo fluxo apropriado e confirme que o status inicial foi atribuído corretamente." },
      { title: "Como arquivar e localizar fretes encerrados", detail: "Use a área de histórico/arquivados e filtre por período, placa, motorista ou identificação do frete. Abra o registro para revisar rota, documentos e eventos sem reativar a operação." },
      { title: "Como entender os status dos veículos na Gestão de Frota", detail: "Leia o status junto com a etapa do frete: disponível, em rota, aguardando carga/descarga, retornando, aguardando comando, em manutenção ou parado indicam condições diferentes. Abra o detalhe e confira o evento que gerou o status." },
      { title: "Como entender as etapas e os status de um frete", detail: "As etapas representam o avanço operacional e os status resumem a situação atual, como aguardando nota/CT-e, aguardando confirmação ou em deslocamento. Use a linha do tempo e os documentos para identificar qual ação ainda falta." },
      { title: "Como entender os status de um tiro longo", detail: "Considere o ciclo completo e a fila de fretes associados. Um trecho pode terminar enquanto o tiro longo continua; confira se há próximo frete, retorno solicitado ou confirmação de chegada antes de encerrar a viagem." },
      { title: "Por que um veículo, motorista ou caçamba aparece bloqueado", detail: "O recurso pode estar inativo, vinculado a outro conjunto ou ocupado por operação ativa. Confira o cadastro e os fretes em andamento para identificar o vínculo que impede nova atribuição." },
      { title: "Como liberar uma caçamba vinculada ou ocupada", detail: "Confira o vínculo atual no cadastro e veja se existe frete ativo usando a caçamba. Corrija ou encerre a operação anterior de forma consistente; depois volte à criação do frete e atualize a seleção." },
      { title: "O que fazer quando um frete volta para “Aguardando comando”", detail: "Confira qual etapa foi concluída e se existe próximo trecho ou comando pendente. Revise o estado da operação na Central e evite criar outro frete até confirmar se o ciclo atual foi encerrado ou deve continuar." },
      { title: "O que fazer quando o status não atualiza na Gestão de Frota", detail: "Atualize a tela e confira o horário/evento mais recente do frete. Compare com o app do motorista e registre placa, etapa, ação executada e horário para localizar onde a atualização deixou de aparecer." },
      { title: "Como conferir se o comando chegou ao app motorista", detail: "Depois de enviar o comando, abra o frete na Central e peça ao motorista para atualizar/consultar a tela atual no app. Compare a ação exibida com a etapa esperada e registre qualquer diferença." },
    ],
  },
  {
    id: "documentos",
    title: "Notas, CT-e e documentos",
    topic: "motorista",
    icon: FileText,
    summary: "Anexos do frete, conferência da nota e disponibilização de CT-e/MDF-e.",
    steps: [
      "Abra o frete ativo correto e localize a área de nota ou documentos.",
      "Anexe o arquivo legível, aguarde o envio terminar e confira se o documento aparece no registro.",
      "Siga a etapa de conferência/aprovação da nota antes de anexar o CT-e quando o fluxo exigir.",
      "Peça ao motorista para abrir o frete atual e confirmar a visualização ou o download do documento.",
    ],
    checks: [
      "Confira placa, viagem e frete associados ao documento antes de enviar.",
      "Se o anexo falhar, confira formato, conexão, tamanho aceito e se o envio terminou.",
    ],
    guides: [
      { title: "Como receber ou anexar a nota do frete", detail: "Abra o frete correspondente e anexe a nota na área de documentos. Aguarde o carregamento, abra ou confira o nome do arquivo e confirme que o status do documento foi atualizado." },
      { title: "Como conferir e aprovar uma nota", detail: "Compare o arquivo recebido com os dados do frete e os critérios internos de conferência. Se estiver correto, use a ação de aprovação; isso libera a etapa seguinte prevista no fluxo." },
      { title: "Como rejeitar uma nota e solicitar correção", detail: "Quando houver divergência, use a opção de rejeição e informe claramente o que precisa ser corrigido. Acompanhe o reenvio e confira se a versão corrigida está vinculada ao mesmo frete." },
      { title: "Como reenviar uma nota corrigida", detail: "Anexe a nova versão no registro que teve a nota rejeitada e sinalize o reenvio pelo fluxo disponível. Confirme que o arquivo mais recente aparece para nova conferência." },
      { title: "Como enviar o CT-e ao motorista", detail: "Depois da aprovação da nota, abra o frete ativo e anexe o CT-e/MDF-e na etapa documental indicada. Confira o envio e acompanhe a confirmação de recebimento no app motorista." },
      { title: "Como anexar o MDF-e ao frete", detail: "Use a área de documentos do frete atual e selecione o arquivo MDF-e correspondente. Verifique que ele está associado à viagem certa e que ficou disponível junto dos demais documentos." },
      { title: "Como confirmar que o documento foi enviado ao frete correto", detail: "Revise placa, identificação do frete, motorista e nome do arquivo na tela de detalhes. Se houver erro de associação, corrija o registro antes que o motorista avance a etapa." },
      { title: "Como o motorista confirma o recebimento do CT-e", detail: "Após o envio, o motorista abre o frete atual no app e confirma o recebimento quando solicitado. A Central deve refletir a confirmação; se não refletir, compare a operação e os horários." },
      { title: "Como visualizar ou baixar o CT-e no app motorista", detail: "No app, abra o frete ativo e acesse a área de documentos para visualizar ou baixar o CT-e. Se a ação falhar, confirme que o arquivo foi anexado ao frete atual e tente novamente com conexão estável." },
      { title: "Como anexar comprovantes de entrega", detail: "Abra o frete em execução e envie o comprovante solicitado pela operação, usando foto legível ou arquivo aceito. Confirme que o anexo aparece no frete antes de finalizar." },
      { title: "Como consultar documentos de fretes anteriores", detail: "Localize o frete no histórico e abra seus detalhes. Consulte a área de documentos para visualizar os anexos ligados àquela viagem encerrada." },
      { title: "O que fazer quando um documento não aparece ou não abre", detail: "Confirme a associação ao frete e aguarde o carregamento do arquivo. Atualize a tela e tente novamente; se persistir, registre o nome do arquivo, frete, dispositivo e mensagem apresentada." },
    ],
  },
  {
    id: "app-motorista",
    title: "App motorista",
    topic: "motorista",
    icon: Smartphone,
    summary: "Acesso do motorista, execução das etapas e envio de informações pelo celular.",
    steps: [
      "Confirme que o motorista está ativo e que o telefone cadastrado está correto.",
      "Entre no app com o telefone como login e a senha fornecida pela empresa.",
      "Abra a operação atual e siga a ação que a tela mostra; confirme cada etapa somente quando ela acontecer.",
      "Envie os documentos e fotos solicitados e confira que o envio foi concluído antes de sair da tela.",
    ],
    checks: [
      "Não confirme uma etapa antes de realizá-la; isso mantém o histórico fiel à viagem.",
      "Em caso de falha, registre placa, frete, tela, horário e modelo do aparelho.",
    ],
    guides: [
      { title: "Como acessar o app motorista pela primeira vez", detail: "Instale/abra o app indicado pela empresa e confirme com a gestão que o motorista está cadastrado e ativo. Tenha em mãos o telefone cadastrado e a senha inicial." },
      { title: "Como fazer login usando o telefone", detail: "Digite o telefone vinculado ao cadastro do motorista como login, usando o formato aceito pela tela, e informe a senha. Se não entrar, peça à gestão para conferir o telefone cadastrado e o estado do usuário." },
      { title: "Como trocar ou recuperar a senha", detail: "Use a opção de troca/recuperação disponível ou solicite redefinição ao administrador. Depois de trocar, teste o novo acesso antes de iniciar uma viagem." },
      { title: "Como identificar o frete e o veículo atribuídos", detail: "Na tela inicial, confira os dados da operação ativa, a placa e a etapa exibida. Se não corresponderem à viagem atual, não avance e avise a gestão para corrigir a atribuição." },
      { title: "Como entender as telas e etapas do frete", detail: "Leia a instrução principal da tela e conclua a ação correspondente, como chegada, carregamento, deslocamento ou descarga. A próxima tela depende da etapa registrada pela Central." },
      { title: "Como avançar cada etapa da viagem", detail: "Use o botão da etapa somente após concluir a atividade solicitada. Aguarde a confirmação do app e confira que o próximo passo apareceu antes de continuar." },
      { title: "Como receber e confirmar o CT-e", detail: "Abra o documento apresentado para o frete atual, confira se ele está legível e use a ação de confirmar recebimento. Comunique a gestão se o documento não corresponder à viagem." },
      { title: "Como registrar a chegada ao pátio", detail: "Quando a gestão solicitar o retorno, siga a tela de retorno e toque em confirmar chegada somente ao chegar ao pátio. Aguarde a confirmação enviada ao sistema." },
      { title: "Como anexar o comprovante de entrega", detail: "Fotografe ou selecione o comprovante solicitado, enquadre o documento inteiro e envie pelo frete atual. Aguarde a confirmação de upload antes de finalizar a entrega." },
      { title: "Como tirar e enviar foto da bomba de combustível", detail: "No registro de abastecimento, toque no controle de foto da bomba e permita o acesso à câmera se solicitado. Fotografe a bomba/visor com os dados legíveis, confirme a imagem e envie." },
      { title: "Como tirar e enviar foto do comprovante de abastecimento", detail: "Use o controle de comprovante no mesmo abastecimento, fotografe o recibo inteiro e legível e confirme o envio. Verifique que a imagem aparece anexada antes de sair." },
      { title: "Como registrar despesas durante a viagem", detail: "Abra a área de despesas do frete, informe o tipo, valor e dados solicitados e anexe comprovante quando disponível. Revise antes de enviar; abastecimentos devem ser registrados na função própria." },
      { title: "Como consultar o caixa do motorista", detail: "Acesse o caixa/viagem para conferir entradas, despesas lançadas e saldo. Despesas do caixa não devem incluir abastecimentos, que seguem o fluxo próprio de título a pagar." },
      { title: "O que fazer quando o app não permite avançar", detail: "Leia a mensagem, confira se falta documento, confirmação ou ação anterior e atualize a tela. Se o bloqueio continuar, informe a gestão com a etapa atual e uma captura de tela." },
      { title: "O que fazer quando fotos ou documentos não carregam", detail: "Confira a conexão e as permissões de câmera/arquivos do aparelho, tente novamente e aguarde o indicador de envio. Se falhar, mantenha o arquivo original e informe a gestão para evitar duplicidade." },
    ],
  },
  {
    id: "abastecimentos",
    title: "Abastecimentos e consumo",
    topic: "financeiro",
    icon: Fuel,
    summary: "Registro de combustível, comprovantes e médias de consumo por abastecimento ou frete.",
    steps: [
      "Registre o abastecimento no veículo/frete correto e informe data, combustível, litros, valor e odômetro solicitados.",
      "Anexe foto da bomba e do comprovante, conferindo legibilidade antes de enviar.",
      "Para média por frete, confira odômetro inicial/final e os abastecimentos associados ao tiro longo.",
      "Consulte a aba Abastecimentos para registros individuais e a visão por frete para consumo do ciclo.",
    ],
    checks: [
      "Odômetros precisam estar coerentes e em ordem crescente para o cálculo KM/L fazer sentido.",
      "Abastecimento gera título a pagar no fluxo financeiro e não deve ser lançado como despesa do caixa do motorista.",
    ],
    guides: [
      { title: "Como registrar um abastecimento", detail: "Na aba Abastecimentos ou no app motorista, inicie um novo registro para o veículo/frete correto e preencha os dados solicitados. Revise litros, valor, data e odômetro antes de confirmar." },
      { title: "Como preencher combustível, valor, litros e odômetro", detail: "Use os dados do visor e do comprovante, sem estimar valores. Informe o odômetro atual do caminhão e selecione o combustível correspondente ao abastecimento." },
      { title: "Como anexar as fotos do abastecimento", detail: "Anexe a foto da bomba/visor e a imagem do comprovante nos campos próprios. Confira se cada imagem está legível e ligada ao mesmo abastecimento antes de enviar." },
      { title: "Como consultar o histórico de abastecimentos", detail: "Abra a aba Abastecimentos e filtre por período, veículo, motorista ou tipo de combustível. Abra o registro para revisar valores, odômetro e comprovantes." },
      { title: "Como entender a média de consumo por abastecimento", detail: "A média entre abastecimentos depende da distância percorrida entre as leituras de odômetro e do volume utilizado conforme o critério do sistema. Verifique se não há leitura ausente ou abastecimento associado a outro veículo." },
      { title: "Como consultar a média de consumo por frete", detail: "Abra a visão Por frete, escolha o caminhão e selecione um tiro longo disponível. Confira o período, os odômetros e os abastecimentos usados no cálculo da média." },
      { title: "Como selecionar o caminhão e o tiro longo para consultar a média", detail: "Na aba Por frete, selecione primeiro o caminhão; depois escolha um tiro longo da lista apresentada. Se a lista estiver vazia, confirme que existem viagens concluídas e dados de odômetro associados." },
      { title: "Como informar e conferir odômetro inicial e final", detail: "Registre a leitura inicial no começo do ciclo e a final no encerramento, usando a unidade exibida no veículo. Compare as leituras com o painel e corrija divergências antes de avaliar o consumo." },
      { title: "Como interpretar o cálculo de KM/L", detail: "A média expressa quilômetros percorridos por litro com base nos odômetros e abastecimentos que o sistema vinculou ao período. Uma média fora do esperado pode vir de leituras incorretas ou abastecimentos ausentes." },
      { title: "Por que um abastecimento pode não aparecer na média do frete", detail: "Confira se veículo, período e tiro longo coincidem e se o abastecimento foi associado à operação. Verifique também odômetros inicial/final e se o registro foi concluído, não apenas iniciado." },
    ],
  },
  {
    id: "cadastros",
    title: "Cadastros e vínculos",
    topic: "cadastros",
    icon: Truck,
    summary: "Dados de apoio usados para montar fretes, controlar recursos e liberar acessos.",
    steps: [
      "Abra o módulo do cadastro que deseja incluir ou corrigir.",
      "Pesquise antes de criar para evitar duplicidade e confira os campos obrigatórios.",
      "Salve e volte à operação para confirmar que o novo cadastro aparece nas opções.",
      "Mantenha vínculos e situação ativo/inativo coerentes com a operação atual.",
    ],
    checks: [
      "Placa, telefone e identificadores devem ser conferidos com a fonte oficial da empresa.",
      "Evite apagar ou desvincular cadastros que tenham histórico operacional; use a opção de inativação quando aplicável.",
    ],
    guides: [
      { title: "Como cadastrar e editar veículos", detail: "Abra Veículos, localize um cadastro existente antes de incluir outro e preencha os dados identificadores e operacionais. Salve e confirme status, placa e disponibilidade." },
      { title: "Como cadastrar e editar caçambas", detail: "Abra Carretas/caçambas e registre o identificador e as características usadas pela operação. Confira se o implemento não está vinculado a outro cavalo ou frete ativo." },
      { title: "Como cadastrar e editar motoristas", detail: "Abra Motoristas, informe os dados pessoais e operacionais solicitados e confirme telefone e situação do cadastro. Para acesso ao app, o telefone deve corresponder ao login usado pelo motorista." },
      { title: "Como cadastrar clientes", detail: "Inclua o cliente com os dados comerciais e fiscais necessários e revise possíveis duplicados. Confirme que ele aparece na seleção de pagador/cliente ao criar um frete." },
      { title: "Como cadastrar remetentes", detail: "Registre nome e localização do ponto de carregamento conforme os dados fornecidos. Depois de salvar, confirme que o remetente está disponível no formulário do frete." },
      { title: "Como cadastrar destinatários", detail: "Registre o recebedor e seu local de entrega, conferindo cidade e estado. Se houver mais de um local com nome parecido, use a identificação correta no frete." },
      { title: "Como cadastrar produtos", detail: "Inclua a descrição do produto e os dados fiscais/operacionais exigidos pela empresa. Confirme a unidade e a disponibilidade na criação do frete." },
      { title: "Como vincular cavalo e caçamba", detail: "Abra o cadastro ou a tela de vinculação e associe o implemento ao cavalo correspondente. Salve e confira que a combinação aparece corretamente na gestão de frota." },
      { title: "Como consultar e corrigir vínculos de veículos", detail: "Pesquise pelo cavalo e veja implemento, motorista e operações ativas. Corrija apenas o vínculo que estiver errado e confira se não interfere em um frete ainda em execução." },
      { title: "Como ativar ou inativar um cadastro", detail: "Abra o registro e altere sua situação pela ação disponível. Inative cadastros que não devem ser selecionados em novas operações, preservando o histórico já relacionado." },
      { title: "Como preparar os cadastros antes de criar um frete", detail: "Confira veículo, motorista, caçamba, cliente, remetente, destinatário e produto antes de abrir a criação. Isso evita interrupção por opções ausentes ou recursos indisponíveis." },
      { title: "O que fazer quando um cadastro não aparece nas opções do frete", detail: "Confirme se o registro existe, está ativo e pertence ao tenant atual; revise filtros e vínculos de disponibilidade. Se ainda faltar, informe o módulo e o nome/identificador do cadastro ao administrador." },
    ],
  },
  {
    id: "financeiro",
    title: "Financeiro",
    topic: "financeiro",
    icon: Landmark,
    summary: "Contas, pagamentos, recebimentos, DRE, caixa, recorrências e rentabilidade.",
    steps: [
      "Cadastre contas, categorias e centros de custo antes de lançar obrigações quando necessário.",
      "Registre cada título na área correta, informando fornecedor/cliente, valor, vencimento, competência e classificação.",
      "Na agenda, filtre e confira os títulos; ao pagar ou receber, informe a conta e a data efetivas e registre a baixa.",
      "Para relatórios, selecione o período e o critério correto (competência ou caixa) e confira a classificação dos lançamentos.",
    ],
    checks: [
      "Pagar um título altera o fluxo de caixa na data da baixa; DRE por competência considera a competência/classificação do lançamento.",
      "Despesas pagas pela JO continuam sendo despesas da empresa conforme categoria; abastecimento segue título a pagar e fora do caixa do motorista.",
      "Revise duplicidade, conta financeira e valor antes de confirmar baixas em lote.",
    ],
    guides: [
      { title: "Como navegar pelos módulos do Financeiro", detail: "Use o menu Financeiro para abrir pagar, receber, contas, DRE, fluxo, recorrências, salários e rentabilidade. Escolha a tela segundo a tarefa: registrar obrigação, baixar pagamento ou analisar resultado." },
      { title: "Como cadastrar contas bancárias", detail: "Abra Contas e inclua a conta usada nos recebimentos ou pagamentos, preenchendo a identificação solicitada. Confira se está ativa e selecione-a nas baixas correspondentes." },
      { title: "Como cadastrar categorias no plano de contas", detail: "Abra Plano de Contas e localize a categoria adequada antes de criar outra. Use a classificação aprovada pela empresa para que receitas, custos e despesas apareçam corretamente nos relatórios." },
      { title: "Como cadastrar centros de custo", detail: "Abra Centros de Custo e crie/edite a unidade de análise usada pela empresa. Atribua o centro correto aos lançamentos que precisam ser comparados por área ou operação." },
      { title: "Como lançar uma conta a pagar", detail: "Abra Contas a Pagar, crie o título e informe fornecedor, descrição, valor, vencimento, competência, categoria e conta/centro quando solicitado. Salve e confira o título na agenda." },
      { title: "Como consultar a agenda de pagamentos", detail: "Abra a agenda e filtre por vencimento, fornecedor, situação ou tipo. Confira valor e documento de origem antes de iniciar o pagamento." },
      { title: "Como selecionar e pagar vários títulos de uma vez", detail: "Marque somente os títulos que serão liquidados na mesma operação, confira o total e escolha conta/data da baixa. Revise cada item selecionado antes de confirmar o pagamento em lote." },
      { title: "Como registrar o pagamento de um título", detail: "Abra o título correto, use Pagar/Baixar e informe a data e conta de saída reais. Confirme o valor e, após salvar, verifique a situação e o lançamento no fluxo de caixa." },
      { title: "Como lançar e consultar contas a receber", detail: "Crie o título com cliente, descrição, valor, vencimento e competência corretos. Depois use os filtros de Contas a Receber para acompanhar vencidos, pendentes e recebidos." },
      { title: "Como registrar o recebimento de um título", detail: "Abra o recebível, informe a data e a conta em que o valor entrou e confirme a baixa. Confira a mudança de situação e o reflexo no fluxo de caixa." },
      { title: "Como cadastrar despesas recorrentes", detail: "Abra Recorrências e informe descrição, valor/regra, periodicidade, vencimento e classificação. Revise a data de início e os dados antes de ativar a geração dos títulos." },
      { title: "Como consultar e processar recorrências", detail: "Revise as recorrências ativas, a próxima data e os títulos gerados. Processe ou ajuste somente a ocorrência correta e confira se não foi criada duplicidade." },
      { title: "Como cadastrar e consultar salários", detail: "Use a área de Salários para lançar ou consultar valores conforme o período e colaborador. Restrinja o acesso aos perfis autorizados e confira competência e situação de pagamento." },
      { title: "Como entender a diferença entre competência e caixa", detail: "Competência organiza receitas e despesas pelo período a que pertencem; caixa mostra quando o dinheiro efetivamente entrou ou saiu. Escolha o critério do relatório antes de comparar períodos." },
      { title: "Como uma despesa paga pela JO aparece no financeiro e no DRE", detail: "A despesa deve ficar classificada na categoria correspondente e vinculada à obrigação financeira quando aplicável. A marcação de quem pagou identifica a origem do pagamento, mas não elimina o custo/despesa do DRE; confirme o tratamento pela classificação e período usados." },
      { title: "Como abastecimentos e despesas do motorista afetam o caixa", detail: "As despesas lançadas como caixa do motorista compõem o movimento do ciclo. O abastecimento é registrado separadamente e encaminhado como título a pagar, sem ser descontado desse caixa." },
      { title: "Como abastecimentos geram títulos a pagar", detail: "Depois que o abastecimento é registrado e integrado ao financeiro, confira o título na agenda de Contas a Pagar, com fornecedor, valor e vencimento. Corrija dados no registro de origem se o título estiver inconsistente." },
      { title: "Como consultar o fluxo de caixa", detail: "Abra Fluxo de Caixa, selecione o período e confira entradas e saídas conforme datas de baixa. Use os detalhes dos lançamentos para localizar origem, conta e situação de cada valor." },
      { title: "Como consultar o DRE", detail: "Abra DRE, escolha o período e o tipo de visão disponível e revise receitas, custos, despesas e resultado. Abra as categorias para conferir quais lançamentos compõem cada total." },
      { title: "Como filtrar e exportar o DRE por período", detail: "Defina as datas inicial e final e o critério oferecido pela tela; aplique os filtros antes de exportar. Confira o período impresso no arquivo e compare alguns lançamentos com a tela." },
      { title: "Como interpretar receitas, custos, despesas e resultado no DRE", detail: "Leia os grupos conforme o plano de contas e observe como custos e despesas reduzem o resultado. Se um item estiver em grupo inesperado, revise sua categoria e competência." },
      { title: "Como consultar a rentabilidade dos fretes", detail: "Abra Rentabilidade e escolha período e dimensões disponíveis, como frete, cliente ou veículo. Confira se receita e custos estão vinculados à mesma operação antes de comparar resultados." },
      { title: "Como conferir a classificação de uma despesa", detail: "Abra o lançamento e compare sua natureza com a categoria do plano de contas e o centro de custo. Ajuste a classificação conforme a regra financeira da empresa e revise o relatório afetado." },
      { title: "O que fazer quando um lançamento não aparece no DRE ou no fluxo de caixa", detail: "Confira período, competência/data de baixa, situação do título e filtros do relatório. Verifique também a categoria e se o lançamento pertence ao tenant correto; depois abra a origem para validar a integração." },
    ],
  },
  {
    id: "consultas",
    title: "Histórico, mapa e consultas",
    topic: "operacao",
    icon: MapPinned,
    summary: "Pesquisa de operações passadas e consulta da posição da frota.",
    steps: [
      "Abra Histórico ou Mapa conforme queira consultar uma viagem encerrada ou a posição atual.",
      "Aplique filtros por período, placa, motorista ou outros campos disponíveis.",
      "Abra o registro encontrado para conferir detalhes e eventos; no mapa, selecione o veículo para ver informações associadas.",
      "Compare os horários dos eventos com a tela operacional quando estiver investigando uma divergência.",
    ],
    checks: [
      "Localização depende de informação enviada pelo dispositivo e pode não ser instantânea.",
      "Histórico é a referência para revisar viagens encerradas e seus documentos associados.",
    ],
    guides: [
      { title: "Como consultar o histórico de fretes", detail: "Abra Históricos e pesquise pelo período, placa ou motorista. Selecione o frete para ver a sequência de eventos e os dados registrados durante a execução." },
      { title: "Como pesquisar fretes por placa, motorista, cliente ou período", detail: "Preencha um ou mais filtros disponíveis e aplique a pesquisa. Se não houver resultado, amplie o período e confira a grafia/número usado no cadastro." },
      { title: "Como consultar tiros longos concluídos", detail: "No histórico, localize a viagem pelo caminhão, motorista ou intervalo de datas. Abra o tiro longo para revisar os trechos, retorno e registros vinculados." },
      { title: "Como consultar a localização dos veículos no mapa", detail: "Abra Mapa e localize o marcador do veículo pela placa ou pelos filtros. Selecione-o para conferir a posição e os dados disponíveis da última atualização." },
      { title: "Como entender as informações exibidas no mapa", detail: "Considere a placa, posição e horário que aparecem para o veículo selecionado. A posição representa o último dado recebido, portanto compare o horário antes de tratá-la como localização atual." },
      { title: "O que fazer quando a localização ou o histórico não está atualizado", detail: "Atualize a tela e confira a última atualização do veículo ou do evento. Verifique se o motorista/app está enviando dados e informe placa, horário e tela caso a diferença continue." },
    ],
  },
  {
    id: "frotak-ia",
    title: "Frotak IA",
    topic: "suporte",
    icon: Bot,
    summary: "Consultas em linguagem natural sobre a operação e orientação de uso.",
    steps: [
      "Abra Frotak IA pelo menu e faça uma pergunta direta, indicando placa, pessoa, frete ou período quando souber.",
      "Para falar, abra o modo de voz e permita o microfone quando o navegador solicitar.",
      "Peça esclarecimento se a resposta vier incompleta e abra a tela de origem para confirmar decisões críticas.",
      "Não inclua senhas, tokens ou dados pessoais desnecessários na conversa.",
    ],
    checks: [
      "A IA consulta o contexto permitido para o tenant autenticado; confira se a empresa selecionada está correta.",
      "Use a tela oficial para confirmar pagamentos, documentos e alterações operacionais.",
    ],
    guides: [
      { title: "Como abrir e usar a Frotak IA", detail: "Selecione Frotak IA no menu lateral e escreva a pergunta no campo de conversa. Informe o que deseja saber e inclua placa, nome ou período para reduzir ambiguidades." },
      { title: "Como fazer perguntas sobre fretes e operações", detail: "Pergunte por situação, etapa, rota ou histórico e identifique a operação com placa, motorista ou código. Se houver mais de um resultado, refine com data ou destino." },
      { title: "Como consultar veículos, motoristas e status pela IA", detail: "Peça uma lista ou situação específica, por exemplo veículos em rota ou fretes de um motorista. Confira a data/hora e valide detalhes na Gestão de Frota quando for agir." },
      { title: "Como fazer perguntas sobre financeiro e abastecimentos", detail: "Indique o módulo, período, fornecedor, veículo ou tipo de lançamento. Para totais financeiros, confirme o critério de competência/caixa e valide o resultado na tela financeira." },
      { title: "Como conversar por voz com a Frotak IA", detail: "Ative o modo de voz, permita o uso do microfone e faça a pergunta com os dados necessários. Aguarde a resposta e confira se a transcrição entendeu placa, nome e período corretamente." },
      { title: "Como formular perguntas para obter respostas mais precisas", detail: "Faça uma pergunta por vez, delimite o intervalo e use identificadores únicos. Em vez de “como está?”, pergunte “qual o status do caminhão ABC1234 agora?”" },
      { title: "Como conferir uma resposta da IA na tela correspondente", detail: "Abra o módulo citado pela resposta e pesquise o mesmo registro. Use a tela para confirmar valores, status e documentos antes de tomar uma decisão." },
      { title: "O que a IA pode consultar e como respeita os dados de cada tenant", detail: "A IA responde sobre os dados e ferramentas disponibilizados para a empresa da sessão. Confirme o tenant no cabeçalho e não use respostas de outra empresa como referência para a operação atual." },
    ],
  },
  {
    id: "administracao-suporte",
    title: "Administração e resolução de problemas",
    topic: "suporte",
    icon: Users,
    summary: "Gestão de usuários, permissões e coleta de informações para solucionar falhas.",
    steps: [
      "Para usuários, abra Usuários e confira tenant, situação, perfil e permissões antes de salvar alterações.",
      "Para investigar uma falha, reproduza o problema uma vez e anote a tela, o registro e o horário.",
      "Compare Central, app motorista e histórico para saber em qual ponto os dados divergem.",
      "Envie ao suporte uma descrição objetiva, identificação do registro e captura sem expor senhas.",
    ],
    checks: [
      "Não compartilhe senha em captura de tela ou mensagem de suporte.",
      "Inclua placa/frete, etapa esperada, etapa exibida, horário e passos que reproduzem o problema.",
    ],
    guides: [
      { title: "Como criar e editar usuários", detail: "Abra Usuários, pesquise antes de cadastrar e informe os dados e perfil necessários. Salve e confirme que o acesso foi criado para a empresa correta." },
      { title: "Como atribuir perfil e permissões a um usuário", detail: "Edite o usuário e selecione o perfil autorizado para sua função. Revise os módulos liberados e peça ao usuário para sair e entrar novamente para confirmar o acesso." },
      { title: "Como preparar o acesso de um novo motorista", detail: "Confirme que o motorista está cadastrado, ativo e com telefone correto, depois configure a credencial inicial pelo fluxo administrativo vigente. Faça um teste de entrada e oriente a troca da senha temporária quando aplicável." },
      { title: "Como verificar se os dados estão atualizando em tempo real", detail: "Compare o registro na Central com o app e o horário do evento. Atualize as telas e verifique se há atualização recente; se persistir, capture os dois estados com seus horários." },
      { title: "Como identificar a origem de um status incorreto", detail: "Abra o detalhe e o histórico do frete, localize o último evento e compare com a ação feita no app. Isso ajuda a distinguir etapa não confirmada de atualização atrasada ou vínculo errado." },
      { title: "Como corrigir vínculos que impedem uma operação", detail: "Identifique o recurso ocupado e o frete que mantém o vínculo. Corrija ou encerre a operação de origem conforme o estado real; depois confirme que o recurso ficou disponível." },
      { title: "Como resolver falhas de envio de foto, documento ou comprovante", detail: "Confira conexão, permissões do aparelho, arquivo e tela de destino; tente novamente uma vez e espere a confirmação. Evite múltiplos envios enquanto o primeiro estiver processando." },
      { title: "Como resolver falhas de visualização ou download de CT-e", detail: "Confirme que o CT-e está anexado ao frete ativo e que o motorista abriu esse mesmo frete. Tente visualizar novamente; se falhar, registre dispositivo, arquivo e mensagem exibida." },
      { title: "Como agir quando a Gestão de Frota e o app motorista mostram etapas diferentes", detail: "Não mande novo comando até confirmar o que o motorista executou. Compare placa, frete, etapa e horário nos dois lados e peça à gestão para corrigir a origem da divergência." },
      { title: "Como reunir as informações necessárias para pedir suporte", detail: "Anote o tenant, módulo, identificação do registro, ação realizada, resultado esperado, resultado observado e horário. Inclua capturas úteis e o dispositivo/navegador quando o problema for visual ou de acesso." },
      { title: "Como relatar um problema com placa, motorista, frete, horário e captura de tela", detail: "Envie uma descrição curta com placa e código do frete, motorista, horário aproximado, passos para reproduzir e captura da tela. Oculte senhas e dados que não sejam necessários para a investigação." },
    ],
  },
];

function ManualPage() {
  const [query, setQuery] = useState("");
  const [activeTopic, setActiveTopic] = useState<"todos" | Topic>("todos");
  const normalizedQuery = normalize(query);

  const filteredGroups = useMemo(() => guideGroups.map((group) => {
    if (activeTopic !== "todos" && group.topic !== activeTopic) return null;
    const guides = group.guides.filter((guide) => {
      const content = normalize([guide.title, guide.detail, group.title, group.summary].join(" "));
      return !normalizedQuery || content.includes(normalizedQuery);
    });
    if (!guides.length) return null;
    return { ...group, guides };
  }).filter((group): group is GuideGroup => group !== null), [activeTopic, normalizedQuery]);

  const totalGuides = guideGroups.reduce((total, group) => total + group.guides.length, 0);
  const visibleGuides = filteredGroups.reduce((total, group) => total + group.guides.length, 0);

  return (
    <div className="h-screen overflow-y-auto scroll-smooth bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <a href="#topo" className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-32 shrink-0 items-center justify-center rounded-lg border border-border bg-white px-3">
              <img src="/frotak-login-logo-black.png" alt="Frotak" className="max-h-9 w-full object-contain" />
            </span>
            <span className="hidden text-xs font-bold text-muted-foreground sm:block">Suporte e manual</span>
          </a>
          <a href="#indice" className="text-sm font-bold text-primary hover:underline">Ir para os tópicos</a>
        </div>
      </header>

      <main id="topo" className="mx-auto max-w-7xl px-4 pb-16">
        <section className="grid gap-6 py-8 md:grid-cols-[1fr_auto] md:items-end md:py-10">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Central Frotak + app motorista</p>
            <h1 className="mt-2 max-w-3xl text-3xl font-black text-foreground md:text-4xl">Suporte para usar o sistema</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              Encontre uma tarefa pela busca ou escolha uma área. Abra um tópico para ver o passo a passo e os pontos de conferência.
            </p>
          </div>
          <div className="flex gap-6 border-l border-border pl-5">
            <div><p className="text-2xl font-black text-foreground">{totalGuides}</p><p className="text-xs font-semibold text-muted-foreground">guias</p></div>
            <div><p className="text-2xl font-black text-foreground">{guideGroups.length}</p><p className="text-xs font-semibold text-muted-foreground">áreas</p></div>
          </div>
        </section>

        <section id="indice" className="scroll-mt-20 border-y border-border py-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar frete, DRE, CT-e, motorista..."
                aria-label="Buscar no manual"
                className="h-11 w-full rounded-lg border border-border bg-card pl-10 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca" className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><X className="size-4" /></button>}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
              {topics.map((topic) => <button key={topic.key} type="button" onClick={() => setActiveTopic(topic.key)} className={`whitespace-nowrap rounded-md border px-3 py-2 text-xs font-bold transition ${activeTopic === topic.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>{topic.label}</button>)}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">{visibleGuides} tópico(s) exibido(s)</p>
        </section>

        <div className="mt-5 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <nav className="sticky top-24 border-l border-border pl-3" aria-label="Áreas do manual">
              <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Áreas</p>
              <div className="grid gap-1">
                {guideGroups.map((group) => <a key={group.id} href={`#${group.id}`} className="rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">{group.title}</a>)}
              </div>
            </nav>
          </aside>

          <div className="min-w-0 divide-y divide-border">
            {filteredGroups.length ? filteredGroups.map((group) => <GuideGroupSection key={group.id} group={group} />) : (
              <div className="py-16 text-center">
                <Search className="mx-auto size-8 text-muted-foreground" />
                <h2 className="mt-3 font-bold">Nenhum tópico encontrado</h2>
                <p className="mt-1 text-sm text-muted-foreground">Tente outra palavra ou selecione “Todos”.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function GuideGroupSection({ group }: { group: GuideGroup }) {
  const Icon = group.icon;
  return (
    <section id={group.id} className="scroll-mt-24 py-6 first:pt-3">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4.5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-lg font-extrabold">{group.title}</h2>
            <span className="text-xs font-semibold text-muted-foreground">{group.guides.length} tópicos</span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{group.summary}</p>
        </div>
      </div>
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {group.guides.map((guide) => <GuideAccordion key={guide.title} guide={guide} group={group} />)}
      </div>
    </section>
  );
}

function GuideAccordion({ guide, group }: { guide: Guide; group: GuideGroup }) {
  return (
    <details className="group/guide">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 marker:hidden hover:bg-muted/55 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">{String(group.guides.indexOf(guide) + 1).padStart(2, "0")}</span>
          <span className="text-sm font-bold leading-5 text-foreground">{guide.title}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/guide:rotate-180" />
      </summary>
      <div className="border-t border-border bg-muted/20 px-4 py-4 sm:px-9">
        <p className="max-w-4xl text-sm leading-6 text-foreground">{guide.detail}</p>
        <div className="mt-4 grid gap-5 md:grid-cols-[1fr_0.72fr]">
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-primary"><ClipboardList className="size-4" />Passo a passo</h3>
            <ol className="space-y-2">
              {group.steps.map((step, index) => <li key={step} className="flex gap-2.5 text-xs leading-5 text-muted-foreground"><span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-extrabold text-primary">{index + 1}</span><span>{step}</span></li>)}
            </ol>
          </div>
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-primary"><CheckCircle2 className="size-4" />Pontos de conferência</h3>
            <ul className="space-y-2">
              {group.checks.map((check) => <li key={check} className="flex gap-2 text-xs leading-5 text-muted-foreground"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" /><span>{check}</span></li>)}
            </ul>
          </div>
        </div>
      </div>
    </details>
  );
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const supportSearchStopWords = new Set([
  "a",
  "as",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "eu",
  "faco",
  "fazer",
  "me",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "para",
  "por",
  "que",
  "um",
  "uma",
]);

// Shared with the server-side support tool used by text and voice conversations.
// eslint-disable-next-line react-refresh/only-export-components
export function searchManualSupport(query: string, requestedLimit = 6) {
  const normalizedQuery = normalize(query);
  const tokens = Array.from(
    new Set(
      normalizedQuery
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 1 && !supportSearchStopWords.has(token)),
    ),
  );
  const limit = Math.max(1, Math.min(10, Math.trunc(requestedLimit) || 6));

  const results = guideGroups.flatMap((group) =>
    group.guides.map((guide) => {
      const title = normalize(guide.title);
      const detail = normalize(guide.detail);
      const groupText = normalize(`${group.title} ${group.summary} ${group.topic}`);
      const operationalText = normalize(`${group.steps.join(" ")} ${group.checks.join(" ")}`);
      let score = normalizedQuery && title.includes(normalizedQuery) ? 30 : 0;
      if (normalizedQuery && detail.includes(normalizedQuery)) score += 14;
      if (normalizedQuery && groupText.includes(normalizedQuery)) score += 8;
      for (const token of tokens) {
        if (title.includes(token)) score += 7;
        if (detail.includes(token)) score += 3;
        if (groupText.includes(token)) score += 2;
        if (operationalText.includes(token)) score += 1;
      }
      return {
        score,
        area_id: group.id,
        area: group.title,
        topico: group.topic,
        resumo: group.summary,
        titulo: guide.title,
        orientacao: guide.detail,
        fluxo_recomendado: group.steps,
        pontos_de_conferencia: group.checks,
      };
    }),
  )
    .filter((result) => !normalizedQuery || result.score > 0)
    .sort((a, b) => b.score - a.score || a.titulo.localeCompare(b.titulo, "pt-BR"))
    .slice(0, limit);

  return {
    fonte: "Manual oficial de Suporte da Frotak",
    consulta: query,
    resultados: results,
    encontrado: results.length > 0,
  };
}
