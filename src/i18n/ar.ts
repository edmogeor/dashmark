import type { Messages } from './index'

export const ar = {
  app: { title: 'Dashmark', about: 'حول Dashmark', createdBy: 'أنشأه', copyright: 'حقوق النشر © 2026 edmogeor' },
  meta: { description: 'لوحة خفيفة بروابط إلى خدمات Docker الخاصة بك.' },
  category: { all: 'كل الفئات', uncategorised: 'بلا فئة' },
  greeting: { morning: 'صباح الخير', afternoon: 'مساء الخير', evening: 'مساء الخير' },
  search: { placeholder: 'بحث', clear: 'مسح البحث' },
  card: {
    description: 'الوصف',
    resourceUsage: 'المقاييس',
    cpu: 'المعالج',
    memory: 'الذاكرة',
    received: 'الشبكة الواردة',
    sent: 'الشبكة الصادرة',
    waitingForNetwork: 'بانتظار التحديث التالي',
    unavailable: 'غير متاح',
    loading: (label: string) => `جار تحميل ${label}`,
    metricUnavailable: (title: string) => `مقياس ${title} غير متاح`
  },
  dashboard: { noServices: 'لم يتم العثور على خدمات', moreGroups: (_: number, count: string) => `عرض ${count} مجموعات أخرى` },
  status: {
    loading: 'جار تحميل الحالة',
    created: 'تم الإنشاء',
    restarting: 'جار إعادة التشغيل',
    running: 'قيد التشغيل',
    removing: 'جار الإزالة',
    paused: 'متوقف مؤقتًا',
    exited: 'تم الإيقاف',
    dead: 'متوقف',
    healthy: 'سليم',
    unhealthy: 'غير سليم',
    starting: 'جار البدء'
  },
  theme: { toggle: 'تبديل المظهر', switchToSystem: 'استخدام مظهر النظام', switchToLight: 'استخدام الوضع الفاتح', switchToDark: 'استخدام الوضع الداكن' },
  common: { close: 'إغلاق', true: 'صحيح', false: 'خطأ' },
  about: {
    latestStableVersion: 'أحدث إصدار مستقر',
    installedVersion: 'الإصدار المثبت',
    checkingForUpdates: 'جار التحقق من التحديثات',
    updateAvailable: (version: string) => `يتوفر تحديث: ${version}`,
    upToDate: 'أنت تستخدم أحدث إصدار.'
  },
  metrics: {
    title: 'المقاييس',
    networkUsage: 'استخدام الشبكة',
    viewHistory: (label: string) => `عرض سجل ${label}`,
    chart: (label: string) => `مخطط ${label}`,
    liveDetails: (label: string) => `تفاصيل ${label} المباشرة`,
    collectionFailed: 'بيانات المقياس غير متاحة.',
    configurationInvalid: 'إعداد المقياس غير صالح.'
  },
  time: { today: 'اليوم', yesterday: 'أمس', dateTime: (date: string, time: string) => `${date}، ${time}`, ranges: { day: '24 س', week: '7 أ', month: '30 ي' } },
  uptime: {
    noChecks: 'لم تُسجل أي عمليات فحص',
    successfulChecks: (_count: number, formattedCount: string) => `${formattedCount} عملية فحص ناجحة`,
    failedChecks: (_count: number, formattedCount: string) => `${formattedCount} عملية فحص فاشلة`,
    slowestResponse: (value: string) => `أبطأ استجابة ${value}`,
    bucketSummary: (time: string, checks: string, responseTime?: string) => `${time}: ${checks}${responseTime ? `، ${responseTime}` : ''}`,
    up: 'متاح',
    down: 'غير متاح',
    partial: 'جزئي',
    noData: 'لا توجد بيانات',
    successful: 'ناجح',
    failed: 'فاشل',
    slowest: 'الأبطأ',
    history: 'سجل وقت التشغيل',
    period: 'فترة وقت التشغيل',
    availability: 'التوفر للفترة المحددة'
  },
  errors: {
    unableToLoadServices: 'تعذر تحميل الخدمات',
    statusUpdateFailed: 'فشل تحديث الحالة:',
    serverUnreachable: 'تعذر الوصول إلى الخادم.',
    liveUpdatesUnavailable: 'التحديثات المباشرة غير متاحة. قد تكون البيانات قديمة.',
    dockerUnreachable: 'لا يمكن الوصول إلى Docker. تحقق من DOCKER_HOSTS وربط مقبس Docker.',
    configInvalid: 'ملف الإعداد غير صالح.',
    missingGroupsHeader: 'مجموعات الوصول مفعلة، لكن لم يتم تلقي ترويسة المجموعات من الوكيل العكسي.',
    expectedHeader: (header: string) => `الترويسة المتوقعة: ${header}`
  }
} satisfies Messages
