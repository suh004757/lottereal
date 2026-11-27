import {validateRequest,AMOUNTS} from './listingRequestForm.mjs';
import {requireResult} from './shared.mjs';

export const REPAIR_CATEGORIES = ['누수','난방·온수','전기','설비','기타'];
export const isUuid = value => typeof value === 'string' && value.length === 36 && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const isToken = value => typeof value === 'string' && value.length === 48 && /^[0-9a-f]{48}$/.test(value);
export function parseInviteFragment(hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#')) return null;
  const value = hash.slice(hash.startsWith('#token=') ? 7 : 1);
  return isToken(value) ? value : null;
}
export function inviteContinuation(storage) {
  const key = 'jamsilsari:pending-invite';
  const ttl = 20 * 60 * 1000;
  const clear = () => {try {storage.removeItem(key);} catch {return false;} return true;};
  return {clear,save(token,now = Date.now()) {
    if (!isToken(token)) return false;
    try {storage.setItem(key,JSON.stringify({token,expires:now+ttl}));return true;}
    catch {return false;}
  },read(now = Date.now()) {
    let record;
    try {record = JSON.parse(storage.getItem(key) ?? 'null');} catch {clear();return null;}
    if (isToken(record?.token) && Number.isFinite(record.expires) && record.expires > now && record.expires <= now+ttl) return record.token;
    clear();return null;
  }};
}
export async function claimOutcome(client,token) {
  if (!isToken(token)) return 'invalid';
  try {
    const {data,error} = await client.rpc('claim_invite',{token});
    if (error?.code === '22023' && error.message === 'invalid_or_expired') return 'invalid';
    return !error && isUuid(data) ? 'claimed' : 'unknown';
  } catch {return 'unknown';}
}

export function contractRole(row,actor) {
  if (!isUuid(row?.id) || !isUuid(actor)) return null;
  if (row.landlord_user_id === actor) return 'landlord';
  return row.tenant_user_id === actor ? 'tenant' : null;
}
export async function readContracts(client,actor) {
  if (!isUuid(actor)) throw new Error('Identity unavailable');
  const rows = await requireResult(client.from('pf_tenancies')
    .select('id,transaction_type,address_label,contract_date,start_date,end_date,deposit_manwon,monthly_rent_manwon,price_manwon,landlord_user_id,tenant_user_id,status')
    .or(`landlord_user_id.eq.${actor},tenant_user_id.eq.${actor}`).order('contract_date',{ascending:false}));
  return rows.filter(row => contractRole(row,actor));
}
export async function readRepairs(client,actor,contract) {
  if (!contractRole(contract,actor)) throw new Error('Repair unavailable');
  const rows = await requireResult(client.from('pf_repair_requests').select('id,tenancy_id,category,body,status,created_at')
    .eq('tenancy_id',contract.id).order('created_at',{ascending:false}));
  return rows.filter(row => row.tenancy_id === contract.id && isUuid(row.id));
}
export function repairActions(contract,actor,status) {
  const role = contractRole(contract,actor);
  if (!role || !['open','acknowledged'].includes(status)) return [];
  return role === 'landlord' && status === 'open' ? ['acknowledged','resolved'] : ['resolved'];
}
export async function submitRepair(client,actor,contract,category,text) {
  const body = text.trim();
  if (contractRole(contract,actor) !== 'tenant' || contract.status !== 'active' || !REPAIR_CATEGORIES.includes(category) || !body || [...body].length > 1000) throw new Error('Invalid repair');
  await requireResult(client.from('pf_repair_requests').insert({tenancy_id:contract.id,category,body}));
}
export async function setRepairStatus(client,actor,contract,repair,status) {
  if (!isUuid(repair.id) || repair.tenancy_id !== contract.id || !repairActions(contract,actor,repair.status).includes(status)) throw new Error('Invalid transition');
  await requireResult(client.rpc('set_repair_status',{id:repair.id,status}));
}
export function validateRelist(fields) {
  const {payload,errors} = validateRequest({...fields,owner_name:'회원',owner_role:'소유자'});
  delete payload.owner_name;
  delete payload.owner_role;
  for (const key of Object.keys(AMOUNTS)) {
    if (!(key in payload)) continue;
    const value = Number(payload[key]);
    if (Number.isSafeInteger(value)) payload[key] = value;
    else {delete payload[key];errors[key] = '안전하게 전송할 수 있는 범위의 금액을 입력해 주세요.';}
  }
  return {payload,errors};
}
export async function submitRelist(client,actor,contract,fields) {
  if (contractRole(contract,actor) !== 'landlord') throw new Error('Relist unavailable');
  const {payload,errors} = validateRelist(fields);
  if (Object.keys(errors).length) throw new Error('Invalid relist');
  const {data,error} = await client.rpc('request_relist',{tenancy_id:contract.id,changes:payload});
  if (error?.code === '23505') return 'duplicate';
  if (error || !isUuid(data)) throw new Error('Relist not confirmed');
  return 'received';
}
