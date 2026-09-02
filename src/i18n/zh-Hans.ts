import type { Messages } from './index'

export const zhHans = {
  app: {
    title: 'Dashmark',
    about: '关于 Dashmark',
    createdBy: '创建者',
    copyright: '版权所有 © 2026 edmogeor'
  },
  meta: {
    description: '一个轻量级仪表板，提供指向 Docker 服务的链接。'
  },
  category: {
    all: '所有类别',
    uncategorised: '未分类'
  },
  greeting: {
    morning: '早上好',
    afternoon: '下午好',
    evening: '晚上好'
  },
  search: {
    placeholder: '搜索',
    clear: '清除搜索'
  },
  card: {
    description: '描述',
    resourceUsage: '指标',
    cpu: 'CPU',
    memory: '内存',
    received: '网络接收',
    sent: '网络发送',
    waitingForNetwork: '等待下次刷新',
    unavailable: '不可用',
    loading: (label: string) => `正在加载 ${label}`,
    metricUnavailable: (title: string) => `${title} 指标不可用`
  },
  dashboard: {
    noServices: '未找到服务',
    moreGroups: (_: number, formattedCount: string) => `显示另外 ${formattedCount} 个组`
  },
  status: {
    loading: '正在加载状态',
    created: '已创建',
    restarting: '正在重启',
    running: '运行中',
    removing: '正在删除',
    paused: '已暂停',
    exited: '已退出',
    dead: '已停止',
    healthy: '健康',
    unhealthy: '不健康',
    starting: '正在启动'
  },
  theme: {
    toggle: '切换主题',
    switchToSystem: '切换到系统主题',
    switchToLight: '切换到浅色模式',
    switchToDark: '切换到深色模式'
  },
  common: {
    close: '关闭',
    true: '是',
    false: '否'
  },
  about: {
    latestStableVersion: '最新稳定版本',
    installedVersion: '已安装版本',
    checkingForUpdates: '正在检查更新',
    updateAvailable: (version: string) => `有可用更新：${version}`,
    upToDate: '当前已是最新版本。'
  },
  metrics: {
    title: '指标',
    networkUsage: '网络使用情况',
    viewHistory: (label: string) => `查看 ${label} 历史记录`,
    chart: (label: string) => `${label} 图表`,
    liveDetails: (label: string) => `${label} 实时详情`,
    collectionFailed: '指标数据不可用。',
    configurationInvalid: '指标配置无效。'
  },
  time: {
    today: '今天',
    yesterday: '昨天',
    dateTime: (date: string, time: string) => `${date}，${time}`,
    ranges: {
      day: '24小时',
      week: '7天',
      month: '30天'
    }
  },
  uptime: {
    noChecks: '没有记录到检查',
    successfulChecks: (_: number, formattedCount: string) => `${formattedCount} 次成功检查`,
    failedChecks: (_: number, formattedCount: string) => `${formattedCount} 次失败检查`,
    slowestResponse: (value: string) => `最慢响应 ${value}`,
    bucketSummary: (time: string, checks: string, responseTime?: string) => `${time}：${checks}${responseTime ? `，${responseTime}` : ''}`,
    up: '正常',
    down: '故障',
    partial: '部分正常',
    noData: '无数据',
    successful: '成功',
    failed: '失败',
    slowest: '最慢',
    history: '运行时间历史',
    period: '运行时间周期',
    availability: '所选周期的可用性'
  },
  errors: {
    unableToLoadServices: '无法加载服务',
    statusUpdateFailed: '状态更新失败：',
    serverUnreachable: '无法连接到服务器。',
    liveUpdatesUnavailable: '实时更新不可用。数据可能已过期。',
    dockerUnreachable: '无法连接到 Docker。请检查 DOCKER_HOSTS 和 Docker 套接字挂载。',
    configInvalid: '配置文件无效。',
    missingGroupsHeader: '已启用访问组，但未从反向代理收到组请求头。',
    expectedHeader: (header: string) => `预期的请求头：${header}`
  }
} satisfies Messages
