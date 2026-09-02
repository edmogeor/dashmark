import type { Messages } from './index'

export const ja = {
  app: {
    title: 'Dashmark',
    about: 'Dashmark について',
    createdBy: '作成者',
    copyright: '著作権 © 2026 edmogeor'
  },
  meta: {
    description: 'Docker サービスへのリンクをまとめた軽量なダッシュボード。'
  },
  category: {
    all: 'すべてのカテゴリ',
    uncategorised: '未分類'
  },
  greeting: {
    morning: 'おはようございます',
    afternoon: 'こんにちは',
    evening: 'こんばんは'
  },
  search: {
    placeholder: '検索',
    clear: '検索をクリア'
  },
  card: {
    description: '説明',
    resourceUsage: 'メトリクス',
    cpu: 'CPU',
    memory: 'メモリ',
    received: '受信ネットワーク',
    sent: '送信ネットワーク',
    waitingForNetwork: '次の更新を待機中',
    unavailable: '利用不可',
    loading: (label: string) => `${label} を読み込み中`,
    metricUnavailable: (title: string) => `${title} のメトリクスは利用できません`
  },
  dashboard: {
    noServices: 'サービスが見つかりません',
    moreGroups: (_: number, formattedCount: string) => `さらに ${formattedCount} グループを表示`
  },
  status: {
    loading: 'ステータスを読み込み中',
    created: '作成済み',
    restarting: '再起動中',
    running: '実行中',
    removing: '削除中',
    paused: '一時停止中',
    exited: '終了',
    dead: '停止',
    healthy: '正常',
    unhealthy: '異常',
    starting: '起動中'
  },
  theme: {
    toggle: 'テーマを切り替え',
    switchToSystem: 'システムテーマに切り替え',
    switchToLight: 'ライトモードに切り替え',
    switchToDark: 'ダークモードに切り替え'
  },
  common: {
    close: '閉じる',
    true: '真',
    false: '偽'
  },
  about: {
    latestStableVersion: '最新の安定版',
    installedVersion: 'インストール済みのバージョン',
    checkingForUpdates: '更新を確認中',
    updateAvailable: (version: string) => `更新があります: ${version}`,
    upToDate: '最新の状態です。'
  },
  metrics: {
    title: 'メトリクス',
    networkUsage: 'ネットワーク使用量',
    viewHistory: (label: string) => `${label} の履歴を表示`,
    chart: (label: string) => `${label} グラフ`,
    liveDetails: (label: string) => `${label} のライブ詳細`,
    collectionFailed: 'メトリクスデータを利用できません。',
    configurationInvalid: 'メトリクス設定が無効です。'
  },
  time: {
    today: '今日',
    yesterday: '昨日',
    dateTime: (date: string, time: string) => `${date}、${time}`,
    ranges: {
      day: '24時間',
      week: '7日',
      month: '30日'
    }
  },
  uptime: {
    noChecks: 'チェックは記録されていません',
    successfulChecks: (_: number, formattedCount: string) => `${formattedCount} 回の成功したチェック`,
    failedChecks: (_: number, formattedCount: string) => `${formattedCount} 回の失敗したチェック`,
    slowestResponse: (value: string) => `最も遅い応答 ${value}`,
    bucketSummary: (time: string, checks: string, responseTime?: string) => `${time}: ${checks}${responseTime ? `、${responseTime}` : ''}`,
    up: '稼働中',
    down: '停止中',
    partial: '一部稼働',
    noData: 'データなし',
    successful: '成功',
    failed: '失敗',
    slowest: '最も遅い',
    history: '稼働時間の履歴',
    period: '稼働時間の期間',
    availability: '選択した期間の可用性'
  },
  errors: {
    unableToLoadServices: 'サービスを読み込めません',
    statusUpdateFailed: 'ステータスの更新に失敗しました:',
    serverUnreachable: 'サーバーに接続できません。',
    liveUpdatesUnavailable: 'ライブ更新を利用できません。データが古い可能性があります。',
    dockerUnreachable: 'Docker に接続できません。DOCKER_HOSTS と Docker ソケットのマウントを確認してください。',
    configInvalid: '設定ファイルが無効です。',
    missingGroupsHeader: 'アクセスグループは有効ですが、リバースプロキシからグループヘッダーを受信していません。',
    expectedHeader: (header: string) => `必要なヘッダー: ${header}`
  }
} satisfies Messages
