import {$,el,link,callLink,listingLink,unavailable,readIds,saveIds,setMessage} from './shared.mjs';
import {selectListings,completedListings,loadDetail,listingPrice,monthlyCosts,periodCosts,transactionType,mapEnabled} from './platformListings.mjs';
import {TIERS} from './listingStatus.mjs';
import {KAKAO_MAP_JS_KEY,MAP_CSP_APPROVED} from './config.mjs';
import {safeImageUrl} from '../../js/publicRenderSecurity.mjs';
import {formatWon,SHORTSTAY_LISTING_ID} from '../../js/utils/leaseQuote.mjs';
const formatter = new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric'});
const shortDate = new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'});
const regions = row => [row.city,row.district].filter(Boolean).join(' ');
const STAMP_LABEL = {site_visit:'임장 확인',owner_listed:'소유자 의뢰',tenant_listed:'임차인 의뢰'};
export const stampDate = iso => shortDate.formatToParts(new Date(iso)).filter(part => part.type === 'month' || part.type === 'day').map(part => part.value).join('.');
// The stamp is decorative; tags and the date line carry the same facts as text.
function stamp(status) {
  const kind = status.needsReview ? 'stamp old' : status.tier === 'site_visit' ? 'stamp' : 'stamp pen';
  const node = el('p',STAMP_LABEL[status.tier] || '확인',{class:kind,'aria-hidden':'true'});
  node.append(el('b',stampDate(status.verifiedAt)));
  return node;
}
function tags(status) {
  const list = el('ul',null,{class:'tags'});
  list.append(el('li',status.tierLabel,{class:'tag'}));
  if (status.needsReview) list.append(el('li',status.label,{class:'tag warn'}));
  if (status.scopeLabel) list.append(el('li',status.scopeLabel,{class:status.scopeLabel === '중복 게재' ? 'tag warn' : 'tag only'}));
  return list;
}
function checkedAt(status) {
  const wrap = el('p','마지막 확인 ',{class:'checked'});
  wrap.append(el('time',formatter.format(new Date(status.verifiedAt)),{datetime:status.verifiedAt}),`, ${status.ageDays === 0 ? '오늘' : `${status.ageDays}일 전`}`);
  return wrap;
}
function favorite(row, account) {
  const button = el('button',null,{type:'button',class:'fav'});
  function paint() {
    const active = account ? account.ids.has(row.id) : readIds('favorites').includes(row.id);
    button.textContent = active ? '찜 해제' : '찜하기';
    button.setAttribute('aria-label',`${row.title || '매물'} ${button.textContent}`);
    button.setAttribute('aria-pressed',String(active));
  }
  paint();
  button.addEventListener('click',async () => {
    if (button.getAttribute('aria-disabled') === 'true') return;
    try {
      const ids = readIds('favorites');
      if (account) {
        button.setAttribute('aria-disabled','true');
        await account.toggle(row.id);
      } else if (!saveIds('favorites',ids.includes(row.id) ? ids.filter(id => id !== row.id) : [...ids,row.id])) {
        setMessage('이 브라우저에서는 찜을 저장할 수 없습니다.');
        return;
      }
      paint();
      setMessage(button.getAttribute('aria-pressed') === 'true' ? '찜에 담았습니다.' : '찜에서 뺐습니다.');
      button.dispatchEvent(new Event('favorite-change',{bubbles:true}));
    } catch { setMessage('찜을 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
    finally { button.removeAttribute('aria-disabled'); }
  });
  return button;
}
const imageUrls = row => (Array.isArray(row.images) ? row.images : []).map(safeImageUrl).filter(Boolean);
export function card(row, account, level = 'h2') {
  const wrap = el('article',null,{class:'card'});
  const photo = el('figure',null,{class:'card-photo'});
  const [url] = imageUrls(row);
  if (url) photo.append(el('img',null,{src:url,alt:'',loading:'lazy',decoding:'async',referrerpolicy:'no-referrer'}));
  else { photo.classList.add('none'); photo.append(el('span',row.district || '사진 준비 중')); }
  const body = el('div',null,{class:'card-body'});
  const kind = el('p',null,{class:'card-kind'});
  kind.append(el('strong',transactionType(row) || '매물'),el('span',regions(row)));
  const heading = el(level);
  heading.append(link(row.title || '매물 상세',listingLink(row.id)));
  body.append(kind,heading,el('p',listingPrice(row),{class:'price'}),checkedAt(row.status),tags(row.status));
  const aside = el('div',null,{class:'card-aside'});
  aside.append(stamp(row.status),favorite(row,account));
  wrap.append(photo,body,aside);
  return wrap;
}
function noListings(filtered) {
  const wrap = el('section',null,{class:'empty-ledger'});
  const text = el('div');
  if (filtered) {
    text.append(el('h2','조건에 맞는 매물이 없습니다'),el('p','거래 유형이나 가격 조건을 바꾸거나, 조건을 지우고 다시 찾아보세요.'));
    wrap.append(text);
    return wrap;
  }
  text.append(el('h2','매물장을 채우는 중입니다'),
    el('p','확인을 마친 매물부터 하나씩 올리고 있어요. 찾는 조건을 알려 주시면 맞는 매물이 나오는 대로 연락드려요.'));
  const actions = el('div',null,{class:'actions'});
  actions.append(callLink('조건 전화로 말하기'),link('집 내놓기','request.html','button'));
  text.append(actions);
  wrap.append(text);
  return wrap;
}
export async function showIndex(repo, account) {
  const form = $('#filters'), price = form.elements.maxPrice, results = $('#results');
  const {listings,verifications} = await repo.all();
  const active = selectListings(listings,verifications);
  for (const district of [...new Set(active.map(row => row.district).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ko'))) form.elements.district.append(el('option',district));
  for (const [key,[label]] of Object.entries(TIERS)) form.elements.tier.append(el('option',label,{value:key}));
  let current = active;
  function render() {
    const type = form.elements.type.value;
    price.disabled = !type;
    if (!type) price.value = '';
    const unit = {매매:'매매가',전세:'보증금',월세:'월세',단기임대:'주 임대료'}[type];
    $('#price-help').textContent = unit ? `${type} 가격 기준: ${unit} (만원)` : '금액으로 검색하려면 거래 유형을 먼저 선택하세요.';
    const opts = {type,district:form.elements.district.value,tier:form.elements.tier.value,maxPrice:price.validity.valid && price.value !== '' ? price.valueAsNumber : null};
    current = selectListings(listings,verifications,opts);
    results.replaceChildren(...(current.length ? current.map(row => card(row,account)) : [noListings(Boolean(active.length))]));
    $('#count').textContent = active.length ? `${current.length}건, 최근 확인한 순서` : '';
    if (!$('#map').hidden) {
      $('#map').hidden = true;
      $('#map-button').setAttribute('aria-expanded','false');
      $('#map-button').textContent = '지도 보기';
    }
  }
  form.hidden = !active.length;
  const seal = $('#hero-seal');
  if (seal && active.length) {
    const latest = active.map(row => row.status.verifiedAt).sort().at(-1);
    seal.firstChild.textContent = '최근 확인';
    seal.querySelector('[data-latest]').textContent = stampDate(latest);
  }
  form.addEventListener('input',render);
  form.addEventListener('reset',() => setTimeout(render,0));
  form.addEventListener('submit',event => {event.preventDefault();render();});
  render();
  const done = completedListings(verifications);
  if (done.length) {
    const section = $('#completed');
    section.append(el('h2','거래완료'),...done.map(row => link('거래완료',listingLink(row.id),'button badge complete')));
    section.hidden = false;
  }
  if (active.length && mapEnabled({key:KAKAO_MAP_JS_KEY,cspApproved:MAP_CSP_APPROVED})) {
    const {enableMap} = await import('./platformMap.mjs');
    enableMap(() => current, KAKAO_MAP_JS_KEY);
  }
}
const locality = [
  [/잠실엘스|잠실 엘스|올림픽로 99(?:\D|$)/,'jamsil-els','잠실엘스'],
  [/리센츠|올림픽로 135(?:\D|$)/,'ricenz','리센츠'],
  [/트리지움|잠실로 62(?:\D|$)/,'trizium','트리지움'],
  [/레이크팰리스|잠실로 88(?:\D|$)/,'lake-palace','레이크팰리스'],
  [/잠실주공\s*5(?:단지)?/,'jamsil-jugong-5','잠실주공5단지'],
  [/헬리오시티|송파대로 345(?:\D|$)/,'helio-city','헬리오시티'],
];
function neighborhood(row) {
  // Do not infer a nearby complex from district alone.
  const match = locality.find(([pattern]) => pattern.test(`${row.title} ${row.address || ''}`));
  if (!match) return null;
  const section = el('section',null,{class:'panel'});
  section.append(el('h2','동네 자료'),link(`${match[2]} 실거래 요약`,`../apartments/${match[1]}.html`,'button'),
    link('잠실 아파트 관리비 비교','../reports/2026-10-11-jamsil-apartment-management-fee-comparison.html','button'));
  return section;
}
function costsPanel(row) {
  const type = transactionType(row);
  if (type !== '월세' && type !== '단기임대') return null;
  const panel = el('section',null,{class:'panel'});
  panel.append(el('h2',type === '단기임대' ? '4주 실부담 비용' : '월 실부담 비용'));
  const costs = monthlyCosts(row);
  const list = el('dl');
  for (const [label,value] of [[type === '단기임대' ? '임대료' : '월세',costs.rent],['관리비',costs.maintenance],['기타 고정비',costs.fixed],['합계',costs.monthly]]) {
    const line = el('div');
    line.append(el('dt',label),el('dd',value === null ? '확인 필요' : `${value.toLocaleString('ko-KR')}만원`));
    list.append(line);
  }
  panel.append(list,el('p','반환되는 보증금은 비용에 포함하지 않습니다.',{class:'fine'}));
  if (type === '월세') {
    const label = el('label','계약 기간 (개월)');
    const months = el('input',null,{type:'number',min:'1',max:'120',step:'1',value:'12'});
    const result = el('p',null,{role:'status'});
    const update = () => {result.textContent = `기간 합계: ${costs.monthly !== null && months.validity.valid && months.value ? `${(costs.monthly * months.valueAsNumber).toLocaleString('ko-KR')}만원` : '확인 필요'}`;};
    label.append(months); months.addEventListener('input', update); update(); panel.append(label,result);
  }
  if (type === '단기임대') {
    const result = el('p','기간 합계: 확인 필요',{role:'status'});
    if (row.id === SHORTSTAY_LISTING_ID) {
      const start = el('input',null,{type:'date'}), end = el('input',null,{type:'date'});
      const a = el('label','계약 시작일'), b = el('label','계약 종료일');
      a.append(start); b.append(end);
      const update = () => {
        const quote = periodCosts(row,start.value,end.value);
        result.textContent = quote ? `${quote.days}일 임대료·관리비 ${formatWon(quote.known)} · 청소비 ${formatWon(quote.cleaning)} · 기간 합계 ${quote.fixed === null ? '확인 필요' : formatWon(quote.known + quote.cleaning + quote.fixed * 10000)}` : '기간 합계: 확인 필요 (최소 7일)';
      };
      start.addEventListener('change',update); end.addEventListener('change',update); panel.append(a,b);
    }
    panel.append(result);
  }
  return panel;
}
export async function showDetail(repo,account) {
  const target = $('#detail');
  const id = new URLSearchParams(location.search).get('id');
  const row = await loadDetail(repo,id);
  if (!row) { target.append(unavailable()); return; }
  if (row.status.completed) {target.append(el('strong','거래완료',{class:'badge complete'})); return;}
  saveIds('recent',[id,...readIds('recent').filter(x => x !== id)].slice(0,20));
  $('h1').textContent = row.title || '매물 상세';
  const top = el('div',null,{class:'detail-top'}), facts = el('div');
  const kind = el('p',null,{class:'card-kind'});
  kind.append(el('strong',transactionType(row) || '매물'),el('span',regions(row)));
  facts.append(kind,el('p',listingPrice(row),{class:'price'}),checkedAt(row.status),tags(row.status));
  top.append(facts,stamp(row.status));
  target.append(top);
  const layout = el('div',null,{class:'detail-layout'}), media = el('div'), aside = el('aside',null,{'aria-label':'문의와 비용'});
  const photos = el('div',null,{class:'photos'});
  const urls = imageUrls(row);
  for (const [i,url] of urls.entries()) photos.append(el('img',null,{src:url,alt:`매물 사진 ${i + 1}`,loading:i ? 'lazy' : 'eager',decoding:'async',referrerpolicy:'no-referrer'}));
  media.append(urls.length ? photos : el('p','등록된 사진이 없습니다.',{class:'no-photo'}));
  const contact = el('section',null,{class:'panel contact-slip'});
  const actions = el('div',null,{class:'actions'});
  actions.append(callLink(),favorite(row,account));
  contact.append(el('h2','이 매물 문의'),el('p',row.status.explanation));
  if (row.status.notice) contact.append(el('p',row.status.notice));
  contact.append(actions); aside.append(contact);
  for (const panel of [costsPanel(row),neighborhood(row)]) if (panel) aside.append(panel);
  layout.append(media,aside); target.append(layout);
}
