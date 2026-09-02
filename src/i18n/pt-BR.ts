import type { Messages } from './index'

export const ptBR = {
  app: {
    title: 'Dashmark',
    about: 'Sobre o Dashmark',
    createdBy: 'Criado por',
    copyright: 'Direitos autorais © 2026 edmogeor'
  },
  meta: {
    description: 'Um painel leve com links para seus serviços Docker.'
  },
  category: {
    all: 'Todas as categorias',
    uncategorised: 'Sem categoria'
  },
  greeting: {
    morning: 'Bom dia',
    afternoon: 'Boa tarde',
    evening: 'Boa noite'
  },
  search: {
    placeholder: 'Pesquisar',
    clear: 'Limpar pesquisa'
  },
  card: {
    description: 'Descrição',
    resourceUsage: 'Métricas',
    cpu: 'CPU',
    memory: 'Memória',
    received: 'Rede recebida',
    sent: 'Rede enviada',
    waitingForNetwork: 'Aguardando a próxima atualização',
    unavailable: 'Indisponível',
    loading: (label: string) => `Carregando ${label}`,
    metricUnavailable: (title: string) => `Métrica de ${title} indisponível`
  },
  dashboard: {
    noServices: 'Nenhum serviço encontrado',
    moreGroups: (count: number, formattedCount: string) => `Mostrar mais ${formattedCount} grupo${count === 1 ? '' : 's'}`
  },
  status: {
    loading: 'Carregando status',
    created: 'criado',
    restarting: 'reiniciando',
    running: 'em execução',
    removing: 'removendo',
    paused: 'pausado',
    exited: 'encerrado',
    dead: 'inativo',
    healthy: 'saudável',
    unhealthy: 'não saudável',
    starting: 'iniciando'
  },
  theme: {
    toggle: 'Alternar tema',
    switchToSystem: 'Usar tema do sistema',
    switchToLight: 'Usar modo claro',
    switchToDark: 'Usar modo escuro'
  },
  common: {
    close: 'Fechar',
    true: 'Verdadeiro',
    false: 'Falso'
  },
  about: {
    latestStableVersion: 'Versão estável mais recente',
    installedVersion: 'Versão instalada',
    checkingForUpdates: 'Verificando atualizações',
    updateAvailable: (version: string) => `Atualização disponível: ${version}`,
    upToDate: 'Você está atualizado.'
  },
  metrics: {
    title: 'Métricas',
    networkUsage: 'Uso da rede',
    viewHistory: (label: string) => `Ver histórico de ${label}`,
    chart: (label: string) => `Gráfico de ${label}`,
    liveDetails: (label: string) => `Detalhes ao vivo de ${label}`,
    collectionFailed: 'Os dados da métrica não estão disponíveis.',
    configurationInvalid: 'A configuração da métrica é inválida.'
  },
  time: {
    today: 'Hoje',
    yesterday: 'Ontem',
    dateTime: (date: string, time: string) => `${date}, ${time}`,
    ranges: {
      day: '24 h',
      week: '7 dias',
      month: '30 dias'
    }
  },
  uptime: {
    noChecks: 'Nenhuma verificação foi registrada',
    successfulChecks: (count: number, formattedCount: string) => `${formattedCount} verificação${count === 1 ? '' : 'ões'} bem-sucedida${count === 1 ? '' : 's'}`,
    failedChecks: (count: number, formattedCount: string) => `${formattedCount} verificação${count === 1 ? '' : 'ões'} com falha`,
    slowestResponse: (value: string) => `resposta mais lenta: ${value}`,
    bucketSummary: (time: string, checks: string, responseTime?: string) => `${time}: ${checks}${responseTime ? `, ${responseTime}` : ''}`,
    up: 'Disponível',
    down: 'Indisponível',
    partial: 'Parcial',
    noData: 'Sem dados',
    successful: 'Bem-sucedidas',
    failed: 'Com falha',
    slowest: 'Mais lenta',
    history: 'Histórico de disponibilidade',
    period: 'Período de disponibilidade',
    availability: 'disponibilidade no período selecionado'
  },
  errors: {
    unableToLoadServices: 'Não foi possível carregar os serviços',
    statusUpdateFailed: 'Falha ao atualizar o status:',
    serverUnreachable: 'Não foi possível acessar o servidor.',
    liveUpdatesUnavailable: 'As atualizações ao vivo não estão disponíveis. Os dados podem estar desatualizados.',
    dockerUnreachable: 'O Docker está inacessível. Verifique DOCKER_HOSTS e a montagem do soquete do Docker.',
    configInvalid: 'O arquivo de configuração é inválido.',
    missingGroupsHeader: 'Os grupos de acesso estão ativados, mas o cabeçalho de grupos não foi recebido do proxy reverso.',
    expectedHeader: (header: string) => `Cabeçalho esperado: ${header}`
  }
} satisfies Messages
