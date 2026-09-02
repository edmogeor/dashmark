import type { Messages } from './index'

export const es = {
  app: {
    title: 'Dashmark',
    about: 'Acerca de Dashmark',
    createdBy: 'Creado por',
    copyright: 'Copyright © 2026 edmogeor'
  },
  meta: {
    description: 'Un panel ligero de enlaces a tus servicios de Docker.'
  },
  category: {
    all: 'Todas las categorías',
    uncategorised: 'Sin categoría'
  },
  greeting: {
    morning: 'Buenos días',
    afternoon: 'Buenas tardes',
    evening: 'Buenas noches'
  },
  search: {
    placeholder: 'Buscar',
    clear: 'Borrar búsqueda'
  },
  card: {
    description: 'Descripción',
    resourceUsage: 'Métricas',
    cpu: 'CPU',
    memory: 'Memoria',
    received: 'Red entrante',
    sent: 'Red saliente',
    waitingForNetwork: 'Esperando la próxima actualización',
    unavailable: 'No disponible',
    loading: (label: string) => `Cargando ${label}`,
    metricUnavailable: (title: string) => `Métrica de ${title} no disponible`
  },
  dashboard: {
    noServices: 'No se encontraron servicios',
    moreGroups: (count: number, formattedCount: string) => `Mostrar ${formattedCount} grupo${count === 1 ? '' : 's'} más`
  },
  status: {
    loading: 'Cargando estado',
    created: 'creado',
    restarting: 'reiniciando',
    running: 'en ejecución',
    removing: 'eliminando',
    paused: 'en pausa',
    exited: 'detenido',
    dead: 'inactivo',
    healthy: 'correcto',
    unhealthy: 'incorrecto',
    starting: 'iniciando'
  },
  theme: {
    toggle: 'Cambiar tema',
    switchToSystem: 'Usar tema del sistema',
    switchToLight: 'Usar modo claro',
    switchToDark: 'Usar modo oscuro'
  },
  common: {
    close: 'Cerrar',
    true: 'Verdadero',
    false: 'Falso'
  },
  about: {
    latestStableVersion: 'Última versión estable',
    installedVersion: 'Versión instalada',
    checkingForUpdates: 'Buscando actualizaciones',
    updateAvailable: (version: string) => `Actualización disponible: ${version}`,
    upToDate: 'Está actualizado.'
  },
  metrics: {
    title: 'Métricas',
    networkUsage: 'Uso de red',
    viewHistory: (label: string) => `Ver historial de ${label}`,
    chart: (label: string) => `Gráfico de ${label}`,
    liveDetails: (label: string) => `Detalles en vivo de ${label}`,
    collectionFailed: 'Los datos de métricas no están disponibles.',
    configurationInvalid: 'La configuración de las métricas no es válida.'
  },
  time: {
    today: 'Hoy',
    yesterday: 'Ayer',
    dateTime: (date: string, time: string) => `${date}, ${time}`,
    ranges: {
      day: '24 h',
      week: '7 d',
      month: '30 d'
    }
  },
  uptime: {
    noChecks: 'No se registraron comprobaciones',
    successfulChecks: (count: number, formattedCount: string) => `${formattedCount} comprobación${count === 1 ? '' : 'es'} correcta${count === 1 ? '' : 's'}`,
    failedChecks: (count: number, formattedCount: string) => `${formattedCount} comprobación${count === 1 ? '' : 'es'} fallida${count === 1 ? '' : 's'}`,
    slowestResponse: (value: string) => `respuesta más lenta: ${value}`,
    bucketSummary: (time: string, checks: string, responseTime?: string) => `${time}: ${checks}${responseTime ? `, ${responseTime}` : ''}`,
    up: 'Activo',
    down: 'Caído',
    partial: 'Parcial',
    noData: 'Sin datos',
    successful: 'Correctas',
    failed: 'Fallidas',
    slowest: 'Más lenta',
    history: 'Historial de disponibilidad',
    period: 'Periodo de disponibilidad',
    availability: 'disponibilidad durante el periodo seleccionado'
  },
  errors: {
    unableToLoadServices: 'No se pudieron cargar los servicios',
    statusUpdateFailed: 'Error al actualizar el estado:',
    serverUnreachable: 'No se pudo conectar con el servidor.',
    liveUpdatesUnavailable: 'Las actualizaciones en vivo no están disponibles. Los datos pueden estar desactualizados.',
    dockerUnreachable: 'No se puede acceder a Docker. Comprueba DOCKER_HOSTS y el montaje del socket de Docker.',
    configInvalid: 'El archivo de configuración no es válido.',
    missingGroupsHeader: 'Los grupos de acceso están habilitados, pero no se recibió el encabezado de grupos desde el proxy inverso.',
    expectedHeader: (header: string) => `Encabezado esperado: ${header}`
  }
} satisfies Messages
