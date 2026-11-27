import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRequest} from '../public/jamsilsari/js/listingRequestForm.mjs';
const base = {property_type:'아파트',address_text:'서울 송파구 잠실동',district:'잠실동',owner_role:'소유자', owner_name:'테스트',owner_phone:'010-0000-0000',privacy_consent:true,brokerage_consent:true};
test('matches M1 transaction-type requirements, including zero and optional short stay', () => {
  for (const [transaction_type, required] of [['매매',['price_manwon']],['전세',['deposit_manwon']],['월세',['deposit_manwon','monthly_rent_manwon']],['단기임대',[]]]) {
    const entry = {...base, transaction_type};
    assert.deepEqual(Object.keys(validateRequest(entry).errors),required);
    for (const key of required) entry[key] = '0';
    assert.deepEqual(validateRequest(entry).errors,{});
    assert.equal(validateRequest(entry).payload.owner_phone,'01000000000');
  }
});
test('requires both consents and rejects invalid types, amounts, and date', () => {
  const {errors,payload} = validateRequest({...base, transaction_type:'월세', deposit_manwon:'-1',monthly_rent_manwon:'1.2', privacy_consent:false,brokerage_consent:false, available_from:'2026-02-30', status:'published'});
  assert.deepEqual(new Set(Object.keys(errors)),new Set(['deposit_manwon','monthly_rent_manwon','available_from','privacy_consent','brokerage_consent']));
  assert.ok(!('status' in payload));
});
