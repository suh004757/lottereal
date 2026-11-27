import {$,el,link,readIds,saveIds,setMessage,requireResult} from './shared.mjs';
import {ENABLE_CONTRACTS,ENABLE_SIGN_IN} from './config.mjs';
import {inviteContinuation} from './tenancyContract.mjs';
import {safeReturn,syncFavorites,startGoogle,sendMagicLink} from './platformAuth.mjs';
import {isListingId,selectListings} from './platformListings.mjs';
import {card} from './browsePage.mjs';

async function currentMember(client) {
  const session = (await requireResult(client.auth.getSession()))?.session;
  if (!session?.user?.id) return null;
  const id = session.user.id;
  const member = await requireResult(client.from('pf_members').select('user_id,display_name,deletion_requested_at').eq('user_id',id).maybeSingle());
  return {id,member};
}
export async function accountState(client,repo) {
  if (!ENABLE_SIGN_IN) return null;
  const state = await currentMember(client);
  if (!state?.member) return null;
  const {id,member} = state;
  const table = () => client.from('pf_favorites');
  const read = async () => (await requireResult(table().select('listing_id').eq('user_id',id))).map(row => row.listing_id).filter(isListingId);
  const add = async listingId => {
    const {error} = await table().upsert({user_id:id,listing_id:listingId},{onConflict:'user_id,listing_id',ignoreDuplicates:true});
    return !error;
  };
  const original = readIds('favorites');
  let result;
  if (member.deletion_requested_at || !original.length) result = {saved:await read(),pending:original};
  else {
    // Avoid repeatedly trying stale, withdrawn, or closed favorites.
    const visible = new Set((await repo.all()).verifications.map(row => row.listing_id));
    result = await syncFavorites(original,read,listingId => visible.has(listingId) && add(listingId));
    // Preserve favorites changed in another tab while the writes were pending.
    const synced = new Set(original.filter(value => !result.pending.includes(value)));
    saveIds('favorites',readIds('favorites').filter(value => !synced.has(value)));
  }
  const ids = new Set(result.saved);
  return {member,ids,pending:result.pending.length,async toggle(listingId) {
    if (ids.has(listingId)) {await requireResult(table().delete().eq('user_id',id).eq('listing_id',listingId));ids.delete(listingId);}
    else if (!member.deletion_requested_at && await add(listingId)) ids.add(listingId);
    else throw new Error('Favorite unavailable');
  }};
}
function inputLabel(label,attrs) {const wrap = el('label',label), input = el('input',null,attrs);wrap.append(input);return [wrap,input];}
function actionForm(form,button,action) {
  let pending = false;
  const label = button.textContent;
  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (pending) return;
    pending = true;button.textContent = '처리 중…';button.setAttribute('aria-disabled','true');
    try {await action();}
    catch {setMessage('처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');}
    finally {pending = false;button.textContent = label;button.removeAttribute('aria-disabled');}
  });
}
export async function showLogin(client) {
  if (!ENABLE_SIGN_IN) return;
  const returnTo = safeReturn(new URLSearchParams(location.search).get('return'));
  const inviteLogin = ENABLE_CONTRACTS && returnTo === '/jamsilsari/invite.html';
  const target = $('#login-controls');
  const identity = await currentMember(client);
  // Supabase processes PKCE before getSession resolves. Keep only the safe return.
  history.replaceState(null,'',`login.html?return=${encodeURIComponent(returnTo)}`);
  if (identity?.member) {location.replace(returnTo);return;}
  if (identity) {
    const form = el('form',null,{class:'form-stack'});
    const [name,input] = inputLabel('이름 (필수)',{required:'',maxlength:'30',autocomplete:'name'});
    const [terms,termsBox] = inputLabel('서비스 약관에 동의합니다 (필수).',{required:'',type:'checkbox'});
    const [privacy,privacyBox] = inputLabel('개인정보 처리에 동의합니다 (필수).',{required:'',type:'checkbox'});
    for (const [wrap,box] of [[terms,termsBox],[privacy,privacyBox]]) {wrap.className = 'check';wrap.prepend(box);}
    const submit = el('button','가입 완료',{class:'primary'});
    form.append(el('h2','회원 정보 입력'),name,terms,privacy,submit);
    actionForm(form,submit,async () => {
      const display_name = input.value.trim();
      if (!display_name) {setMessage('이름을 입력해 주세요.');input.focus();return;}
      await requireResult(client.from('pf_members').insert({user_id:identity.id,display_name}));
      location.replace(returnTo);
    });
    const cancel = el('button','가입 취소',{type:'button'});
    cancel.addEventListener('click',async () => {
      try {
        await requireResult(client.auth.signOut({scope:'local'}));
        if (inviteLogin) {
          inviteContinuation(window.sessionStorage).clear();
          location.replace('/jamsilsari/me.html');
        } else location.replace(returnTo);
      }
      catch {setMessage('로그아웃하지 못했습니다. 다시 시도해 주세요.');}
    });
    target.append(form,cancel);
  } else {
    const google = el('button','구글로 계속하기',{type:'button',class:'primary'});
    google.addEventListener('click',async () => {
      if (google.getAttribute('aria-disabled') === 'true') return;
      google.setAttribute('aria-disabled','true');
      try {await requireResult(startGoogle(client,returnTo));}
      catch {setMessage('구글 로그인을 열지 못했습니다. 다시 시도해 주세요.');google.removeAttribute('aria-disabled');}
    });
    const form = el('form',null,{class:'form-stack'});
    const [email,input] = inputLabel('이메일',{type:'email',required:'',autocomplete:'email'});
    const submit = el('button','이메일로 로그인 링크 받기');
    form.append(email,submit);
    actionForm(form,submit,async () => {
      await requireResult(sendMagicLink(client,input.value.trim(),returnTo));
      setMessage(inviteLogin ? '같은 브라우저에서 이메일 링크로 로그인하세요. 새 탭이 열리면 이 탭으로 돌아와 아래 버튼을 눌러 주세요.' : '이메일을 확인해 주세요. 로그인 링크는 같은 브라우저에서 열어 주세요.');
    });
    target.append(google,form);
    if (inviteLogin) target.append(link('로그인 후 초대로 돌아가기',returnTo,'button'));
  }
  target.hidden = false;
  $('#login-closed').hidden = true;
}
export async function showMe(repo,account,memberClient) {
  const fav = $('#favorites'), recent = $('#recent');
  const lists = {favorites:fav,recent};
  const empty = {favorites:'찜한 매물이 없습니다.',recent:'최근 본 매물이 없습니다.'};
  const showEmpty = () => {for (const [key,target] of Object.entries(lists)) target.textContent = empty[key];};
  const currentIds = kind => kind === 'favorites' && account ? [...new Set([...account.ids,...readIds(kind)])] : readIds(kind);
  if (account) {
    const section = $('#account');
    section.hidden = false;
    section.append(el('h2',`${account.member.display_name}님`));
    if (account.pending) section.append(el('p','일부 찜은 계정으로 옮기지 못해 이 기기에 남아 있습니다.'));
    const logout = el('button','로그아웃',{type:'button'});
    logout.addEventListener('click',async () => {
      try {await requireResult(memberClient.auth.signOut({scope:'local'}));location.replace('me.html');}
      catch {setMessage('로그아웃하지 못했습니다. 다시 시도해 주세요.');}
    });
    section.append(logout);
    if (account.member.deletion_requested_at) section.append(el('p','회원 탈퇴 요청을 받았습니다.'));
    else {
      const actions = el('form',null,{class:'actions'});
      const [label,confirm] = inputLabel('탈퇴를 요청합니다.',{type:'checkbox',required:''});
      label.className = 'check'; label.prepend(confirm);
      const submit = el('button','회원 탈퇴 요청');
      actions.append(label,submit);
      actionForm(actions,submit,async () => {
        await requireResult(memberClient.rpc('request_account_deletion'));
        actions.replaceWith(el('p','회원 탈퇴 요청을 받았습니다. 계정은 별도 절차로 처리됩니다.'));
      });
      section.append(actions);
    }
    if (ENABLE_CONTRACTS && !account.member.deletion_requested_at) section.append(link('내 계약','dashboard.html','button'));
  }
  if (!currentIds('favorites').length && !currentIds('recent').length) {showEmpty();return;}
  const {listings,verifications} = await repo.all();
  const rows = new Map(selectListings(listings,verifications).map(row => [row.id,row]));
  const render = () => {
    for (const [key,target] of Object.entries(lists)) {
      const visible = currentIds(key).map(id => rows.get(id)).filter(Boolean);
      if (!visible.length) target.textContent = currentIds(key).length ? '지금 볼 수 있는 매물이 없습니다.' : empty[key];
      else target.replaceChildren(...visible.map(row => card(row,account && (account.ids.has(row.id) || !readIds('favorites').includes(row.id)) ? account : null,'h3')));
    }
  };
  render();
  $('#main').addEventListener('favorite-change',() => {
    render();
    const next = fav.querySelector('button') || recent.querySelector('button') || $('h1');
    if (next.tagName === 'H1') next.tabIndex = -1;
    next.focus();
  });
}
