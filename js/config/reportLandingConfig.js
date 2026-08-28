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
    description: '송파구와 잠실 생활권의 매매, 전세, 거래 흐름을 실제 매물 비교 순서와 함께 정리한 시장 리포트 허브입니다.',
    heroKicker: 'Songpa Market',
    heroTitle: '송파구 부동산 시장 리포트',
    heroBody: '지역 평균에서 출발해 같은 단지와 면적의 실거래, 전세·월세 비용, 입주 일정과 계약 안전까지 실제 선택에 필요한 순서로 좁혀봅니다.',
    introSections: [
      {
        heading: '평균 지표와 실제 계약을 나눠 봅니다',
        content: '서울이나 송파구 평균 변동률은 지역의 방향을 확인하는 출발점입니다. 실제 매물을 비교할 때는 같은 단지·면적의 신고 거래, 계약일, 층과 수리 상태, 거래 해제 여부를 다시 확인해야 합니다. 평균이 올라도 선택한 단지는 다를 수 있고, 한 건의 낮은 거래만으로 지역 전체가 내려갔다고 단정할 수도 없습니다.'
      },
      {
        heading: '매매와 임대차 비용을 같은 기준으로 맞춥니다',
        content: '전세는 보증금과 대출이자, 월세는 보증금 조달비용과 월차임, 관리비를 한 달 비용으로 환산해야 비교가 됩니다. 같은 송파 생활권에서도 입주일, 보증 가입 가능 여부, 선순위 권리와 대출 한도가 다르므로 가격표 한 줄보다 계약 조건 전체를 먼저 확인합니다.'
      },
      {
        heading: '정책과 정비사업은 발표 단계부터 구분합니다',
        content: '대출 규제, 세금, 공급 계획과 재건축 일정은 발표만 된 내용과 실제 시행 중인 기준을 구분해야 합니다. 조합 공지, 인허가와 입주 일정처럼 확인 가능한 자료를 보고, 기대감이 개별 매물 가격에 이미 반영됐는지도 최근 실거래와 함께 살펴봅니다.'
      }
    ],
    focusPoints: [
      '같은 단지·면적의 신고 거래와 해제 여부',
      '전세·반전세·월세의 월 기준 총주거비',
      '입주 시점과 보증금 반환 안전성',
      '정책 시행일과 정비사업 공식 일정'
    ],
    faq: [
      {
        question: '송파구 시장은 어떤 지표를 먼저 봐야 하나요?',
        answer: '지역 평균 변동률로 방향을 보고, 같은 단지·면적의 최근 신고 거래와 해제 여부로 좁힌 뒤 현재 매물의 동·층·향·수리 상태와 계약 조건을 비교하는 순서가 좋습니다.'
      },
      {
        question: '잠실과 송파 전체 흐름은 같은가요?',
        answer: '행정구 평균과 잠실 대단지의 거래 흐름은 다를 수 있습니다. 실제 검토 지역을 정한 뒤 비교 가능한 거래와 현재 매물 조건을 따로 확인해야 합니다.'
      },
      {
        question: '전세와 월세는 무엇을 같은 기준으로 맞추나요?',
        answer: '보증금 조달비용, 대출이자, 월차임과 관리비를 한 달 비용으로 맞춘 뒤 보증 가입 가능 여부와 입주 시점을 별도 항목으로 비교합니다.'
      },
      {
        question: '상담 전에 무엇을 준비하면 비교가 빨라지나요?',
        answer: '희망 지역과 단지, 예산, 보유 현금과 대출 필요액, 입주 희망일, 전세·월세·매매 중 열어둘 선택지를 알려주면 실제 가능한 매물부터 좁힐 수 있습니다.'
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
    description: '잠실 아파트의 매매, 전세, 거래 흐름을 단지·면적별 비교와 계약 확인 순서로 정리한 지역 분석 허브입니다.',
    heroKicker: 'Jamsil Brief',
    heroTitle: '잠실 아파트 시장 분석',
    heroBody: '대단지 평균에 머무르지 않고 같은 면적의 실거래, 계약 해제, 전세와 월세 비용, 정비사업 단계와 현재 거주 조건을 함께 비교합니다.',
    introSections: [
      {
        heading: '대단지 평균보다 비교 가능한 거래를 찾습니다',
        content: '잠실 대단지는 같은 단지 안에서도 전용면적, 동·층·향, 내부 상태와 입주 가능일에 따라 조건 차이가 큽니다. 최근 신고가격을 볼 때는 계약일과 계약 해제 여부를 함께 확인하고, 한두 건의 거래보다 비슷한 조건의 계약이 이어지는지 살펴봅니다.'
      },
      {
        heading: '전세 흐름을 매매가격의 신호로 단정하지 않습니다',
        content: '전세가격은 입주 물량, 학기와 이사 시기, 대출 조건, 보증금 반환 위험의 영향을 함께 받습니다. 전세가 오른다는 이유만으로 매매가도 곧 오른다고 단정하지 않고, 실제 매매 거래량과 호가 간격, 대출 가능액을 별도로 확인합니다.'
      },
      {
        heading: '재건축 기대와 현재 거주 조건을 분리합니다',
        content: '정비사업은 공식 단계와 예상 기간, 추가 비용, 이주 가능성을 확인해야 합니다. 장래 기대만 보지 말고 현재 주택 상태, 관리비, 주차, 학군·출퇴근 동선과 실제 입주 시점을 함께 비교해야 실거주 선택이 선명해집니다.'
      }
    ],
    focusPoints: [
      '같은 단지·면적의 신고 거래 흐름',
      '신고 거래의 계약일과 계약 해제 여부',
      '전세·월세의 보증금 조달비용과 관리비',
      '정비사업 공식 단계와 현재 거주 조건'
    ],
    faq: [
      {
        question: '잠실 리포트는 어떤 내용을 다루나요?',
        answer: '지역 평균뿐 아니라 같은 단지·면적의 신고 거래, 거래량, 전세와 월세 비용, 정비사업 공식 일정처럼 실제 매물을 비교할 때 필요한 순서를 정리합니다.'
      },
      {
        question: '잠실 전세 흐름은 왜 따로 봐야 하나요?',
        answer: '전세는 매매와 다른 입주 수요, 보증금 조달비용과 공급 일정의 영향을 받습니다. 전세 변화를 매매 방향으로 바로 바꾸지 않고 두 시장을 나눠 확인합니다.'
      },
      {
        question: '최근 실거래와 현재 호가가 다르면 무엇을 봐야 하나요?',
        answer: '거래일 이후 시장 변화, 동·층·향과 수리 상태, 입주 가능일, 계약 해제 여부를 먼저 맞춰 봅니다. 비교 조건이 다른 거래를 같은 가격 기준으로 쓰면 판단이 왜곡될 수 있습니다.'
      },
      {
        question: '상담 전에 필요한 정보는 무엇인가요?',
        answer: '희망 단지와 면적, 예산, 대출 필요액, 입주일, 주차·학군·출퇴근 우선순위를 정하면 실제로 볼 후보와 제외할 후보를 빠르게 나눌 수 있습니다.'
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
    description: '강남 업무권의 사무실 임대료, 총점유비용, 실사용 면적과 계약 조건을 함께 비교하는 시장 분석 허브입니다.',
    heroKicker: 'Gangnam Office',
    heroTitle: '강남 사무실 임대 시장 리포트',
    heroBody: '월차임만 보지 않고 관리비와 공사비를 합친 총점유비용, 실제 좌석이 들어가는 면적, 이전 일정과 원상복구 조건까지 확인합니다.',
    introSections: [
      {
        heading: '월차임보다 총점유비용을 먼저 계산합니다',
        content: '사무실 비용은 보증금과 월차임만으로 끝나지 않습니다. 공용관리비, 전기·냉난방, 주차, 인테리어와 원상복구, 이전비를 계약기간 전체로 나눠 총점유비용을 비교해야 실제 부담을 알 수 있습니다.'
      },
      {
        heading: '계약면적과 실제 사용하는 면적을 구분합니다',
        content: '같은 계약면적이라도 전용률과 기둥·복도 구조에 따라 좌석 수와 회의실 배치가 달라집니다. 현장에서는 실측 도면, 전용면적, 냉난방 시간, 통신공사 가능 여부를 확인하고 직원 수와 방문객 동선에 맞는지 점검합니다.'
      },
      {
        heading: '이전 일정과 계약 종료 비용을 함께 봅니다',
        content: '입주 가능일, 인테리어 공사기간, 기존 사무실 만료일이 맞지 않으면 이중 임차료가 생길 수 있습니다. 중도해지, 임대료 인상, 관리비 정산, 원상복구 범위와 사업자등록 가능 여부를 계약 전에 문서로 확인합니다.'
      }
    ],
    focusPoints: [
      '월차임·관리비·공사비를 합친 총점유비용',
      '계약면적과 전용면적, 실제 좌석 배치',
      '냉난방·주차·통신 등 운영 조건',
      '중도해지와 원상복구, 이전 일정'
    ],
    faq: [
      {
        question: '강남 오피스 시장은 어떤 기업에게 중요한가요?',
        answer: '직원과 고객의 접근성, 업종별 사업자등록 조건, 채용과 대외 방문 빈도를 중요하게 보는 기업은 임대료뿐 아니라 위치가 운영에 주는 효과를 함께 비교할 필요가 있습니다.'
      },
      {
        question: '사무실 임대에서 무엇을 같이 봐야 하나요?',
        answer: '보증금과 월차임, 관리비, 전용면적, 냉난방과 주차 조건, 공사비, 이전비와 원상복구 예상비용을 계약기간 전체 기준으로 비교해야 합니다.'
      },
      {
        question: '이 리포트는 매물 검토와 어떻게 연결되나요?',
        answer: '예산과 인원, 입주일, 필요한 회의실·주차 수를 먼저 정한 뒤 총점유비용과 실사용 면적이 맞는 후보만 현장에서 확인하도록 돕습니다.'
      },
      {
        question: '계약 전에 특히 문서로 남길 항목은 무엇인가요?',
        answer: '관리비 포함·별도 항목, 냉난방 운영시간, 인테리어 승인, 중도해지, 임대료 조정, 원상복구 범위와 사업자등록 가능 여부를 계약서와 특약에서 확인해야 합니다.'
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
