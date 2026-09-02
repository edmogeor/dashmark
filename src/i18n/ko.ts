import type { Messages } from './index'

export const ko = {
  app: {
    title: 'Dashmark',
    about: 'Dashmark 정보',
    createdBy: '제작자',
    copyright: '저작권 © 2026 edmogeor'
  },
  meta: {
    description: 'Docker 서비스 링크를 위한 가벼운 대시보드입니다.'
  },
  category: {
    all: '모든 카테고리',
    uncategorised: '미분류'
  },
  greeting: {
    morning: '좋은 아침입니다',
    afternoon: '안녕하세요',
    evening: '좋은 저녁입니다'
  },
  search: {
    placeholder: '검색',
    clear: '검색 지우기'
  },
  card: {
    description: '설명',
    resourceUsage: '지표',
    cpu: 'CPU',
    memory: '메모리',
    received: '수신 네트워크',
    sent: '송신 네트워크',
    waitingForNetwork: '다음 새로 고침 대기 중',
    unavailable: '사용할 수 없음',
    loading: (label: string) => `${label} 로드 중`,
    metricUnavailable: (title: string) => `${title} 지표를 사용할 수 없습니다`
  },
  dashboard: {
    noServices: '서비스를 찾을 수 없습니다',
    moreGroups: (_: number, formattedCount: string) => `${formattedCount}개 그룹 더 보기`
  },
  status: {
    loading: '상태 로드 중',
    created: '생성됨',
    restarting: '재시작 중',
    running: '실행 중',
    removing: '제거 중',
    paused: '일시 중지됨',
    exited: '종료됨',
    dead: '중지됨',
    healthy: '정상',
    unhealthy: '비정상',
    starting: '시작 중'
  },
  theme: {
    toggle: '테마 전환',
    switchToSystem: '시스템 테마로 전환',
    switchToLight: '밝은 모드로 전환',
    switchToDark: '어두운 모드로 전환'
  },
  common: {
    close: '닫기',
    true: '참',
    false: '거짓'
  },
  about: {
    latestStableVersion: '최신 안정 버전',
    installedVersion: '설치된 버전',
    checkingForUpdates: '업데이트 확인 중',
    updateAvailable: (version: string) => `업데이트 사용 가능: ${version}`,
    upToDate: '최신 버전입니다.'
  },
  metrics: {
    title: '지표',
    networkUsage: '네트워크 사용량',
    viewHistory: (label: string) => `${label} 기록 보기`,
    chart: (label: string) => `${label} 차트`,
    liveDetails: (label: string) => `${label} 실시간 세부 정보`,
    collectionFailed: '지표 데이터를 사용할 수 없습니다.',
    configurationInvalid: '지표 구성이 잘못되었습니다.'
  },
  time: {
    today: '오늘',
    yesterday: '어제',
    dateTime: (date: string, time: string) => `${date}, ${time}`,
    ranges: {
      day: '24시간',
      week: '7일',
      month: '30일'
    }
  },
  uptime: {
    noChecks: '기록된 점검이 없습니다',
    successfulChecks: (_: number, formattedCount: string) => `성공한 점검 ${formattedCount}회`,
    failedChecks: (_: number, formattedCount: string) => `실패한 점검 ${formattedCount}회`,
    slowestResponse: (value: string) => `가장 느린 응답 ${value}`,
    bucketSummary: (time: string, checks: string, responseTime?: string) => `${time}: ${checks}${responseTime ? `, ${responseTime}` : ''}`,
    up: '정상',
    down: '중단',
    partial: '부분 정상',
    noData: '데이터 없음',
    successful: '성공',
    failed: '실패',
    slowest: '가장 느림',
    history: '가동 시간 기록',
    period: '가동 시간 기간',
    availability: '선택한 기간의 가용성'
  },
  errors: {
    unableToLoadServices: '서비스를 로드할 수 없습니다',
    statusUpdateFailed: '상태 업데이트에 실패했습니다:',
    serverUnreachable: '서버에 연결할 수 없습니다.',
    liveUpdatesUnavailable: '실시간 업데이트를 사용할 수 없습니다. 데이터가 오래되었을 수 있습니다.',
    dockerUnreachable: 'Docker에 연결할 수 없습니다. DOCKER_HOSTS와 Docker 소켓 마운트를 확인하세요.',
    configInvalid: '구성 파일이 잘못되었습니다.',
    missingGroupsHeader: '액세스 그룹이 활성화되어 있지만 리버스 프록시에서 그룹 헤더를 받지 못했습니다.',
    expectedHeader: (header: string) => `필요한 헤더: ${header}`
  }
} satisfies Messages
