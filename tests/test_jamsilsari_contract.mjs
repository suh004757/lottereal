import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {safeReturn} from '../public/jamsilsari/js/platformAuth.mjs';
import {ENABLE_CONTRACTS,ENABLE_SIGN_IN} from '../public/jamsilsari/js/config.mjs';
import {parseInviteFragment,inviteContinuation,claimOutcome,readContracts,readRepairs,repairActions,submitRepair,setRepairStatus,submitRelist,validateRelist} from '../public/jamsilsari/js/tenancyContract.mjs';

const prefix = '/jamsilsari/';
const token = 'a'.repeat(48), owner = '00000000-0000-4000-8000-000000000001', tenant = owner.slice(0,-1)+'2', outsider = owner.slice(0,-1)+'3';
const id = owner.slice(0,-1)+'4', repair = owner.slice(0,-1)+'5';
const row = {id,landlord_user_id:owner,tenant_user_id:tenant,status:'active'};

test('private routes are default off with noindex and no-referrer', () => {
  assert.equal(ENABLE_CONTRACTS,false);
  assert.equal(ENABLE_SIGN_IN,false);
  for (const file of ['invite.html','dashboard.html']) {
    const html = readFileSync(new URL(`../public/jamsilsari/${file}`,import.meta.url),'utf8');
    assert.match(html,/name="robots" content="noindex,nofollow"/);
    assert.match(html,/name="referrer" content="no-referrer"/);
  }
});

test('only exact contract returns and exact M3/SDD fragments are accepted', () => {
  for (const route of ['invite.html','dashboard.html']) {
    assert.equal(safeReturn(prefix+route),prefix+route);
    for (const suffix of [`#${token}`,'?x=y','/','%23']) assert.equal(safeReturn(prefix+route+suffix),prefix+'me.html');
  }
  for (const hash of [`#${token}`,`#token=${token}`]) assert.equal(parseInviteFragment(hash),token);
  for (const hash of [token,`#token=${token}&x=1`,`#${token.toUpperCase()}`,`#${token}\n`,'#main']) assert.equal(parseInviteFragment(hash),null);
});

test('tab continuation expires, rejects malformed input and can be consumed once', () => {
  const values = new Map();
  const storage = {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const tab = inviteContinuation(storage);
  tab.save(token,100);
  assert.equal(tab.read(101),token);
  assert.equal(tab.read(100+20*60*1000),null);
  assert.equal(values.size,0);
  tab.save(token,100);
  tab.clear();
  assert.equal(tab.read(101),null);
  tab.save('wrong',100);
  assert.equal(tab.read(101),null);
});

test('claim sends only token, collapses terminal rejection, and does not retry unknown writes', async () => {
  for (const [response,outcome] of [[{data:id},'claimed'],[{error:{code:'22023',message:'invalid_or_expired'}},'invalid'],[{error:{code:'',message:'offline'}},'unknown']]) {
    let calls = 0;
    const rpc = (name,args) => {calls++;assert.equal(name,'claim_invite');assert.deepEqual(args,{token});return response;};
    assert.equal(await claimOutcome({rpc},token),outcome);
    assert.equal(calls,1);
  }
  assert.equal(await claimOutcome({rpc:()=>assert.fail('invalid input must not reach the RPC')},'bad'),'invalid');
});

test('three isolated synthetic identities only see participant rows, including an admin-like response', async () => {
  for (const identity of [owner,tenant,outsider]) {
    const client = {from(name) {
      assert.equal(name,'pf_tenancies');
      return {select(fields) {
        assert.ok(!fields.includes('*') && !fields.includes('created_by'));
        return {or(filter) {
          assert.equal(filter,`landlord_user_id.eq.${identity},tenant_user_id.eq.${identity}`);
          return {order:()=>({data:[row]})}; // intentionally unfiltered synthetic response
        }};
      }};
    }};
    const contracts = await readContracts(client,identity);
    assert.deepEqual(contracts.map(r=>r.id),identity === outsider ? [] : [id]);
    if (identity === outsider) await assert.rejects(readRepairs({from:()=>assert.fail('no repair read')},identity,row));
  }
});

test('repair controls and writes follow the participant matrix', async () => {
  assert.deepEqual(repairActions(row,owner,'open'),['acknowledged','resolved']);
  assert.deepEqual(repairActions(row,tenant,'open'),['resolved']);
  assert.deepEqual(repairActions(row,outsider,'open'),[]);
  assert.deepEqual(repairActions(row,owner,'resolved'),[]);
  await submitRepair({from(name) {assert.equal(name,'pf_repair_requests');return {insert(body) {
    assert.deepEqual(body,{tenancy_id:id,category:'누수',body:'합성 요청'});return {data:null};
  }};}},tenant,row,'누수',' 합성 요청 ');
  await assert.rejects(submitRepair({},owner,row,'누수','합성 요청'));
  await assert.rejects(submitRepair({},tenant,{...row,status:'ended'},'누수','합성 요청'));
  await setRepairStatus({rpc(name,args) {assert.equal(name,'set_repair_status');assert.deepEqual(args,{id:repair,status:'acknowledged'});return {data:null};}},owner,row,{id:repair,tenancy_id:id,status:'open'},'acknowledged');
  await assert.rejects(setRepairStatus({},tenant,row,{id:repair,tenancy_id:id,status:'open'},'acknowledged'));
});

const relist = {transaction_type:'전세',property_type:'아파트',address_text:'송파구 합성동',district:'송파구',deposit_manwon:'6000',area_m2:'84.95',owner_phone:'010-0000-0000',privacy_consent:true,brokerage_consent:true,owner_name:'ignored',owner_role:'ignored'};
test('relist sends an allowlisted JSON body, requires both consents, handles a duplicate distinctly', async () => {
  const {payload,errors} = validateRelist(relist);
  assert.deepEqual(errors,{});
  assert.deepEqual(payload,{transaction_type:'전세',property_type:'아파트',address_text:'송파구 합성동',district:'송파구',deposit_manwon:6000,area_m2:84.95,owner_phone:'01000000000',privacy_consent:true,brokerage_consent:true});
  assert.ok(validateRelist({...relist,privacy_consent:false,brokerage_consent:false,deposit_manwon:'9007199254740993'}).errors.deposit_manwon);
  assert.deepEqual(Object.keys(validateRelist({...relist,privacy_consent:false,brokerage_consent:false}).errors),['privacy_consent','brokerage_consent']);
  await assert.rejects(submitRelist({},tenant,row,relist));
  assert.equal(await submitRelist({rpc(name,args) {assert.equal(name,'request_relist');assert.deepEqual(args,{tenancy_id:id,changes:payload});return {error:{code:'23505'}};}},owner,row,relist),'duplicate');
});
