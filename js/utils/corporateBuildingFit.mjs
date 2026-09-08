const BUILDING = Object.freeze({ parkingCapacity: 14, hasElevator: false });

export function assessCorporateFit({
  useType = 'hq',
  parkingNeed = 0,
  elevatorRequired = false
} = {}) {
  const parking = Number.isFinite(Number(parkingNeed)) ? Math.max(0, Number(parkingNeed)) : 0;
  const reasons = [];

  if (Boolean(elevatorRequired) && !BUILDING.hasElevator) {
    reasons.push('이 건물은 엘리베이터가 없어 필수 조건과 맞지 않습니다.');
    return {
      status: '우선순위 낮음',
      tone: 'low',
      summary: '엘리베이터가 필수라면 다른 사옥을 우선 검토하는 편이 적절합니다.',
      reasons
    };
  }

  if (parking > BUILDING.parkingCapacity) {
    reasons.push(`공개 주차대수는 자주식 ${BUILDING.parkingCapacity}대이며, 입력한 ${parking}대 수요는 초과합니다.`);
    return {
      status: '추가 확인',
      tone: 'check',
      summary: '인근 주차 대안과 실제 운영 가능한 주차대수를 현장에서 확인해야 합니다.',
      reasons
    };
  }

  const useMessages = {
    hq: '건물 전체를 부서별 본사 공간으로 구성할 수 있는지 검토할 수 있습니다.',
    showroom: '저층 독립 건물이라 본사와 브랜드 쇼룸을 결합하는 안을 검토할 수 있습니다.',
    research: '연구·콘텐츠 공간은 현재 용도와 시설 요건을 먼저 확인해야 합니다.',
    customer: '고객 방문형 공간은 접근성, 수직 이동과 법정 용도를 함께 확인해야 합니다.'
  };
  reasons.push(useMessages[useType] || useMessages.hq);
  reasons.push(`요청 주차 ${parking}대는 공개 주차대수 ${BUILDING.parkingCapacity}대 이내입니다.`);

  return {
    status: '적합성 검토',
    tone: 'fit',
    summary: '공개 정보상 1차 검토가 가능합니다. 실제 용도·인도·시설 상태는 현장과 공적장부로 다시 확인해야 합니다.',
    reasons
  };
}

export { BUILDING };
