import test from 'node:test';
import assert from 'node:assert/strict';
import {tenancyKeyDates} from '../public/jamsilsari/js/tenancyKeyDates.mjs';

const lease = {transaction_type:'월세',contract_date:'2024-02-29',start_date:'2024-03-01',end_date:'2026-08-31',deposit_manwon:6001,monthly_rent_manwon:30};
const dates = row => Object.fromEntries(tenancyKeyDates(row).map(item => [item.key,item]));

test('lease move, return, reporting and clamped renewal dates', () => {
  const result = dates(lease);
  assert.deepEqual(result.renewal_window.window,{from:'2026-02-28',to:'2026-06-30'});
  assert.equal(result.move_in_and_fixed_date.date,'2024-03-01');
  assert.equal(result.deposit_return.date,'2026-08-31');
  assert.equal(result.rent_report.date,'2024-03-30');
  assert.equal(dates({...lease,end_date:'2028-08-31'}).renewal_window.window.from,'2028-02-29');
});

test('short written term is marked; exact two years is not', () => {
  assert.ok(dates({...lease,end_date:'2026-02-28'}).renewal_window.note);
  assert.equal(dates({...lease,end_date:'2026-03-01'}).renewal_window.note,undefined);
});

test('reporting thresholds are strict, independent, and unknown is not zero', () => {
  assert.equal(dates({...lease,deposit_manwon:6000}).rent_report,undefined);
  assert.ok(dates({...lease,deposit_manwon:6000,monthly_rent_manwon:31}).rent_report.date);
  assert.ok(dates({...lease,deposit_manwon:null,monthly_rent_manwon:31}).rent_report.date);
  assert.equal(dates({...lease,deposit_manwon:null}).rent_report.date,null);
});

test('sale reporting and conditional funding plan cross the year boundary', () => {
  const result = dates({transaction_type:'매매',contract_date:'2026-12-15'});
  assert.deepEqual(Object.keys(result),['trade_report','funding_plan']);
  assert.equal(result.trade_report.date,'2027-01-14');
  assert.equal(result.funding_plan.date,'2027-01-14');
  assert.equal(result.funding_plan.provideBy,'2027-01-09');
  assert.ok(result.funding_plan.note);
});

test('invalid calendar dates do not roll over', () => {
  assert.equal(dates({...lease,contract_date:'2026-02-29'}).rent_report.date,null);
  assert.deepEqual(tenancyKeyDates({contract_type:'unknown'}),[]);
});
