import {$,el,link,shell,setMessage,requireResult} from './shared.mjs';
import {ENABLE_SIGN_IN,ENABLE_CONTRACTS} from './config.mjs';
import {parseInviteFragment,inviteContinuation,claimOutcome} from './tenancyContract.mjs';

const route = document.body.dataset.page;
const invite = route === 'invite';
const target = $('#contract-content');
const returnTo = `/jamsilsari/${route}.html`;
const login = () => link('로그인하고 계속하기',`login.html?return=${encodeURIComponent(returnTo)}`,'button primary');
const dashboard = () => link('내 계약으로 이동','dashboard.html','button');
function state(text,...actions) {
  target.replaceChildren(el('section',null,{class:'panel contract-state'}));
  target.firstChild.append(el('p',text),...actions);
}
function retry() {
  const button = el('button','다시 불러오기',{type:'button'});
  button.addEventListener('click',() => location.reload());
  return button;
}

function prepareInvite() {
  const hash = location.hash;
  const token = parseInviteFragment(hash);
  // Scrub before loading the auth client, including when the switches are off.
  if (hash || location.search) history.replaceState(null,'',returnTo);
  let storage;
  try {storage = window.sessionStorage;} catch {/* No persistent continuation available. */}
  const tab = inviteContinuation(storage);
  if (!ENABLE_SIGN_IN || !ENABLE_CONTRACTS) tab.clear();
  else if (hash) {tab.clear();if (token) tab.save(token);}
  return tab;
}

async function init(tab) {
  if (!ENABLE_SIGN_IN || !ENABLE_CONTRACTS) return;
  if (invite && !tab.read()) {
    state('이 탭에 유효한 초대가 없습니다. 초대 링크를 받은 탭으로 돌아가거나, 사무소에 새 링크를 요청하세요.',dashboard());
    return;
  }
  state('계정 정보를 확인하는 중입니다.');
  const {getClient,contractDataClient} = await import('./client.mjs');
  const client = getClient(true);
  let active = true, actor = null, loaded = false;
  const clear = () => {active = false;target.replaceChildren();setMessage('');};
  const isActive = () => active;
  window.addEventListener('pagehide',clear,{once:true});
  window.addEventListener('pageshow',event => {if (event.persisted) location.reload();});
  client.auth.onAuthStateChange((event,session) => {
    if (!loaded || !active || event === 'INITIAL_SESSION') return;
    if ((session?.user?.id ?? null) !== actor) {
      clear();
      if (invite && actor) tab.clear();
      state('로그인 계정이 바뀌었습니다. 다시 불러와 주세요.',retry());
    }
  });
  const session = async () => (await requireResult(client.auth.getSession()))?.session;
  const initial = await session();
  if (!active) return;
  loaded = true;
  actor = initial?.user?.id ?? null;
  if (!actor) {state(invite ? '초대를 수락하려면 로그인하세요.' : '계약을 보려면 로그인하세요.',login());return;}
  const dataForActor = async () => {
    const current = await session();
    if (!active || current?.user?.id !== actor || !current.access_token) throw new Error('Contract session changed');
    return contractDataClient(current.access_token);
  };
  const data = await dataForActor();
  const member = await requireResult(data.from('pf_members').select('user_id,display_name,deletion_requested_at').eq('user_id',actor).maybeSingle());
  if (!active) return;
  if (!member) {state('이름과 필수 동의를 먼저 등록해 주세요.',login());return;}
  if (member.user_id !== actor || member.deletion_requested_at) {
    if (invite) tab.clear();
    state('이 계정으로 계약 서비스를 이용할 수 없습니다.',link('계정으로 이동','me.html','button'));
    return;
  }
  if (invite) {
    const email = initial.user.email;
    if (!email) {state('이메일 주소를 확인할 수 없습니다. 계정에서 로그인 정보를 확인해 주세요.',link('계정으로 이동','me.html','button'));return;}
    const accept = el('button','이 계정으로 초대 수락',{type:'button',class:'primary'});
    const cancel = el('button','취소',{type:'button'});
    state('초대를 받은 계정인지 확인하세요.',el('p',`${member.display_name} · ${email}`,{class:'contract-identity'}),accept,' ',cancel);
    let pending = false;
    cancel.addEventListener('click',() => {
      if (pending) return;
      tab.clear();location.replace('me.html');
    });
    accept.addEventListener('click',async () => {
      if (pending || !active) return;
      pending = true;accept.setAttribute('aria-disabled','true');cancel.setAttribute('aria-disabled','true');
      setMessage('초대를 처리하는 중입니다.');
      let outcome = 'unknown';
      try {
        const scoped = await dataForActor();
        const token = tab.read();
        outcome = !token ? 'invalid' : !tab.clear() ? 'unknown' : await claimOutcome(scoped,token);
      } catch {tab.clear();}
      if (!active) return;
      setMessage('');
      state({claimed:'계약이 이 계정에 연결되었습니다.',invalid:'초대 링크를 사용할 수 없습니다. 사무소에 새 링크를 요청하세요.',unknown:'수락 결과를 확인할 수 없습니다. 다시 요청하기 전에 내 계약을 확인하세요.'}[outcome],dashboard());
      const result = target.querySelector('p');result.tabIndex = -1;result.focus();
    });
    return;
  }
  const {showDashboard} = await import('./tenancyDashboard.mjs');
  if (active) await showDashboard(target,actor,dataForActor,isActive);
}

const tab = invite ? prepareInvite() : null;
shell();
init(tab).catch(() => {
  // pagehide or an auth swap has already cleared the private view.
  if (target.textContent.includes('로그인 계정이 바뀌었습니다.') || !target.firstChild) return;
  state('계약 서비스를 불러오지 못했습니다.',retry());
});
