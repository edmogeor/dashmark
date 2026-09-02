import type { Messages } from './index'

export const ru = {
  app: {
    title: 'Dashmark',
    about: 'О Dashmark',
    createdBy: 'Создано',
    copyright: 'Авторские права © 2026 edmogeor'
  },
  meta: {
    description: 'Легкая панель со ссылками на ваши службы Docker.'
  },
  category: {
    all: 'Все категории',
    uncategorised: 'Без категории'
  },
  greeting: {
    morning: 'Доброе утро',
    afternoon: 'Добрый день',
    evening: 'Добрый вечер'
  },
  search: {
    placeholder: 'Поиск',
    clear: 'Очистить поиск'
  },
  card: {
    description: 'Описание',
    resourceUsage: 'Метрики',
    cpu: 'ЦП',
    memory: 'Память',
    received: 'Входящая сеть',
    sent: 'Исходящая сеть',
    waitingForNetwork: 'Ожидание следующего обновления',
    unavailable: 'Недоступно',
    loading: (label: string) => `Загрузка: ${label}`,
    metricUnavailable: (title: string) => `Метрика ${title} недоступна`
  },
  dashboard: {
    noServices: 'Службы не найдены',
    moreGroups: (count: number, formattedCount: string) => `Показать еще ${formattedCount} ${count === 1 ? 'группу' : 'группы'}`
  },
  status: {
    loading: 'Загрузка статуса',
    created: 'создан',
    restarting: 'перезапускается',
    running: 'работает',
    removing: 'удаляется',
    paused: 'приостановлен',
    exited: 'остановлен',
    dead: 'неактивен',
    healthy: 'исправен',
    unhealthy: 'неисправен',
    starting: 'запускается'
  },
  theme: {
    toggle: 'Сменить тему',
    switchToSystem: 'Использовать системную тему',
    switchToLight: 'Использовать светлую тему',
    switchToDark: 'Использовать темную тему'
  },
  common: {
    close: 'Закрыть',
    true: 'Да',
    false: 'Нет'
  },
  about: {
    latestStableVersion: 'Последняя стабильная версия',
    installedVersion: 'Установленная версия',
    checkingForUpdates: 'Проверка обновлений',
    updateAvailable: (version: string) => `Доступно обновление: ${version}`,
    upToDate: 'У вас последняя версия.'
  },
  metrics: {
    title: 'Метрики',
    networkUsage: 'Использование сети',
    viewHistory: (label: string) => `История ${label}`,
    chart: (label: string) => `График ${label}`,
    liveDetails: (label: string) => `Текущие данные ${label}`,
    collectionFailed: 'Данные метрики недоступны.',
    configurationInvalid: 'Конфигурация метрики недействительна.'
  },
  time: {
    today: 'Сегодня',
    yesterday: 'Вчера',
    dateTime: (date: string, time: string) => `${date}, ${time}`,
    ranges: {
      day: '24 ч',
      week: '7 дн.',
      month: '30 дн.'
    }
  },
  uptime: {
    noChecks: 'Проверки не записаны',
    successfulChecks: (count: number, formattedCount: string) => `${formattedCount} ${count === 1 ? 'успешная проверка' : 'успешных проверок'}`,
    failedChecks: (count: number, formattedCount: string) => `${formattedCount} ${count === 1 ? 'неуспешная проверка' : 'неуспешных проверок'}`,
    slowestResponse: (value: string) => `самый медленный ответ: ${value}`,
    bucketSummary: (time: string, checks: string, responseTime?: string) => `${time}: ${checks}${responseTime ? `, ${responseTime}` : ''}`,
    up: 'Доступен',
    down: 'Недоступен',
    partial: 'Частично',
    noData: 'Нет данных',
    successful: 'Успешные',
    failed: 'Неуспешные',
    slowest: 'Самые медленные',
    history: 'История доступности',
    period: 'Период доступности',
    availability: 'доступность за выбранный период'
  },
  errors: {
    unableToLoadServices: 'Не удалось загрузить службы',
    statusUpdateFailed: 'Не удалось обновить статус:',
    serverUnreachable: 'Не удалось связаться с сервером.',
    liveUpdatesUnavailable: 'Обновления в реальном времени недоступны. Данные могут быть устаревшими.',
    dockerUnreachable: 'Docker недоступен. Проверьте DOCKER_HOSTS и монтирование сокета Docker.',
    configInvalid: 'Файл конфигурации недействителен.',
    missingGroupsHeader: 'Группы доступа включены, но заголовок групп не получен от обратного прокси-сервера.',
    expectedHeader: (header: string) => `Ожидаемый заголовок: ${header}`
  }
} satisfies Messages
