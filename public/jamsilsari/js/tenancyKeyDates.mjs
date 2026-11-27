// Candidate calculations from SDD §6; effective-law review (H1) is a release prerequisite.
const law = (name, article) => `https://www.law.go.kr/법령/${name}/제${article}`;
const leaseLaw = article => law('주택임대차보호법',article);
const tradeLaw = article => law('부동산거래신고등에관한법률',article);
const iso = date => date.toISOString().split('T')[0];
function calendar(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+date) && iso(date) === value ? date : null;
}
// Work on KST civil dates as calendar labels, not as local timestamps.
function offset(value, {months = 0, days = 0}) {
  const date = calendar(value);
  if (!date) return null;
  if (months) {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months + 1,0);
    date.setUTCDate(Math.min(day,date.getUTCDate()));
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.getUTCFullYear() > 0 && date.getUTCFullYear() <= 9999 ? iso(date) : null;
}
const item = (key,label,date,basis,sourceUrl,more) => ({key,label,date,basis,sourceUrl,...more});
const amountKnown = value => (typeof value === 'number' && Number.isInteger(value) && value >= 0) ||
  (typeof value === 'string' && /^\d+$/.test(value));

export function tenancyKeyDates(row) {
  const {transaction_type,contract_date,start_date,end_date,deposit_manwon,monthly_rent_manwon} = row;
  const plus30 = offset(contract_date,{days:30});
  if (transaction_type === '매매') return [
    item('trade_report','부동산 거래신고',plus30,'부동산 거래신고 등에 관한 법률 제3조',tradeLaw('3')),
    item('funding_plan','자금조달계획서 (대상인 경우)',plus30,'부동산 거래신고 등에 관한 법률 시행규칙 제2조',
      law('부동산거래신고등에관한법률시행규칙','2'),{provideBy:offset(contract_date,{days:25}),
        note:'제출 대상인지 먼저 확인하세요. 매수인과 신고인이 다르면 신고인에게 제공하는 별도 기준일을 참고하세요.'})
  ];
  if (!['전세','월세'].includes(transaction_type)) return [];
  const from = offset(end_date,{months:-6}), to = offset(end_date,{months:-2});
  const twoYears = offset(start_date,{months:24});
  const short = Boolean(twoYears && calendar(end_date) && end_date < twoYears);
  const dates = [
    item('renewal_window','갱신 관련 통지·요구 기간',null,'주택임대차보호법 제6조·제6조의3',leaseLaw('6조의3'),{
      window:{from,to},...(short && {note:'기재된 계약 기간이 2년 미만입니다. 이 기간은 기재 종료일로 계산한 참고값이며, 법률상 기간은 주택임대차보호법 제4조를 별도로 확인하세요.'})
    }),
    item('move_in_and_fixed_date','전입신고·확정일자 확인',calendar(start_date) ? start_date : null,
      '주택임대차보호법 제3조·제3조의2',leaseLaw('3조의2')),
    item('deposit_return','보증금 반환 확인',calendar(end_date) ? end_date : null,'기재된 계약 종료일 기준 · 주택임대차보호법 제4조',leaseLaw('4'))
  ];
  const over = [deposit_manwon,monthly_rent_manwon].some((value,index) => amountKnown(value) && Number(value) > [6000,30][index]);
  if (over || ![deposit_manwon,monthly_rent_manwon].every(amountKnown)) dates.push(
    item('rent_report','주택 임대차 계약 신고',over ? plus30 : null,'부동산 거래신고 등에 관한 법률 제6조의2',tradeLaw('6조의2'),
      {note:over ? '서울 기준 후보 일정입니다. 신고 대상과 예외를 확인하세요.' : '보증금 또는 월차임 정보가 없어 신고 대상을 확인해야 합니다.'}));
  return dates;
}
