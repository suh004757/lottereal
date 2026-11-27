import {el,link,setMessage} from './shared.mjs';
import {AMOUNTS,PROPERTY_TYPES,REQUIRED_AMOUNTS} from './listingRequestForm.mjs';
import {tenancyKeyDates} from './tenancyKeyDates.mjs';
import {REPAIR_CATEGORIES,contractRole,readContracts,readRepairs,repairActions,submitRepair,setRepairStatus,submitRelist,validateRelist} from './tenancyContract.mjs';

const repairLabels = {open:'접수',acknowledged:'확인함',resolved:'해결됨'};
const transitionLabels = {acknowledged:'요청 확인',resolved:'해결로 표시'};
const panel = title => {
  const section = el('section',null,{class:'panel contract-panel'});
  section.append(el('h2',title));return section;
};
const dateText = value => value ? value.replaceAll('-','.') : '확인 필요';
const money = new Intl.NumberFormat('ko-KR');
const checkKey = (actor,contract,key) => `jamsilsari:check:${actor}:${contract.id}:${key}`;
function dateNode(value) {return value ? el('time',dateText(value),{datetime:value}) : el('span','확인 필요');}

function schedule(contract) {
  const section = panel('주요 일정');
  const rows = tenancyKeyDates(contract);
  section.append(el('p','기재된 계약 정보로 계산한 일반 안내입니다. 적용 여부와 실제 기한은 관할 기관이나 전문가에게 확인하세요.',{class:'fine'}));
  if (!rows.length) {section.append(el('p','이 거래 유형에는 계산된 일정이 없습니다.'));return section;}
  const items = el('ol',null,{class:'contract-dates'});
  const dateOf = row => row.window?.from ?? row.date ?? '9999-12-31';
  for (const row of rows.sort((a,b) => dateOf(a).localeCompare(dateOf(b)))) {
    const li = el('li');
    const when = el('p',null,{class:'contract-date'});
    when.append(row.window?.from && row.window?.to ? dateNode(row.window.from) : dateNode(row.date));
    if (row.window?.from && row.window?.to) when.append(' ~ ',dateNode(row.window.to));
    li.append(el('h3',row.label),when);
    if (row.provideBy) {const p = el('p','신고인에게 제공하는 기준일: ',{class:'fine'});p.append(dateNode(row.provideBy));li.append(p);}
    if (row.note) li.append(el('p',row.note,{class:'fine'}));
    li.append(link(row.basis,row.sourceUrl,'contract-reference'));
    items.append(li);
  }
  section.append(items);return section;
}

function checklist(actor,contract,alive) {
  const sale = contract.transaction_type === '매매';
  if (!sale && !['전세','월세'].includes(contract.transaction_type)) return null;
  const section = panel('신고 체크리스트');
  section.append(el('p','이 기기에서만 표시됩니다. 체크해도 신고가 접수되지는 않습니다.',{class:'fine'}));
  const tasks = sale ? [
    ['report','계약 내용과 신고 담당자를 확인했습니다.'],['funding','자금조달계획서 제출 대상인지 확인했습니다.'],['receipt','신고 접수 또는 신고필증을 확인했습니다.']
  ] : [
    ['report','임대차 신고 대상과 신고 담당자를 확인했습니다.'],['move','전입신고와 확정일자 절차를 확인했습니다.'],['receipt','해당 신고의 접수를 확인했습니다.']
  ];
  for (const [key,text] of tasks) {
    const storageKey = checkKey(actor,contract,key);
    const input = el('input',null,{type:'checkbox'});
    try {input.checked = localStorage.getItem(storageKey) === '1';} catch {input.disabled = true;}
    input.addEventListener('change',() => {
      if (!alive()) return;
      try {if (input.checked) localStorage.setItem(storageKey,'1');else localStorage.removeItem(storageKey);}
      catch {input.checked = !input.checked;setMessage('이 기기에 체크 상태를 저장하지 못했습니다.');}
    });
    const label = el('label',text,{class:'check'});label.prepend(input);section.append(label);
  }
  if (sale) section.append(el('div',null,{class:'contract-links'}));
  if (sale) section.lastChild.append(
    link('송파구 거래신고 안내','../reports/2026-10-12-songpa-home-sale-transaction-reporting.html','contract-reference'),
    link('자금조달계획서 준비 안내','../reports/2026-10-16-songpa-home-purchase-funding-plan-documents.html','contract-reference')
  );
  return section;
}

function field(label,control) {const node = el('label',label);node.append(control);return node;}
function choices(values,selected = '') {
  const select = el('select',null,{required:''});
  select.append(el('option','선택해 주세요',{value:''}));
  for (const value of values) select.append(el('option',value,{value}));
  select.value = selected;return select;
}
function formMessage() {return el('p','',{tabindex:'-1',class:'contract-form-message'});}
function report(node,text) {node.textContent = text;node.focus();}
function busy(button,on) {if (on) button.setAttribute('aria-disabled','true');else button.removeAttribute('aria-disabled');}

function repairs(actor,contract,getData,alive,locks,beginWrite) {
  const section = panel('수리 요청');
  const list = el('div',null,{class:'contract-repairs'});
  const message = formMessage();
  section.append(message,list);
  let pending = false;
  function render(rows) {
    if (!rows.length) {list.replaceChildren(el('p','등록된 수리 요청이 없습니다.'));return;}
    list.replaceChildren(...rows.map(row => {
      const article = el('article');
      const timestamp = new Date(row.created_at);
      const created = row.created_at && Number.isFinite(+timestamp) ? new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium'}).format(timestamp) : '날짜 확인 필요';
      article.append(el('h3',row.category),el('p',`${repairLabels[row.status] ?? '상태 확인 필요'} · ${created}`,{class:'fine'}),el('p',row.body,{class:'repair-body'}));
      const actions = el('div',null,{class:'actions'});
      for (const status of repairActions(contract,actor,row.status)) {
        const button = el('button',transitionLabels[status],{type:'button'});
        button.addEventListener('click',() => write(button,client => setRepairStatus(client,actor,contract,row,status),'수리 상태를 변경했습니다.'));
        actions.append(button);
      }
      article.append(actions);return article;
    }));
  }
  async function load() {
    list.replaceChildren(el('p','수리 요청을 불러오는 중입니다.',{role:'status'}));
    try {
      const client = await getData();
      if (!alive()) return;
      const rows = await readRepairs(client,actor,contract);
      if (alive()) render(rows);
    } catch {
      if (!alive()) return;
      const retry = el('button','수리 요청 다시 불러오기',{type:'button'});
      retry.addEventListener('click',load,{once:true});
      list.replaceChildren(el('p','수리 요청을 불러오지 못했습니다.'),retry);
    }
  }
  async function write(button,action,success,form) {
    if (!alive() || pending || (form && locks.has(contract.id))) return;
    const finish = beginWrite();
    if (!finish) return;
    pending = true;busy(button,true);
    if (form) for (const input of form.elements) if (input !== button) input.disabled = true;
    let sent = false;
    try {
      const client = await getData();
      if (!alive()) return;
      if (form) locks.add(contract.id);
      sent = true;
      await action(client);
      if (form) locks.delete(contract.id);
      if (!alive()) return;
      form?.reset();
      report(message,success);
      await load();
    } catch {
      if (!alive()) return;
      report(message,sent ? '처리 결과를 확인할 수 없습니다. 다시 보내기 전에 수리 요청 목록을 확인하세요.' : '계정 정보를 확인할 수 없습니다. 새로고침 후 다시 확인하세요.');
      if (sent) await load();
    } finally {
      pending = false;
      finish();
      if (alive()) {
        busy(button,Boolean(form && locks.has(contract.id)));
        if (form) for (const input of form.elements) if (input !== button) input.disabled = false;
      }
    }
  }
  if (contractRole(contract,actor) === 'tenant' && contract.status === 'active') {
    const form = el('form',null,{class:'form-stack contract-form'});
    const category = choices(REPAIR_CATEGORIES);
    const body = el('textarea',null,{required:'',rows:'3',maxlength:'1000','aria-describedby':'repair-help'});
    const submit = el('button','수리 요청 보내기',{class:'primary'});
    const help = el('p','수리가 필요한 곳과 증상을 적어 주세요. 주민등록번호, 계좌번호, 계약서는 보내지 마세요.',{class:'fine',id:'repair-help'});
    form.append(el('h3','새 수리 요청'),field('수리 종류 (필수)',category),field('수리 내용 (필수)',body),help,submit);
    if (locks.has(contract.id)) {busy(submit,true);form.append(el('p','이전 요청의 접수 여부를 목록에서 확인하세요.',{class:'fine'}));}
    form.addEventListener('submit',event => {
      event.preventDefault();
      const text = body.value.trim(), selected = category.value;
      if (!text) {report(message,'수리가 필요한 곳과 증상을 입력해 주세요.');return;}
      write(submit,client => submitRepair(client,actor,contract,selected,text),'수리 요청을 접수했습니다.',form);
    });
    section.append(form);
  }
  void load();return section;
}

function relist(actor,contract,getData,alive,locks,beginWrite) {
  const section = panel('매물 재등록 요청');
  section.append(el('p','중개사무소가 조건과 연락처를 확인합니다. 요청을 보내도 매물이 바로 게시되지는 않습니다.',{class:'fine'}));
  const form = el('form',null,{class:'form-stack contract-form',novalidate:''});
  const message = formMessage();
  const controls = {}, errors = {}, labels = {};
  function add(key,label,input) {
    controls[key] = input;
    const error = el('span','',{class:'field-error',id:`relist-error-${key}`,hidden:''});
    input.setAttribute('aria-describedby',error.id);
    const wrap = field(label,input);
    if (input.type === 'checkbox') {wrap.className = 'check';wrap.prepend(input);}
    errors[key] = error;labels[key] = wrap;
    form.append(wrap,error);
  }
  add('transaction_type','거래 유형 (필수)',choices(Object.keys(REQUIRED_AMOUNTS),contract.transaction_type));
  add('property_type','매물 종류 (필수)',choices(PROPERTY_TYPES));
  const address = el('input',null,{maxlength:'200',autocomplete:'street-address'});address.value = contract.address_label;
  add('address_text','표시 주소 (동·호수 제외, 필수)',address);
  add('district','지역 (필수)',el('input',null,{maxlength:'30'}));
  for (const [key,name] of Object.entries(AMOUNTS)) add(key,`${name} (만원)`,el('input',null,{inputmode:'numeric',maxlength:'16'}));
  function amountRequirements() {
    const required = REQUIRED_AMOUNTS[controls.transaction_type.value] ?? [];
    for (const [key,label] of Object.entries(AMOUNTS)) {
      controls[key].required = required.includes(key);
      labels[key].firstChild.textContent = `${label} (만원${controls[key].required ? ', 필수' : ''})`;
    }
  }
  controls.transaction_type.addEventListener('change',amountRequirements);amountRequirements();
  add('available_from','입주 가능일',el('input',null,{type:'date'}));
  add('area_m2','면적 (㎡, 소수 둘째 자리까지)',el('input',null,{inputmode:'decimal',maxlength:'8'}));
  add('description','기타 조건 (민감한 정보 제외)',el('textarea',null,{rows:'3',maxlength:'1000'}));
  add('owner_phone','연락처 (필수, 숫자 9~11자리)',el('input',null,{type:'tel',autocomplete:'tel',maxlength:'16'}));
  add('privacy_consent','매물 접수·전화 확인을 위한 개인정보 처리에 동의합니다 (필수).',el('input',null,{type:'checkbox'}));
  add('brokerage_consent','롯데공인중개사사무소에 중개를 의뢰합니다 (필수).',el('input',null,{type:'checkbox'}));
  const submit = el('button','재등록 요청 보내기',{class:'primary'});
  form.append(message,submit);section.append(form);
  let sent = locks.get(contract.id), pending = false;
  if (sent) {busy(submit,true);message.textContent = sent;}
  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (pending || sent || !alive()) return;
    const fields = Object.fromEntries(Object.entries(controls).map(([key,input]) => [key,input.type === 'checkbox' ? input.checked : input.value]));
    const validation = validateRelist(fields).errors;
    for (const [key,error] of Object.entries(errors)) {
      error.textContent = validation[key] ?? '';error.hidden = !validation[key];
      if (validation[key]) controls[key].setAttribute('aria-invalid','true');else controls[key].removeAttribute('aria-invalid');
    }
    const first = Object.keys(validation)[0];
    if (first) {message.textContent = '표시된 항목을 확인해 주세요.';controls[first].focus();return;}
    const finish = beginWrite();
    if (!finish) return;
    pending = true;busy(submit,true);message.textContent = '요청을 보내는 중입니다.';
    for (const input of Object.values(controls)) input.disabled = true;
    let attempted = false;
    try {
      const client = await getData();
      if (!alive()) return;
      attempted = true;
      locks.set(contract.id,'요청 결과를 확인하는 중입니다.');
      const result = await submitRelist(client,actor,contract,fields);
      sent = result === 'duplicate' ? '이미 검토 중이거나 접수된 재등록 요청이 있습니다.' : '재등록 요청을 접수했습니다. 중개사무소가 확인한 뒤 연락드립니다.';
      if (alive() && result === 'received') {form.reset();amountRequirements();}
    } catch {
      if (attempted) sent = '접수 결과를 확인할 수 없습니다. 다시 보내기 전에 중개사무소에 접수 여부를 확인하세요.';
      else if (alive()) report(message,'계정 정보를 확인할 수 없습니다. 새로고침 후 다시 확인하세요.');
    } finally {
      pending = false;
      finish();
      if (sent) locks.set(contract.id,sent);
      if (alive()) {
        for (const input of Object.values(controls)) input.disabled = false;
        busy(submit,Boolean(sent));if (sent) report(message,sent);
      }
    }
  });
  return section;
}

export async function showDashboard(target,actor,getData,isActive) {
  target.textContent = '계약을 불러오는 중입니다.';
  const client = await getData();
  if (!isActive()) return;
  const contracts = await readContracts(client,actor);
  if (!isActive()) return;
  if (!contracts.length) {
    target.replaceChildren(el('p','이 계정에 연결된 계약이 없습니다. 전달받은 초대 링크를 확인하세요.',{class:'panel'}));return;
  }
  const select = el('select');
  for (const row of contracts) {
    const role = contractRole(row,actor) === 'landlord' ? '임대인·매도인' : '임차인·매수인';
    select.append(el('option',`${row.address_label} · ${row.transaction_type} · ${dateText(row.contract_date)} · ${role}`,{value:row.id}));
  }
  const details = el('div',null,{class:'contract-grid'});
  const picker = panel('연결된 계약');picker.append(field('선택한 계약',select));
  target.replaceChildren(picker,details);
  const repairLocks = new Set(), relistLocks = new Map();
  function beginWrite() {
    if (select.disabled) return null;
    select.disabled = true;
    return () => {select.disabled = false;};
  }
  let generation = 0;
  function render() {
    const selected = ++generation;
    const alive = () => isActive() && generation === selected;
    setMessage('');
    const contract = contracts.find(row => row.id === select.value);
    if (!contract) {details.replaceChildren();return;}
    const role = contractRole(contract,actor);
    const summary = panel(contract.address_label);
    summary.classList.add('contract-summary');
    summary.append(el('p',`${contract.transaction_type} · ${contract.status === 'active' ? '진행 중' : '종료'}`,{class:'badge'}));
    const facts = el('dl');
    for (const [label,value] of [['계약일',dateText(contract.contract_date)],['시작일',dateText(contract.start_date)],...(contract.end_date ? [['종료일 (기재)',dateText(contract.end_date)]] : []),
      ...Object.entries(AMOUNTS).filter(([key]) => contract[key] != null).map(([key,label]) => [label,`${money.format(contract[key])}만원`])]) {
      const pair = el('div');pair.append(el('dt',label),el('dd',value));facts.append(pair);
    }
    summary.append(facts);
    const right = el('div',null,{class:'contract-side'});
    const tasks = checklist(actor,contract,alive);
    if (tasks) right.append(tasks);
    right.append(repairs(actor,contract,getData,alive,repairLocks,beginWrite));
    if (role === 'landlord') right.append(relist(actor,contract,getData,alive,relistLocks,beginWrite));
    details.replaceChildren(summary,schedule(contract),right);
  }
  select.addEventListener('change',render);render();
}
