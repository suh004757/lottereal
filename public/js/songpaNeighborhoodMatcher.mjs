function requireConfig(config) {
  if (!config || config.schemaVersion !== 1 || !Array.isArray(config.neighborhoods)) {
    throw new RangeError('지원하지 않는 동네 설정입니다.');
  }
  if (!Number.isInteger(config.resultLimit) || config.resultLimit < 1) {
    throw new RangeError('결과 개수 설정이 올바르지 않습니다.');
  }
  if (!Number.isInteger(config.maxPrioritySelections) || config.maxPrioritySelections < 1) {
    throw new RangeError('선택 개수 설정이 올바르지 않습니다.');
  }
}

function ids(items) {
  return new Set(items.map((item) => item.id));
}

function requireInput(input, config) {
  const purposes = ids(config.purposes || []);
  const priorities = ids(config.priorities || []);
  const selected = input?.priorities;

  if (!purposes.has(input?.purpose) || !Array.isArray(selected) || selected.length < 1) {
    throw new RangeError('목적과 중요 조건을 선택해 주세요.');
  }
  if (selected.length > config.maxPrioritySelections || new Set(selected).size !== selected.length) {
    throw new RangeError(`중요 조건은 최대 ${config.maxPrioritySelections}개까지 선택할 수 있습니다.`);
  }
  if (selected.some((priority) => !priorities.has(priority))) {
    throw new RangeError('지원하지 않는 중요 조건입니다.');
  }
}

function scoreNeighborhood(neighborhood, input, config) {
  const purposeScore = neighborhood.purposeFit?.[input.purpose];
  if (!Number.isFinite(purposeScore)) {
    throw new RangeError('동네 목적 점수 설정이 올바르지 않습니다.');
  }

  const priorityScore = input.priorities.reduce((sum, priority) => {
    const value = neighborhood.signals?.[priority];
    if (!Number.isFinite(value)) {
      throw new RangeError('동네 조건 점수 설정이 올바르지 않습니다.');
    }
    return sum + value;
  }, 0);

  return (purposeScore * config.scoring.purposeWeight)
    + (priorityScore * config.scoring.priorityWeight);
}

function reasonList(neighborhood, input, config) {
  const reasons = [neighborhood.purposeReasons?.[input.purpose]];
  for (const priority of input.priorities) {
    if ((neighborhood.signals?.[priority] || 0) > 0) {
      reasons.push(neighborhood.priorityReasons?.[priority]);
    }
  }
  return reasons.filter(Boolean).slice(0, config.reasonLimit);
}

function publicResult(neighborhood, input, config) {
  return {
    id: neighborhood.id,
    name: neighborhood.name,
    eyebrow: neighborhood.eyebrow,
    summary: neighborhood.summary,
    housingTypes: neighborhood.housingTypes,
    reasons: reasonList(neighborhood, input, config),
    tradeoffs: [...neighborhood.tradeoffs].slice(0, config.tradeoffLimit),
    fieldChecks: [...neighborhood.fieldChecks],
  };
}

export function rankNeighborhoods(input, config) {
  requireConfig(config);
  requireInput(input, config);

  const tieBreak = new Map((config.tieBreakOrder || []).map((id, index) => [id, index]));
  return config.neighborhoods
    .map((neighborhood) => ({
      neighborhood,
      score: scoreNeighborhood(neighborhood, input, config),
      tie: tieBreak.get(neighborhood.id) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((left, right) => (right.score - left.score) || (left.tie - right.tie))
    .slice(0, config.resultLimit)
    .map(({ neighborhood }) => publicResult(neighborhood, input, config));
}
