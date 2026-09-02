import type { Messages } from './index'

export const uk = {
  app: {
    title: 'Dashmark',
    about: 'Про Dashmark',
    createdBy: 'Створено',
    copyright: 'Авторські права © 2026 edmogeor'
  },
  meta: {
    description: 'Легка панель посилань на ваші служби Docker.'
  },
  category: {
    all: 'Усі категорії',
    uncategorised: 'Без категорії'
  },
  greeting: {
    morning: 'Доброго ранку',
    afternoon: 'Добрий день',
    evening: 'Добрий вечір'
  },
  search: {
    placeholder: 'Пошук',
    clear: 'Очистити пошук'
  },
  card: {
    description: 'Опис',
    resourceUsage: 'Метрики',
    cpu: 'ЦП',
    memory: 'Пам’ять',
    received: 'Вхідна мережа',
    sent: 'Вихідна мережа',
    waitingForNetwork: 'Очікування наступного оновлення',
    unavailable: 'Недоступно',
    loading: (label: string) => `Завантаження: ${label}`,
    metricUnavailable: (title: string) => `Метрика ${title} недоступна`
  },
  dashboard: {
    noServices: 'Служб не знайдено',
    moreGroups: (count: number, formattedCount: string) => `Показати ще ${formattedCount} ${count === 1 ? 'групу' : 'групи'}`
  },
  status: {
    loading: 'Завантаження статусу',
    created: 'створено',
    restarting: 'перезапуск',
    running: 'працює',
    removing: 'видалення',
    paused: 'призупинено',
    exited: 'завершено',
    dead: 'неактивний',
    healthy: 'справний',
    unhealthy: 'несправний',
    starting: 'запуск'
  },
  theme: {
    toggle: 'Змінити тему',
    switchToSystem: 'Використати системну тему',
    switchToLight: 'Використати світлу тему',
    switchToDark: 'Використати темну тему'
  },
  common: {
    close: 'Закрити',
    true: 'Так',
    false: 'Ні'
  },
  about: {
    latestStableVersion: 'Остання стабільна версія',
    installedVersion: 'Встановлена версія',
    checkingForUpdates: 'Перевірка оновлень',
    updateAvailable: (version: string) => `Доступне оновлення: ${version}`,
    upToDate: 'У вас остання версія.'
  },
  metrics: {
    title: 'Метрики',
    networkUsage: 'Використання мережі',
    viewHistory: (label: string) => `Переглянути історію ${label}`,
    chart: (label: string) => `Діаграма ${label}`,
    liveDetails: (label: string) => `Поточні дані ${label}`,
    collectionFailed: 'Дані метрики недоступні.',
    configurationInvalid: 'Конфігурація метрики недійсна.'
  },
  time: {
    today: 'Сьогодні',
    yesterday: 'Учора',
    dateTime: (date: string, time: string) => `${date}, ${time}`,
    ranges: {
      day: '24 год',
      week: '7 дн.',
      month: '30 дн.'
    }
  },
  uptime: {
    noChecks: 'Перевірок не зареєстровано',
    successfulChecks: (count: number, formattedCount: string) => `${formattedCount} ${count === 1 ? 'успішна перевірка' : 'успішних перевірок'}`,
    failedChecks: (count: number, formattedCount: string) => `${formattedCount} ${count === 1 ? 'невдала перевірка' : 'невдалих перевірок'}`,
    slowestResponse: (value: string) => `найповільніша відповідь: ${value}`,
    bucketSummary: (time: string, checks: string, responseTime?: string) => `${time}: ${checks}${responseTime ? `, ${responseTime}` : ''}`,
    up: 'Доступний',
    down: 'Недоступний',
    partial: 'Частково',
    noData: 'Немає даних',
    successful: 'Успішні',
    failed: 'Невдалі',
    slowest: 'Найповільніші',
    history: 'Історія доступності',
    period: 'Період доступності',
    availability: 'доступність за вибраний період'
  },
  errors: {
    unableToLoadServices: 'Не вдалося завантажити служби',
    statusUpdateFailed: 'Не вдалося оновити статус:',
    serverUnreachable: 'Не вдалося зв’язатися з сервером.',
    liveUpdatesUnavailable: 'Оновлення в реальному часі недоступні. Дані можуть бути застарілими.',
    dockerUnreachable: 'Docker недоступний. Перевірте DOCKER_HOSTS і монтування сокета Docker.',
    configInvalid: 'Файл конфігурації недійсний.',
    missingGroupsHeader: 'Групи доступу ввімкнено, але заголовок груп не отримано від зворотного проксі-сервера.',
    expectedHeader: (header: string) => `Очікуваний заголовок: ${header}`
  }
} satisfies Messages
