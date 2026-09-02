import type { Messages } from './index'

export const tr = {
  app: {
    title: 'Dashmark',
    about: 'Dashmark hakkında',
    createdBy: 'Oluşturan',
    copyright: 'Telif Hakkı © 2026 edmogeor'
  },
  meta: {
    description: 'Docker hizmetlerinize bağlantılar içeren hafif bir pano.'
  },
  category: {
    all: 'Tüm kategoriler',
    uncategorised: 'Kategorisiz'
  },
  greeting: {
    morning: 'Günaydın',
    afternoon: 'Tünaydın',
    evening: 'İyi akşamlar'
  },
  search: {
    placeholder: 'Ara',
    clear: 'Aramayı temizle'
  },
  card: {
    description: 'Açıklama',
    resourceUsage: 'Metrikler',
    cpu: 'CPU',
    memory: 'Bellek',
    received: 'Gelen ağ',
    sent: 'Giden ağ',
    waitingForNetwork: 'Sonraki yenileme bekleniyor',
    unavailable: 'Kullanılamıyor',
    loading: (label: string) => `${label} yükleniyor`,
    metricUnavailable: (title: string) => `${title} metriği kullanılamıyor`
  },
  dashboard: {
    noServices: 'Hizmet bulunamadı',
    moreGroups: (_count: number, formattedCount: string) => `${formattedCount} grup daha göster`
  },
  status: {
    loading: 'Durum yükleniyor',
    created: 'oluşturuldu',
    restarting: 'yeniden başlatılıyor',
    running: 'çalışıyor',
    removing: 'kaldırılıyor',
    paused: 'duraklatıldı',
    exited: 'sonlandırıldı',
    dead: 'çalışmıyor',
    healthy: 'sağlıklı',
    unhealthy: 'sağlıksız',
    starting: 'başlatılıyor'
  },
  theme: {
    toggle: 'Temayı değiştir',
    switchToSystem: 'Sistem temasına geç',
    switchToLight: 'Açık moda geç',
    switchToDark: 'Koyu moda geç'
  },
  common: {
    close: 'Kapat',
    true: 'Doğru',
    false: 'Yanlış'
  },
  about: {
    latestStableVersion: 'En son kararlı sürüm',
    installedVersion: 'Yüklü sürüm',
    checkingForUpdates: 'Güncellemeler denetleniyor',
    updateAvailable: (version: string) => `Güncelleme mevcut: ${version}`,
    upToDate: 'Güncelsiniz.'
  },
  metrics: {
    title: 'Metrikler',
    networkUsage: 'Ağ kullanımı',
    viewHistory: (label: string) => `${label} geçmişini görüntüle`,
    chart: (label: string) => `${label} grafiği`,
    liveDetails: (label: string) => `Canlı ${label} ayrıntıları`,
    collectionFailed: 'Metrik verileri kullanılamıyor.',
    configurationInvalid: 'Metrik yapılandırması geçersiz.'
  },
  time: {
    today: 'Bugün',
    yesterday: 'Dün',
    dateTime: (date: string, time: string) => `${date}, ${time}`,
    ranges: {
      day: '24 sa.',
      week: '7 gün',
      month: '30 gün'
    }
  },
  uptime: {
    noChecks: 'Hiç denetim kaydedilmedi',
    successfulChecks: (_count: number, formattedCount: string) => `${formattedCount} başarılı denetim`,
    failedChecks: (_count: number, formattedCount: string) => `${formattedCount} başarısız denetim`,
    slowestResponse: (value: string) => `en yavaş yanıt ${value}`,
    bucketSummary: (time: string, checks: string, responseTime?: string) => `${time}: ${checks}${responseTime ? `, ${responseTime}` : ''}`,
    up: 'Çalışıyor',
    down: 'Çalışmıyor',
    partial: 'Kısmi',
    noData: 'Veri yok',
    successful: 'Başarılı',
    failed: 'Başarısız',
    slowest: 'En yavaş',
    history: 'Çalışma süresi geçmişi',
    period: 'Çalışma süresi dönemi',
    availability: 'seçilen dönem için kullanılabilirlik'
  },
  errors: {
    unableToLoadServices: 'Hizmetler yüklenemedi',
    statusUpdateFailed: 'Durum güncellenemedi:',
    serverUnreachable: 'Sunucuya ulaşılamadı.',
    liveUpdatesUnavailable: 'Canlı güncellemeler kullanılamıyor. Veriler güncel olmayabilir.',
    dockerUnreachable: 'Docker’a ulaşılamıyor. DOCKER_HOSTS değişkenini ve Docker soket bağlantısını denetleyin.',
    configInvalid: 'Yapılandırma dosyası geçersiz.',
    missingGroupsHeader: 'Erişim grupları etkin, ancak ters vekil sunucudan grup başlığı alınmadı.',
    expectedHeader: (header: string) => `Beklenen başlık: ${header}`
  }
} satisfies Messages
