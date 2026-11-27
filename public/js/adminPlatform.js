const tiers = { owner_listed: '소유자 의뢰', site_visit: '임장 완료', tenant_listed: '임차인 의뢰' };
const routes = { '방문': '방문', '전화': '전화' };
const scopes = { unknown: '미확인', exclusive: '전속', shared: '공동·중복' };
const types = { '매매': '매매', '전세': '전세', '월세': '월세', '단기임대': '단기임대' };
const statuses = { new: '새 요청', reviewing: '검토 중', published: '게시됨', rejected: '반려됨' };
const intakeStatuses = { new: '새 접수', reviewed: '확인 완료', converted: '등록 요청으로 전환됨', discarded: '보관 종료' };
const intakeKinds = { listing_offer: '매물 내놓기', seeker: '매물 찾기', other: '원문 확인 필요' };
const intakeUnavailable = '대리 접수 집계 미연결';
const channels = { zigbang: '직방', platform: '잠실살이', other: '기타' };
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const pageSize = 12;
const failure = '처리 결과를 확인할 수 없습니다. 다시 실행하기 전에 목록을 확인해 주세요.';

function verification(row) {
  if (!Object.hasOwn(tiers, row.tier)) throw new Error('확인 등급을 선택해 주세요.');
  if (!Object.hasOwn(routes, row.intake_channel)) throw new Error('접촉 경로를 선택해 주세요.');
  if (!Object.hasOwn(scopes, row.listing_scope)) throw new Error('중복 여부를 선택해 주세요.');
  if (row.tier === 'tenant_listed' && row.landlord_consent_confirmed !== true) {
    throw new Error('임차인 의뢰는 임대인의 의뢰·동의 확인이 필요합니다.');
  }
  return {
    tier: row.tier, intake_channel: row.intake_channel, listing_scope: row.listing_scope,
    landlord_consent_confirmed: row.landlord_consent_confirmed === true,
    note: null, transaction_type: null
  };
}

export async function recordBatch(rpc, rows, defaults) {
  if (!rows.length) throw new Error('매물을 하나 이상 선택해 주세요.');
  const seen = new Set();
  const payloads = rows.map(row => {
    if (!uuid.test(row.listing_id)) throw new Error('매물 ID가 올바르지 않습니다.');
    if (seen.has(row.listing_id.toLowerCase())) throw new Error('중복 매물이 있습니다.');
    seen.add(row.listing_id.toLowerCase());
    return { listing_id: row.listing_id, ...verification({ ...defaults, ...row }) };
  });
  const results = [];
  for (const payload of payloads) {
    let ok = false;
    try {
      await rpc('admin_record_listing_verification', payload);
      ok = true;
    } catch {
      // A lost response may have committed. Never retry a write automatically.
    }
    results.push({ id: payload.listing_id, ok });
  }
  return results;
}

export function requestDraft(row) {
  return {
    title: `${row.district || ''} ${row.transaction_type || ''}`.trim(),
    district: row.district || '', transactionType: row.transaction_type || '',
    price: row.price_manwon ?? '', deposit: row.deposit_manwon ?? '', monthlyRent: row.monthly_rent_manwon ?? ''
  };
}

export function inviteLink(token, base) {
  if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) throw new Error('초대 링크를 표시할 수 없습니다.');
  return new URL(`../jamsilsari/invite.html#${token}`, base).href;
}

// The dashboard never supplies a publication adapter. Isolated tests may inject
// one explicitly; no URL, preference or browser storage can enable this path.
export function createAdminPlatformApi(client, requireAdmin, { publishFixture } = {}) {
  async function rpc(name, args) {
    await requireAdmin();
    if (!client || name === 'admin_publish_listing_request') throw new Error('플랫폼 요청을 사용할 수 없습니다.');
    return unwrap(await client.rpc(name, args));
  }
  async function list(build) {
    await requireAdmin();
    if (!client) throw new Error('플랫폼 요청을 사용할 수 없습니다.');
    return unwrap(await build(client)) || [];
  }
  return {
    rpc, list, canPublish: Boolean(publishFixture),
    async publish(id, values, confirmation) {
      if (!publishFixture) throw new Error('H6 승인 전에는 새 매물을 게시할 수 없습니다.');
      if (!uuid.test(id) || !Object.hasOwn(types, values.transactionType)) throw new Error('등록 요청을 확인해 주세요.');
      const overrides = Object.fromEntries(['title', 'district', 'transactionType', 'price', 'deposit', 'monthlyRent'].map(key => [key, values[key] ?? '']));
      const verified = { ...verification(confirmation), transaction_type: values.transactionType };
      await requireAdmin();
      return publishFixture('admin_publish_listing_request', { request_id: id, overrides, verification: verified });
    }
  };
}

function unwrap({ data, error }) {
  if (error) throw new Error(failure);
  return data;
}

function el(tag, text = '', attrs = {}) {
  const node = document.createElement(tag);
  node.textContent = text;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function button(text, action, primary = false) {
  const node = el('button', text, { type: 'button', class: primary ? 'admin-primary' : 'admin-btn admin-btn--ghost' });
  if (action) node.addEventListener('click', action);
  return node;
}

function select(name, options, placeholder) {
  const field = el('select', '', { name });
  if (placeholder) field.append(el('option', placeholder, { value: '' }));
  for (const [value, label] of Object.entries(options)) field.append(el('option', label, { value }));
  return field;
}

function input(name, type = 'text', attrs = {}) {
  return el('input', '', { name, type, ...attrs });
}

function label(text, field) {
  const wrapper = el('label');
  wrapper.append(el('span', text), ' ', field);
  return wrapper;
}

function grid(...fields) {
  const node = el('div', '', { class: 'admin-form-grid' });
  node.append(...fields);
  return node;
}

function sectionForm() {
  return el('form', '', { class: 'admin-form' });
}

function panel(parent, title) {
  const node = el('fieldset');
  node.append(el('legend', title));
  parent.append(node);
  return node;
}

function editingFields({ inherit = false, tenantOnly = false } = {}) {
  const tier = select('tier', tiers, inherit ? '공통 등급 적용' : tenantOnly ? '등급 선택' : null);
  const route = select('intake_channel', routes, inherit ? '공통 경로 적용' : '접촉 경로 선택');
  const scope = select('listing_scope', scopes, inherit ? '공통 중복 여부 적용' : null);
  const consent = input('landlord_consent_confirmed', 'checkbox');
  return {
    tier,
    node: grid(label('확인 등급', tier), label('접촉 경로', route), label('중복 여부', scope), label('임대인 의뢰·동의 확인', consent)),
    read: () => ({ ...Object.fromEntries([[tier.name, tier.value], [route.name, route.value], [scope.name, scope.value]].filter(([, value]) => value)), landlord_consent_confirmed: consent.checked })
  };
}

// Explicit mount-time opt-in only. The existing dashboard never supplies it.
export function mountAdminPlatform({ api, openRequest, root = document, enableIntake = false }) {
  const views = Object.fromEntries(['pf-requests', 'pf-listings', 'pf-contracts', 'pf-metrics'].map(id => [id, root.getElementById(`${id}-body`)]));
  const intakeSection = enableIntake === true ? root.getElementById('pf-intake-section') : null;
  if (intakeSection) {
    intakeSection.querySelector(':scope > p')?.remove();
    const intakeBody = el('div');
    intakeSection.append(intakeBody);
    views['pf-intake'] = intakeBody;
  }
  const count = root.getElementById('pf-request-count');
  let active = '';
  let secretEpoch = 0;
  let busy = false;
  let loadGeneration = 0;
  let pendingReload = false;
  const pages = { 'pf-requests': 0, 'pf-listings': 0, 'pf-contracts': 0, 'pf-metrics': 0, 'pf-intake': 0 };
  const statusesByView = {};
  const content = {};
  const secrets = el('div', '', { 'aria-live': 'polite' });

  function clearInvites() {
    secretEpoch++;
    secrets.replaceChildren();
  }
  window.addEventListener('pagehide', clearInvites);
  if (intakeSection) window.addEventListener('pagehide', () => {
    if (active === 'pf-intake') {
      ++loadGeneration;
      content[active].replaceChildren();
      content[active].removeAttribute('aria-busy');
      message(active, '새로고침으로 접수 목록을 다시 불러와 주세요.');
    }
  });

  for (const [id, view] of Object.entries(views)) {
    statusesByView[id] = el('p', '', { role: 'status' });
    content[id] = el('div');
    view.append(button('새로고침', () => load(id)), statusesByView[id], content[id]);
  }
  views['pf-contracts'].insertBefore(secrets, content['pf-contracts']);
  const requestFilter = select('status_filter', statuses);
  requestFilter.addEventListener('change', () => { pages['pf-requests'] = 0; load('pf-requests'); });
  views['pf-requests'].insertBefore(label('요청 상태', requestFilter), statusesByView['pf-requests']);

  function message(id, text) { statusesByView[id].textContent = text; }

  function paginate(id, length) {
    const page = pages[id];
    const controls = el('p');
    if (page > 0) controls.append(button('이전', () => { pages[id]--; load(id); }));
    controls.append(` ${page + 1} 페이지 `);
    if (length > pageSize) controls.append(button('다음', () => { pages[id]++; load(id); }));
    content[id].append(controls);
  }

  async function load(id, preserveMessage = false) {
    if (!views[id] || id !== active) return;
    if (busy) { pendingReload = true; return; }
    const generation = ++loadGeneration;
    const current = () => generation === loadGeneration && active === id;
    const target = content[id];
    target.replaceChildren();
    target.setAttribute('aria-busy', 'true');
    if (!preserveMessage) message(id, '불러오는 중…');
    try {
      const render = await loaders[id]();
      if (!current()) return;
      if (!preserveMessage) message(id, '');
      render(target);
    } catch {
      if (current()) message(id, preserveMessage
        ? `${statusesByView[id].textContent} 목록을 다시 불러오지 못했습니다.`
        : '데이터를 불러오지 못했습니다. 관리자 세션과 플랫폼 연결을 확인해 주세요.');
    } finally {
      if (generation === loadGeneration) target.removeAttribute('aria-busy');
    }
  }

  async function mutate(id, task, success, { reload = true } = {}) {
    if (busy || active !== id || content[id].getAttribute('aria-busy') === 'true') return;
    busy = true;
    const controls = [...views[id].querySelectorAll('button, input, select, textarea')].filter(control => !control.disabled);
    controls.forEach(control => { control.disabled = true; });
    message(id, '저장 중…');
    let saved = false;
    try {
      const result = await task();
      message(id, typeof success === 'function' ? success(result) : success);
      saved = true;
    } catch {
      message(id, failure);
    } finally {
      controls.forEach(control => { control.disabled = control.hasAttribute('data-awaiting-reload'); });
      busy = false;
      if (pendingReload) {
        pendingReload = false;
        await load(active, active === id && saved);
      } else if (saved && reload && active === id) {
        await load(id, true);
      }
    }
  }

  function range(query, id) {
    const from = pages[id] * pageSize;
    return query.range(from, from + pageSize);
  }

  async function requests() {
    const id = 'pf-requests';
    const filter = requestFilter.value;
    // Query new rows separately for an exact count, independent of pagination.
    const [newCount, rows, intakeSummary] = await Promise.all([
      api.list(async db => {
        const { count: total, error } = await db.rpc('admin_list_listing_requests', { status_filter: 'new' }, { count: 'exact', head: true });
        return { data: total, error };
      }),
      api.list(db => range(db.rpc('admin_list_listing_requests', { status_filter: filter }).order('created_at', { ascending: false }).order('id'), id)),
      intakeSection ? api.rpc('admin_count_new_intake_items').then(total =>
        Number.isSafeInteger(total) && total >= 0 ? `대리 접수 ${total}건` : '대리 접수 집계 미확인'
      ).catch(() => '대리 접수 집계 미확인') : intakeUnavailable
    ]);
    return target => {
      count.textContent = `새 요청 ${Number.isInteger(newCount) ? `${newCount}건` : '미확인'} · ${intakeSummary}`;
      if (!rows.length) target.append(el('p', '이 페이지에 등록 요청이 없습니다.'));
      for (const row of rows.slice(0, pageSize)) {
        const card = panel(target, `${row.district} · ${row.transaction_type} · ${statuses[row.status] || '상태 미확인'}`);
        card.append(el('p', [row.property_type, row.address_text, row.owner_role, row.owner_name, row.owner_phone].filter(Boolean).join(' · ')));
        const price = [['가격', row.price_manwon], ['보증금', row.deposit_manwon], ['월 임대료', row.monthly_rent_manwon]].filter(([, value]) => value != null);
        if (price.length) card.append(el('p', price.map(([name, value]) => `${name} ${value}만원`).join(' · ')));
        if (row.description) card.append(el('p', row.description));
        if (row.reject_reason) card.append(el('p', `반려 사유: ${row.reject_reason}`));
        if (!['new', 'reviewing'].includes(row.status)) continue;
        if (row.status === 'new') card.append(button('검토 시작', () => mutate(id, () => api.rpc('admin_set_listing_request_status', { request_id: row.id, new_status: 'reviewing', reason: null }), '검토 중으로 변경했습니다.')));
        card.append(button('게시 초안 검토', () => openRequest({ id: row.id, ownerRole: row.owner_role, draft: requestDraft(row) })));
        const reject = sectionForm();
        const reason = input('reason', 'text', { required: '', maxlength: '300' });
        reject.append(label('반려 사유 (필수)', reason), el('button', '요청 반려', { type: 'submit', class: 'admin-btn admin-btn--ghost' }));
        reject.addEventListener('submit', event => {
          event.preventDefault();
          const value = reason.value.trim();
          if (!value) { message(id, '반려 사유를 입력해 주세요.'); reason.focus(); return; }
          mutate(id, () => api.rpc('admin_set_listing_request_status', { request_id: row.id, new_status: 'rejected', reason: value }), '요청을 반려했습니다.');
        });
        card.append(reject);
      }
      paginate(id, rows.length);
    };
  }

  async function listings() {
    const id = 'pf-listings';
    const rows = await api.list(db => range(db.rpc('admin_list_property_listings', {}).select('id,title,closed_at').is('closed_at', null).order('created_at', { ascending: false }).order('id'), id));
    const shown = rows.slice(0, pageSize);
    const history = await Promise.allSettled(shown.map(row => api.rpc('admin_list_listing_verifications', { listing_id: row.id })));
    return target => {
      if (!shown.length) { target.append(el('p', '이 페이지에 진행 중인 매물이 없습니다.')); paginate(id, rows.length); return; }
      const form = sectionForm();
      const common = editingFields();
      // Consent is attested per listing, never inherited from the common defaults.
      common.node.lastElementChild.remove();
      form.append(el('p', '선택한 매물에 공통 설정을 적용합니다. 매물별 설정에서 등급, 접촉 경로, 중복 여부를 바꿀 수 있습니다.'), common.node);
      const selectable = [];
      shown.forEach((row, index) => {
        const card = panel(form, row.title || '제목 없는 매물');
        if (history[index].status === 'rejected') { card.append(el('p', '확인 이력 조회 실패. 새로고침해 주세요.')); return; }
        const latest = history[index].value?.[0];
        const elapsed = latest ? Math.max(0, Math.floor((Date.now() - Date.parse(latest.verified_at)) / 86400000)) : null;
        card.append(el('p', latest ? `${tiers[latest.tier] || '플랫폼에서 내림'} · ${Number.isFinite(elapsed) ? `확인 후 ${elapsed}일` : '확인일 미확인'}` : '확인 기록 없음'));
        const checked = input('selected', 'checkbox');
        const fields = editingFields({ inherit: true });
        const result = el('p', '', { role: 'status' });
        const rowValues = () => ({ listing_id: row.id, ...fields.read() });
        selectable.push({ checked, rowValues, result, card });
        card.append(label('일괄 저장에 포함', checked), fields.node, result);
        if (latest && latest.tier !== 'withdrawn') {
          const reason = input('unlist_reason', 'text', { maxlength: '300' });
          card.append(button('임장 완료로 올리기', () => {
            fields.tier.value = 'site_visit';
            save([rowValues()]);
          }), label('내리기 사유 (선택)', reason), button('플랫폼에서 내리기', () => {
            mutate(id, () => api.rpc('admin_unlist_from_platform', { listing_id: row.id, reason: reason.value.trim() || null }), '플랫폼에서 내렸습니다. 기존 매물은 그대로 유지됩니다.');
          }));
        }
      });
      function save(selected) {
        const defaults = common.read();
        // Show validation errors before locking controls or sending any writes.
        try {
          if (!selected.length) throw new Error('매물을 하나 이상 선택해 주세요.');
          selected.forEach(row => verification({ ...defaults, ...row }));
        } catch (error) { message(id, error.message); return; }
        mutate(id, () => recordBatch(api.rpc, selected, defaults), outcomes => {
          const byId = new Map(outcomes.map(result => [result.id, result]));
          let successes = 0;
          for (const row of selectable) {
            const outcome = byId.get(row.rowValues().listing_id);
            if (!outcome) continue;
            row.checked.checked = false;
            row.result.textContent = outcome.ok ? '확인 기록 저장됨' : '결과 미확인 — 이력을 확인해 주세요.';
            if (outcome.ok) successes++;
            else row.card.querySelectorAll('input, select, button').forEach(control => control.setAttribute('data-awaiting-reload', ''));
          }
          return `저장 ${successes}건 · 미확인 ${outcomes.length - successes}건 — 최신 등급과 이력은 새로고침으로 확인해 주세요.`;
        }, { reload: false });
      }
      form.append(el('button', '선택한 매물 확인 기록 저장', { type: 'submit', class: 'admin-primary' }));
      form.addEventListener('submit', event => {
        event.preventDefault();
        save(selectable.filter(row => row.checked.checked).map(row => row.rowValues()));
      });
      target.append(form);
      paginate(id, rows.length);
    };
  }

  function displayInvites(entries, epoch) {
    if (active !== 'pf-contracts' || epoch !== secretEpoch) return;
    const links = entries.map(([role, token]) => [role, inviteLink(token, window.location.href)]);
    secrets.replaceChildren(el('p', '초대 링크는 이 화면에 한 번만 표시됩니다. 직접 전달해 주세요. 화면을 떠나면 사라집니다.'));
    for (const [role, url] of links) {
      const field = input('invite', 'text', { readonly: '', autocomplete: 'off' });
      field.value = url;
      secrets.append(label(`${role} 초대 링크`, field), button(`${role} 링크 복사`, async () => {
        try { await navigator.clipboard.writeText(url); if (epoch === secretEpoch) message('pf-contracts', '링크를 복사했습니다.'); }
        catch { if (epoch === secretEpoch) field.select(); }
      }));
    }
    secrets.append(button('초대 링크 숨기기', clearInvites));
  }

  async function contracts() {
    const id = 'pf-contracts';
    const rows = await api.list(db => range(db.from('pf_tenancies').select('id,transaction_type,address_label,start_date,end_date,status,landlord_user_id,tenant_user_id').order('created_at', { ascending: false }).order('id'), id));
    return target => {
      const form = sectionForm();
      const transaction = select('transaction_type', types, '거래 유형 선택');
      transaction.required = true;
      const end = input('end_date', 'date', { required: '' });
      transaction.addEventListener('change', () => {
        end.disabled = transaction.value === '매매';
        end.required = !end.disabled;
        if (end.disabled) end.value = '';
      });
      form.append(el('p', '동·호수 또는 계약서 원문, 주민번호, 계좌번호는 입력하지 마세요.'), grid(
        label('거래 유형 (필수)', transaction), label('표시 주소 (필수)', input('address_label', 'text', { required: '', minlength: '5', maxlength: '200', autocomplete: 'off' })),
        label('계약일 (필수)', input('contract_date', 'date', { required: '' })), label('시작일 (필수)', input('start_date', 'date', { required: '' })), label('종료일 (임대 필수)', end),
        ...[['price_manwon', '가격'], ['deposit_manwon', '보증금'], ['monthly_rent_manwon', '월 임대료']].map(([key, name]) => label(`${name} (만원)`, input(key, 'number', { min: '0', max: String(Number.MAX_SAFE_INTEGER), step: '1' })))
      ), el('button', '계약 생성 및 초대 발급', { type: 'submit', class: 'admin-primary' }));
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (busy) return;
        const data = new FormData(form);
        const payload = {
          listing_id: null, transaction_type: data.get('transaction_type'), address_label: data.get('address_label').trim(),
          contract_date: data.get('contract_date'), start_date: data.get('start_date'), end_date: data.get('end_date') || null
        };
        for (const key of ['price_manwon', 'deposit_manwon', 'monthly_rent_manwon']) payload[key] = data.get(key) === '' ? null : Number(data.get(key));
        if ([...payload.address_label].length < 5 || (payload.end_date && payload.end_date <= payload.start_date)) {
          message(id, '표시 주소는 5자 이상, 종료일은 시작일보다 뒤여야 합니다.'); return;
        }
        clearInvites();
        const epoch = secretEpoch;
        mutate(id, async () => {
          const data = await api.rpc('admin_create_tenancy', { payload });
          displayInvites([['임대인', data.landlord_token], ['임차인', data.tenant_token]], epoch);
        }, '계약을 생성했습니다.');
      });
      target.append(form);
      if (!rows.length) target.append(el('p', '이 페이지에 계약이 없습니다.'));
      for (const row of rows.slice(0, pageSize)) {
        const card = panel(target, `${row.address_label} · ${row.transaction_type}`);
        card.append(el('p', `${row.start_date} ~ ${row.end_date || '—'} · ${row.status === 'active' ? '진행 중' : '종료'}`));
        if (row.status !== 'active') continue;
        for (const [role, labelText] of [['landlord', '임대인'], ['tenant', '임차인']]) {
          if (row[`${role}_user_id`]) { card.append(el('p', `${labelText} 연결됨`)); continue; }
          card.append(button(`${labelText} 초대 재발급`, () => {
            if (busy || !window.confirm('재발급하면 기존 초대 링크가 무효가 됩니다. 계속할까요?')) return;
            clearInvites();
            const epoch = secretEpoch;
            mutate(id, async () => {
              const token = await api.rpc('admin_reissue_invite', { tenancy_id: row.id, role });
              displayInvites([[labelText, token]], epoch);
            }, '새 초대 링크를 발급했습니다.');
          }));
        }
        card.append(button('계약 종료', () => {
          if (busy || !window.confirm('이 계약을 종료할까요? 미사용 초대 링크도 무효가 됩니다.')) return;
          clearInvites();
          mutate(id, () => api.rpc('admin_end_tenancy', { tenancy_id: row.id }), '계약을 종료했습니다.');
        }));
      }
      paginate(id, rows.length);
    };
  }

  async function metrics() {
    const id = 'pf-metrics';
    const rows = await api.list(db => range(db.from('pf_channel_monthly').select('month,channel,ad_spend_krw,contracts,note').order('month', { ascending: false }).order('channel'), id));
    return target => {
      const form = sectionForm();
      const month = input('month', 'month', { required: '', pattern: '[0-9]{4}-(0[1-9]|1[0-2])', placeholder: 'YYYY-MM' });
      form.append(el('p', '적합 문의 · 방문 약속: 미확인 (현재 DB에서 저장을 지원하지 않습니다). 같은 월과 채널에 저장하면 기존 값이 갱신됩니다.'), grid(
        label('월 (YYYY-MM, 필수)', month), label('채널', select('channel', channels)),
        label('광고비 (원, 필수)', input('ad_spend_krw', 'number', { required: '', min: '0', max: String(Number.MAX_SAFE_INTEGER), step: '1' })),
        label('계약 수 (필수)', input('contracts', 'number', { required: '', min: '0', max: '2147483647', step: '1' })),
        label('메모 (개인정보 제외)', input('note', 'text', { maxlength: '1000' }))
      ), el('button', '월별 지표 저장', { type: 'submit', class: 'admin-primary' }));
      form.addEventListener('submit', event => {
        event.preventDefault();
        const data = new FormData(form);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month.value) || month.value.startsWith('0000')) {
          message(id, '월을 YYYY-MM 형식으로 입력해 주세요.'); month.focus(); return;
        }
        mutate(id, () => api.rpc('admin_set_channel_monthly', {
          month: `${month.value}-01`, channel: data.get('channel'), ad_spend_krw: Number(data.get('ad_spend_krw')),
          contracts: Number(data.get('contracts')), note: data.get('note').trim() || null
        }), '월별 지표를 저장했습니다.');
      });
      target.append(form);
      if (!rows.length) target.append(el('p', '이 페이지에 저장된 지표가 없습니다.'));
      for (const row of rows.slice(0, pageSize)) {
        const card = panel(target, `${row.month.slice(0, 7)} · ${channels[row.channel] || '기타'}`);
        card.append(el('p', `광고비 ${row.ad_spend_krw}원 · 계약 ${row.contracts}건`));
        if (row.note) card.append(el('p', row.note));
      }
      paginate(id, rows.length);
    };
  }

  async function intake() {
    const id = 'pf-intake';
    const rows = await api.rpc('admin_list_intake_items', { page_offset: pages[id] * pageSize });
    if (!Array.isArray(rows)) throw new Error(failure);
    return target => {
      if (!rows.length) target.append(el('p', '이 페이지에 대리 접수가 없습니다.'));
      for (const row of rows.slice(0, pageSize)) {
        const kind = Object.hasOwn(intakeKinds, row.kind) ? intakeKinds[row.kind] : '종류 미확인';
        const status = Object.hasOwn(intakeStatuses, row.status) ? intakeStatuses[row.status] : '상태 미확인';
        const card = panel(target, `${kind} · ${status}`);
        const received = new Date(row.created_at);
        card.append(el('p', [Number.isFinite(received.getTime()) ? received.toLocaleString('ko-KR') : '', row.intake_channel].filter(Boolean).join(' · ')));
        const fields = { transaction_type: '거래 유형', district: '지역', price_manwon: '가격 (만원)',
          deposit_manwon: '보증금 (만원)', monthly_rent_manwon: '월 임대료 (만원)', available_from: '입주 가능일' };
        for (const [key, name] of Object.entries(fields)) {
          const value = row.parsed?.[key];
          if (typeof value === 'string' || Number.isSafeInteger(value)) card.append(el('p', `${name}: ${value}`));
        }
        const details = el('details');
        details.append(el('summary', '원문 및 연락처 보기'));
        if (row.contact_name || row.contact_phone) details.append(el('p', [row.contact_name, row.contact_phone].filter(Boolean).join(' · ')));
        details.append(el('p', row.raw_text ?? '보관 기한이 지난 원문은 표시하지 않습니다.', { style: 'white-space: pre-wrap; overflow-wrap: anywhere' }));
        card.append(details);
        if (row.status !== 'new' || !uuid.test(row.id)) continue;
        function mark(newStatus, confirmation) {
          if (!window.confirm(confirmation)) return;
          mutate(id, async () => {
            card.querySelectorAll('button').forEach(control => control.setAttribute('data-awaiting-reload', ''));
            await api.rpc('admin_set_intake_status', { item_id: row.id, new_status: newStatus });
          }, '접수 상태를 저장했습니다.');
        }
        card.append(button('확인 완료', () => mark('reviewed', '이 접수를 확인 완료로 표시할까요?')),
          button('보관 종료', () => mark('discarded', '이 접수의 보관을 종료할까요? 원문은 보관 기한에 따라 정리됩니다.')));
      }
      paginate(id, rows.length);
    };
  }

  const loaders = { 'pf-requests': requests, 'pf-listings': listings, 'pf-contracts': contracts, 'pf-metrics': metrics, 'pf-intake': intake };

  return {
    activate(id) {
      if (id !== active) {
        if (active === 'pf-contracts') clearInvites();
        if (active === 'pf-requests') { content[active].replaceChildren(); count.textContent = intakeSection ? '대리 접수 집계 미확인' : intakeUnavailable; }
        if (active === 'pf-intake' && intakeSection) content[active].replaceChildren();
        if (views[active]) content[active].removeAttribute('aria-busy');
        ++loadGeneration;
      }
      active = id;
      return load(id);
    },
    refreshRequests: () => load('pf-requests'),
    prepareRequestFields(container, ownerRole) {
      const fields = editingFields({ tenantOnly: true });
      fields.tier.required = api.canPublish;
      if (ownerRole === '거주 임차인') {
        fields.tier.value = 'tenant_listed';
        fields.tier.disabled = true;
      }
      container.replaceChildren(fields.node);
      return fields.read;
    }
  };
}
