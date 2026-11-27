import {ENABLE_SIGN_IN} from './config.mjs';
import {$,el,link,shell,setMessage} from './shared.mjs';
import {browseRepository} from './platformListings.mjs';
import {showDetail,showIndex} from './browsePage.mjs';
import {showRequest} from './requestPage.mjs';
import {showLogin,showMe,accountState} from './accountPage.mjs';

shell();
const page = document.body.dataset.page;
const getClient = () => import('./client.mjs').then(module => module.getClient);
async function init() {
  if (page === 'login') {if (ENABLE_SIGN_IN) await showLogin((await getClient())(true));return;}
  if (page === 'request') {showRequest(asyncAnonymous());return;}
  const browse = page === 'index' || page === 'listing';
  if (browse) setMessage('매물을 불러오는 중입니다.');
  // Defer the database client until a route actually needs it.
  const repo = Object.fromEntries(['all','fetchVerification','fetchListing'].map(name => [name,async (...args) => {
    const create = await getClient();
    return browseRepository(create())[name](...args);
  }]));
  let memberClient, account, accountUnavailable = false;
  if (ENABLE_SIGN_IN) {
    try {memberClient = (await getClient())(true);account = await accountState(memberClient,repo);}
    catch {accountUnavailable = true;}
  }
  if (page === 'index') await showIndex(repo,account);
  if (page === 'listing') await showDetail(repo,account);
  if (page === 'me') await showMe(repo,account,memberClient);
  setMessage(accountUnavailable ? '계정 정보를 불러오지 못했습니다. 이 기기에서 매물 탐색과 찜을 계속할 수 있습니다.' : '');
}
function asyncAnonymous() {return async () => (await getClient())();}
init().catch(() => {
  setMessage(page === 'login' ? '로그인을 시작할 수 없습니다.' : '매물을 불러오지 못했습니다.');
  const retry = el('button','다시 불러오기',{type:'button'});
  retry.addEventListener('click',() => location.reload());
  $('#message').after(retry, ' ', link('매물 목록으로','index.html','button'));
});
