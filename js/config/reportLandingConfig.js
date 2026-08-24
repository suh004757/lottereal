export const REPORT_LANDING_CONFIG = {
  disputeCases: {
    key: 'dispute-cases',
    path: 'disputes.html',
    title: '부동산 계약·분쟁 사례 | 곰팡이·누수·보증금 | 롯데부동산',
    description: '전월세 곰팡이, 누수, 보증금 반환, 계약금과 원상복구처럼 자주 생기는 부동산 분쟁을 법령·판례·공식 조정사례로 쉽게 설명합니다.',
    heroKicker: '계약 · 분쟁 사례',
    heroTitle: '계약 전에 읽어두면 좋은 부동산 분쟁 사례',
    heroBody: '곰팡이·누수·보증금·계약금처럼 실제로 자주 묻는 상황을 골라, 책임이 갈리는 기준과 미리 남겨야 할 자료를 쉬운 말로 정리합니다.',
    introSections: [
      {
        heading: '누가 무조건 책임진다고 먼저 단정하지 않습니다',
        content: '곰팡이와 누수도 원인, 수선 난이도, 통지 시점, 계약 내용에 따라 결론이 달라집니다. 실제 판례와 공식 조정사례에서 확인되는 판단 기준을 먼저 설명합니다.'
      },
      {
        heading: '분쟁이 커지기 전에 준비할 것을 알려드립니다',
        content: '사진과 영상, 문자 통지, 수리 견적, 등기와 계약서처럼 사실관계를 확인하는 데 필요한 자료를 상황별로 안내합니다.'
      }
    ],
    focusPoints: [
      '곰팡이·결로·누수의 원인과 수선 책임',
      '보증금 반환과 계약 종료 절차',
      '가계약금·특약·원상복구 분쟁',
      '사진·문자·견적 등 미리 남길 자료'
    ],
    faq: [
      {
        question: '사례와 똑같으면 결과도 같나요?',
        answer: '아닙니다. 같은 곰팡이 문제라도 구조상 하자인지, 환기와 사용 문제인지, 언제 알렸는지에 따라 판단이 달라집니다.'
      },
      {
        question: '이 글이 법률상담을 대신하나요?',
        answer: '아닙니다. 공개 법령과 사례를 쉽게 정리한 참고자료이며, 금전 청구나 계약 해지는 개별 서류를 확인한 뒤 전문가와 판단해야 합니다.'
      },
      {
        question: '분쟁이 생기면 무엇부터 준비해야 하나요?',
        answer: '문제 부위의 날짜별 사진과 영상, 임대인 또는 임차인에게 알린 문자, 수리업체의 원인 의견과 견적, 계약서를 먼저 모아두는 편이 좋습니다.'
      }
    ],
    reportMatch: {
      requiredContentTypes: ['dispute_case'],
      keywords: ['분쟁', '곰팡이', '누수', '보증금', '계약', '원상복구'],
      metadataRegion: []
    },
    insightSlugs: [],
    ctaHref: 'contact.html'
  },
  songpaMarket: {
    key: 'songpa-market-report',
    path: 'songpa-market-report.html',
    title: '송파구 부동산 시장 리포트 | 롯데부동산',
    description: '송파구와 잠실 생활권의 매매, 전세, 거래 흐름을 정리한 시장 리포트 허브 페이지입니다.',
    heroKicker: 'Songpa Market',
    heroTitle: '송파구 부동산 시장 리포트',
    heroBody: '송파구와 잠실 생활권을 중심으로 가격 흐름, 전세 압력, 거래량 변화를 함께 살펴보는 지역 리포트 허브입니다.',
    introSections: [
      {
        heading: '송파 시장 특징',
        content: '송파구는 실거주 수요와 전세 수요가 동시에 강한 지역입니다. 잠실 생활권과 주요 역세권의 흐름을 함께 봐야 체감 시장을 정확하게 읽을 수 있습니다.'
      },
      {
        heading: '최근 체크 포인트',
        content: '전세 공급 압력, 입주 물량, 재건축 기대감이 동시에 작용하고 있어 가격과 거래량을 함께 추적하는 것이 중요합니다.'
      }
    ],
    focusPoints: [
      '실거주 수요와 전세 수요의 동시 움직임',
      '잠실 생활권과 송파 주요 역세권 비교',
      '입주 물량과 가격 방어 흐름',
      '정책 변화가 실수요에 미치는 영향'
    ],
    faq: [
      {
        question: '송파구 시장은 어떤 지표를 먼저 봐야 하나요?',
        answer: '매매 거래량, 전세 매물 감소, 입주 예정 물량을 함께 봐야 실제 체감 시장을 이해하기 쉽습니다.'
      },
      {
        question: '잠실과 송파 전체 흐름은 같은가요?',
        answer: '방향은 비슷할 수 있지만 가격 민감도와 수요층이 달라 잠실권과 그 외 권역을 나눠서 보는 것이 좋습니다.'
      },
      {
        question: '이 리포트는 누가 보면 좋나요?',
        answer: '송파구 실거주 수요자, 전세 수요자, 송파 생활권 중심으로 매수나 임차를 검토하는 사용자에게 적합합니다.'
      }
    ],
    reportMatch: {
      keywords: ['송파', '잠실', '서울'],
      metadataRegion: ['songpa', 'jamsil', 'seoul']
    },
    insightSlugs: ['songpa-apt-trends', 'jamsil-apt-analysis'],
    ctaHref: 'contact.html'
  },
  jamsilMarket: {
    key: 'jamsil-market-report',
    path: 'jamsil-market-report.html',
    title: '잠실 아파트 시장 분석 | 롯데부동산',
    description: '잠실 아파트의 매매, 전세, 거래 흐름을 정리한 지역 분석 허브 페이지입니다.',
    heroKicker: 'Jamsil Brief',
    heroTitle: '잠실 아파트 시장 분석',
    heroBody: '잠실 주요 단지의 가격 흐름과 전세 수급, 실거주 수요 변화를 중심으로 최근 리포트를 모아보는 페이지입니다.',
    introSections: [
      {
        heading: '잠실 아파트 수요',
        content: '잠실은 생활 인프라와 교통 접근성이 모두 뛰어나 실거주 선호가 꾸준한 편입니다. 매매와 전세를 함께 봐야 수요 강도를 읽기 쉽습니다.'
      },
      {
        heading: '최근 체크 포인트',
        content: '대단지 거래량, 전세가 움직임, 금리와 대출 규제 체감 변화를 함께 보면 잠실 시장의 방향성을 더 명확하게 파악할 수 있습니다.'
      }
    ],
    focusPoints: [
      '잠실 대단지 거래 흐름',
      '전세가와 월세 전환 압력',
      '실거주 수요의 체감 변화',
      '주요 단지별 가격 민감도'
    ],
    faq: [
      {
        question: '잠실 리포트는 어떤 내용을 다루나요?',
        answer: '매매가격, 거래량, 전세 흐름, 수요 특성과 같은 핵심 지표를 지역 맥락에 맞춰 정리합니다.'
      },
      {
        question: '잠실 전세 흐름은 왜 중요한가요?',
        answer: '잠실은 실거주 수요가 강해 전세 시장 변화가 매매 심리와 연결되는 경우가 많기 때문입니다.'
      },
      {
        question: '얼마나 자주 보면 좋나요?',
        answer: '월간 리포트를 기본으로 보고, 시장 변화가 큰 시기에는 브리프형 분석을 함께 보는 것이 좋습니다.'
      }
    ],
    reportMatch: {
      keywords: ['잠실', '송파', '아파트'],
      metadataRegion: ['jamsil', 'songpa']
    },
    insightSlugs: ['jamsil-apt-analysis', 'songpa-apt-trends'],
    ctaHref: 'contact.html'
  },
  gangnamOffice: {
    key: 'gangnam-office-report',
    path: 'gangnam-office-report.html',
    title: '강남 사무실 임대 시장 리포트 | 롯데부동산',
    description: '강남 업무권의 사무실 임대 흐름과 법인 수요를 정리한 시장 분석 허브 페이지입니다.',
    heroKicker: 'Gangnam Office',
    heroTitle: '강남 사무실 임대 시장 리포트',
    heroBody: '강남권 업무지구를 중심으로 공실 흐름, 법인 수요, 비용 구조 변화를 함께 살펴보는 사무실 임대 리포트 허브입니다.',
    introSections: [
      {
        heading: '강남 오피스 시장 특징',
        content: '강남 사무실 시장은 단순 가격만으로 판단하기 어렵습니다. 면적 효율, 관리비 구조, 교통 접근성이 함께 작동하는 시장입니다.'
      },
      {
        heading: '최근 체크 포인트',
        content: '중소형 사무실 수요, 법인 이전 수요, 세부 비용 구조 변화까지 같이 봐야 체감 임대 시장을 이해하기 쉽습니다.'
      }
    ],
    focusPoints: [
      '중소형 사무실 수요 변화',
      '강남 업무권 공실과 이전 수요',
      '법인 확장 수요의 체감 변화',
      '임대료 외 관리비 구조 체크'
    ],
    faq: [
      {
        question: '강남 오피스 시장은 어떤 기업에게 중요한가요?',
        answer: '브랜드 노출과 접근성, 인재 확보를 중시하는 기업일수록 강남 오피스 시장 흐름을 면밀히 볼 필요가 있습니다.'
      },
      {
        question: '사무실 임대에서 무엇을 같이 봐야 하나요?',
        answer: '보증금과 월차임뿐 아니라 관리비 구조, 전용률, 동선과 같은 운영 요소도 함께 확인해야 합니다.'
      },
      {
        question: '이 리포트는 매물 검토와 어떻게 연결되나요?',
        answer: '시장 흐름을 먼저 보고 난 뒤 조건에 맞는 사무실을 비교하면 실제 의사결정 속도가 빨라집니다.'
      }
    ],
    reportMatch: {
      keywords: ['강남', '사무실', '오피스', '서울'],
      metadataRegion: ['gangnam', 'seoul']
    },
    insightSlugs: ['gangnam-apt-trends'],
    ctaHref: 'contact.html'
  }
};

export const REPORT_LANDING_LIST = Object.values(REPORT_LANDING_CONFIG);

export function getReportLandingConfigByKey(key) {
  return REPORT_LANDING_LIST.find((config) => config.key === key) || null;
}

export function findMatchingLandingConfigs(report) {
  if (!report) return [];

  const haystack = [
    report.title,
    report.summary,
    report.metadata?.region,
    report.metadata?.content_type
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return REPORT_LANDING_LIST
    .map((config) => ({
      config,
      score: scoreLandingMatch(config, haystack, report)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.config);
}

function scoreLandingMatch(config, haystack, report) {
  let score = 0;
  const keywords = config.reportMatch?.keywords || [];
  const regions = config.reportMatch?.metadataRegion || [];
  const requiredContentTypes = config.reportMatch?.requiredContentTypes || [];
  const reportType = String(report.metadata?.content_type || '').toLowerCase();
  const reportRegion = String(report.metadata?.region || '').toLowerCase();

  if (requiredContentTypes.length && !requiredContentTypes.includes(reportType)) {
    return 0;
  }

  if (requiredContentTypes.includes(reportType)) {
    score += 20;
  }

  keywords.forEach((keyword) => {
    if (haystack.includes(String(keyword).toLowerCase())) {
      score += 2;
    }
  });

  regions.forEach((region) => {
    if (reportRegion.includes(String(region).toLowerCase())) {
      score += 4;
    }
  });

  return score;
}
