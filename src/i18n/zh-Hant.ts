import type { Messages } from './index'

export const zhHant = {
  app: {
    title: 'Dashmark',
    about: '關於 Dashmark',
    createdBy: '建立者',
    copyright: '版權所有 © 2026 edmogeor'
  },
  meta: {
    description: '一個輕量級儀表板，提供指向 Docker 服務的連結。'
  },
  category: {
    all: '所有類別',
    uncategorised: '未分類'
  },
  greeting: {
    morning: '早安',
    afternoon: '午安',
    evening: '晚安'
  },
  search: {
    placeholder: '搜尋',
    clear: '清除搜尋'
  },
  card: {
    description: '描述',
    resourceUsage: '指標',
    cpu: 'CPU',
    memory: '記憶體',
    received: '網路接收',
    sent: '網路傳送',
    waitingForNetwork: '等待下次重新整理',
    unavailable: '無法使用',
    loading: (label: string) => `正在載入 ${label}`,
    metricUnavailable: (title: string) => `${title} 指標無法使用`
  },
  dashboard: {
    noServices: '找不到服務',
    moreGroups: (_: number, formattedCount: string) => `顯示另外 ${formattedCount} 個群組`
  },
  status: {
    loading: '正在載入狀態',
    created: '已建立',
    restarting: '正在重新啟動',
    running: '執行中',
    removing: '正在移除',
    paused: '已暫停',
    exited: '已結束',
    dead: '已停止',
    healthy: '健康',
    unhealthy: '不健康',
    starting: '正在啟動'
  },
  theme: {
    toggle: '切換主題',
    switchToSystem: '切換至系統主題',
    switchToLight: '切換至淺色模式',
    switchToDark: '切換至深色模式'
  },
  common: {
    close: '關閉',
    true: '是',
    false: '否'
  },
  about: {
    latestStableVersion: '最新穩定版本',
    installedVersion: '已安裝版本',
    checkingForUpdates: '正在檢查更新',
    updateAvailable: (version: string) => `有可用更新：${version}`,
    upToDate: '目前已是最新版本。'
  },
  metrics: {
    title: '指標',
    networkUsage: '網路使用量',
    viewHistory: (label: string) => `檢視 ${label} 歷史記錄`,
    chart: (label: string) => `${label} 圖表`,
    liveDetails: (label: string) => `${label} 即時詳細資料`,
    collectionFailed: '指標資料無法使用。',
    configurationInvalid: '指標設定無效。'
  },
  time: {
    today: '今天',
    yesterday: '昨天',
    dateTime: (date: string, time: string) => `${date}，${time}`,
    ranges: {
      day: '24 小時',
      week: '7 天',
      month: '30 天'
    }
  },
  uptime: {
    noChecks: '沒有記錄到檢查',
    successfulChecks: (_: number, formattedCount: string) => `${formattedCount} 次成功檢查`,
    failedChecks: (_: number, formattedCount: string) => `${formattedCount} 次失敗檢查`,
    slowestResponse: (value: string) => `最慢回應 ${value}`,
    bucketSummary: (time: string, checks: string, responseTime?: string) => `${time}：${checks}${responseTime ? `，${responseTime}` : ''}`,
    up: '正常',
    down: '故障',
    partial: '部分正常',
    noData: '無資料',
    successful: '成功',
    failed: '失敗',
    slowest: '最慢',
    history: '運作時間歷史',
    period: '運作時間期間',
    availability: '所選期間的可用性'
  },
  errors: {
    unableToLoadServices: '無法載入服務',
    statusUpdateFailed: '狀態更新失敗：',
    serverUnreachable: '無法連線至伺服器。',
    liveUpdatesUnavailable: '即時更新無法使用。資料可能已過期。',
    dockerUnreachable: '無法連線至 Docker。請檢查 DOCKER_HOSTS 和 Docker Socket 掛載。',
    configInvalid: '設定檔無效。',
    missingGroupsHeader: '已啟用存取群組，但未從反向 Proxy 收到群組標頭。',
    expectedHeader: (header: string) => `預期的標頭：${header}`
  }
} satisfies Messages
