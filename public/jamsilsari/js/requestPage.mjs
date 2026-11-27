import {$,el,requireResult} from './shared.mjs';
import {ENABLE_REQUESTS} from './config.mjs';
import {AMOUNTS,PROPERTY_TYPES,OWNER_ROLES,REQUIRED_AMOUNTS,validateRequest} from './listingRequestForm.mjs';
export function showRequest(getAnonymousClient) {
  if (!ENABLE_REQUESTS) return;
  const form = $('#request-form'), controls = new Map();
  const summary = el('p',null,{tabindex:'-1',hidden:''});
  const fields = (name,label,options,attrs = {}) => {
    const wrap = el('label',label);
    const input = el(Array.isArray(options) ? 'select' : options === 'textarea' ? 'textarea' : 'input',null,{name,...attrs});
    if (Array.isArray(options)) input.append(el('option','선택해 주세요',{value:''}),...options.map(text => el('option',text)));
    if (attrs.type === 'checkbox') {wrap.className = 'check';wrap.prepend(input);} else wrap.append(input);
    const box = el('div');
    const error = el('span',null,{class:'field-error',id:`error-${name}`});
    box.append(wrap,error); input.setAttribute('aria-describedby',error.id);
    controls.set(name,{label:wrap,input,error,box});
    return box;
  };
  const group = (title,...children) => {const fieldset = el('fieldset');fieldset.append(el('legend',title),...children);return fieldset;};
  const required = {required:''};
  form.append(summary,
    group('매물 조건',fields('transaction_type','거래 유형 (필수)',Object.keys(REQUIRED_AMOUNTS),required),
      fields('property_type','매물 종류 (필수)',PROPERTY_TYPES,required),
      fields('district','지역·동 (필수)','input',{...required,maxlength:'30'}),
      fields('address_text','매물 주소 (필수)','input',{...required,maxlength:'200'}),
      ...Object.entries(AMOUNTS).map(([key,label]) => fields(key,`${label} (만원)`,'input',{inputmode:'numeric',maxlength:'19'})),
      fields('area_m2','면적 (㎡)','input',{inputmode:'decimal'}),fields('available_from','입주 희망일','input',{type:'date'}),
      fields('description','전할 내용','textarea',{maxlength:'1000',rows:'3'})),
    group('의뢰인과 연락처',fields('owner_role','의뢰인 구분 (필수)',OWNER_ROLES,required),
      fields('owner_name','이름 (필수)','input',{...required,autocomplete:'name',maxlength:'30'}),
      fields('owner_phone','전화번호 (필수)','input',{...required,type:'tel',autocomplete:'tel',maxlength:'20'})),
    group('동의',el('p','이름·전화번호·매물 정보는 의뢰 확인과 접수 처리에 사용합니다.'),
      fields('privacy_consent','등록 요청 처리를 위한 개인정보 수집·이용에 동의합니다 (필수).','input',{...required,type:'checkbox'}),
      fields('brokerage_consent','이 매물의 중개를 롯데부동산에 의뢰하며, 확인 후 광고하는 데 동의합니다 (필수).','input',{...required,type:'checkbox'})));
  const submit = el('button','등록 요청 보내기',{type:'submit',class:'primary'});
  form.append(submit);
  const submitCopy = submit.textContent;
  const type = controls.get('transaction_type').input;
  function changeType() {
    const shown = {매매:['price_manwon'],전세:['deposit_manwon'],월세:['deposit_manwon','monthly_rent_manwon'],단기임대:Object.keys(AMOUNTS)};
    for (const [key,label] of Object.entries(AMOUNTS)) {
      const entry = controls.get(key);
      const needed = Boolean(REQUIRED_AMOUNTS[type.value]?.includes(key));
      entry.box.hidden = !shown[type.value]?.includes(key);
      entry.input.disabled = entry.box.hidden;
      entry.input.required = needed;
      entry.label.firstChild.textContent = `${label} (만원)${needed ? ' · 필수' : ''}`;
      if (entry.box.hidden) paintField(entry,'');
    }
  }
  function values() {
    const raw = Object.fromEntries(new FormData(form));
    raw.privacy_consent = controls.get('privacy_consent').input.checked;
    raw.brokerage_consent = controls.get('brokerage_consent').input.checked;
    return raw;
  }
  function paintField({input,error},message) {
    error.textContent = message;
    if (message) input.setAttribute('aria-invalid','true'); else input.removeAttribute('aria-invalid');
  }
  function tell(text, focus = true) {summary.hidden = false;summary.textContent = text;if (focus) summary.focus();}
  type.addEventListener('change',changeType);
  changeType();
  form.addEventListener('input',event => {
    const entry = controls.get(event.target.name);
    if (entry?.error.textContent) paintField(entry,validateRequest(values()).errors[event.target.name] || '');
  });
  let pending = false, receiptUncertain = false;
  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (pending || receiptUncertain) return;
    const {payload,errors} = validateRequest(values());
    for (const [key,entry] of controls) paintField(entry,errors[key] || '');
    const invalid = [...controls].filter(([key]) => errors[key]);
    if (invalid.length) {tell(`${invalid.length}개 항목을 확인해 주세요.`,false);invalid[0][1].input.focus();return;}
    summary.hidden = true;
    pending = true; submit.setAttribute('aria-disabled','true'); submit.textContent = '보내는 중…';
    try {
      const client = await getAnonymousClient();
      await requireResult(client.from('pf_listing_requests').insert(payload)); // No select/returning on anon INSERT.
      form.reset();
      const receipt = el('section',null,{class:'panel',tabindex:'-1'});
      receipt.append(el('h2','등록 요청을 받았습니다'),el('p','롯데부동산이 전화로 확인한 뒤 게시합니다.'));
      form.replaceWith(receipt); receipt.focus();
    } catch (error) {
      if (error?.code === 'P0001') tell('잠시 접수할 수 없습니다. 나중에 다시 시도하거나 전화해 주세요.');
      else if (/^(22|23)/.test(error?.code || '')) tell('보낸 조건이 접수 기준에 맞지 않습니다. 입력을 확인하거나 전화해 주세요.');
      else {
        receiptUncertain = true;
        tell('접수 여부를 확인하지 못했습니다. 중복 접수를 피하려면 다시 보내기 전에 전화로 확인해 주세요.');
      }
    } finally {
      pending = false;
      if (!receiptUncertain) submit.removeAttribute('aria-disabled');
      submit.textContent = submitCopy;
    }
  });
  $('#request-closed').hidden = true; form.hidden = false;
}
