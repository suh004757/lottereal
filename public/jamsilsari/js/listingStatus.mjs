import {getListingFreshness} from '../../js/utils/listingFreshness.mjs';
export const SHOW_COMPLETED = false;
export const TIERS = Object.freeze({
  site_visit: ['중개사무소 임장 확인', '중개사무소가 현장에서 매물과 거주 상태를 직접 확인했습니다.'],
  owner_listed: ['소유자 직접 의뢰', '소유자 또는 가족이 방문·전화로 중개를 의뢰했습니다. 임장 전입니다.'],
  tenant_listed: ['거주 임차인 의뢰', '현재 거주 임차인이 방문·전화로 중개를 의뢰했습니다. 임장 전입니다.'],
});
const day = 86400000;
export function listingStatus(row, {now = new Date(), showCompleted = SHOW_COMPLETED} = {}) {
  if (!row || !Object.hasOwn(TIERS, row.tier) || !row.verified_at || !Number.isFinite(Date.parse(row.verified_at))) return null;
  if (row.closed_at != null) {
    const ageMs = +now - Date.parse(row.closed_at);
    return showCompleted && ageMs >= 0 && Math.floor(ageMs / day) <= 60 ? {label:'거래완료', completed:true} : null;
  }
  const {needsReview, ageDays, verifiedAt} = getListingFreshness({last_verified_at:row.verified_at}, {now, reviewAfterDays:31});
  const [tierLabel, explanation] = TIERS[row.tier];
  const scope = row.listing_scope;
  return {tier:row.tier, tierLabel, explanation, ageDays, verifiedAt, needsReview,
    label:needsReview ? '재확인 필요' : '확인됨',
    scopeLabel:scope === 'shared' ? '중복 게재' : scope === 'exclusive' ? '잠실살이 단독' : '',
    notice:scope === 'shared' ? '다른 채널에도 게재된 매물입니다. 방문 전 거래 가능 여부를 확인해 주세요.' :
      (scope !== 'exclusive' || needsReview) ? '방문 전 거래 가능 여부를 확인해 주세요.' : ''};
}
