export const PROPERTY_TYPES = ['아파트','빌라','오피스텔','주택','사무실','상가','기타'];
export const OWNER_ROLES = ['소유자','소유자 가족','거주 임차인'];
export const REQUIRED_AMOUNTS = {매매:['price_manwon'], 전세:['deposit_manwon'], 월세:['deposit_manwon','monthly_rent_manwon'], 단기임대:[]};
export const AMOUNTS = {price_manwon:'매매가',deposit_manwon:'보증금',monthly_rent_manwon:'월세'};
const characters = text => [...text].length;
export function validateRequest(fields) {
  const payload = {}, errors = {};
  for (const [key, accepted] of Object.entries({transaction_type:Object.keys(REQUIRED_AMOUNTS), property_type:PROPERTY_TYPES, owner_role:OWNER_ROLES})) {
    if (!accepted.includes(fields[key])) errors[key] = '항목을 선택해 주세요.';
    else payload[key] = fields[key];
  }
  for (const [key,min,max] of [['address_text',5,200],['district',1,30],['owner_name',1,30],['description',0,1000]]) {
    const value = String(fields[key] ?? '').trim();
    if (characters(value) < min || characters(value) > max) errors[key] = `${min ? `${min}~` : '최대 '}${max}자로 입력해 주세요.`;
    else if (value) payload[key] = value;
  }
  const phone = String(fields.owner_phone ?? '').replace(/[ -]/g,'');
  if (!/^[0-9]{9,11}$/.test(phone)) errors.owner_phone = '연락 가능한 전화번호를 숫자 9~11자리로 입력해 주세요.';
  else payload.owner_phone = phone;
  for (const [key,label] of Object.entries(AMOUNTS)) {
    const value = String(fields[key] ?? '').trim();
    if (!value) {
      if (REQUIRED_AMOUNTS[payload.transaction_type]?.includes(key)) errors[key] = `${label}을(를) 입력해 주세요.`;
    } else if (!/^\d+$/.test(value) || BigInt(value) > 9223372036854775807n) errors[key] = '0 이상인 정수를 만원 단위로 입력해 주세요.';
    else payload[key] = BigInt(value).toString();
  }
  if (fields.area_m2 != null && fields.area_m2 !== '') {
    if (!/^\d{1,5}(\.\d{1,2})?$/.test(fields.area_m2) || Number(fields.area_m2) <= 0) errors.area_m2 = '0보다 큰 면적을 소수 둘째 자리까지 입력해 주세요.';
    else payload.area_m2 = Number(fields.area_m2);
  }
  if (fields.available_from) {
    const value = fields.available_from;
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000') || !Number.isFinite(+date) || date.toISOString().slice(0,10) !== value) errors.available_from = '유효한 날짜를 입력해 주세요.';
    else payload.available_from = value;
  }
  for (const key of ['privacy_consent','brokerage_consent']) {
    if (fields[key] !== true) errors[key] = '이 항목에 동의해 주세요.';
    else payload[key] = true;
  }
  return {payload,errors};
}
