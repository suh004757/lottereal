import {$,el} from './shared.mjs';
export function enableMap(getRows,key) {
  const button = $('#map-button'), region = $('#map');
  let sdk, generation = 0;
  function load() {
    if (!sdk) sdk = new Promise((resolve,reject) => {
      const script = el('script',null,{src:`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`});
      script.onload = () => {
        if (!window.kakao?.maps) reject(new Error('Map unavailable'));
        else window.kakao.maps.load(() => resolve(window.kakao.maps));
      };
      script.onerror = reject;
      document.head.append(script);
    }).catch(error => {sdk = null; throw error;});
    return sdk;
  }
  button.hidden = false;
  button.addEventListener('click',async () => {
    const request = ++generation;
    const open = region.hidden;
    button.setAttribute('aria-expanded',String(open));
    button.textContent = open ? '지도 닫기' : '지도 보기';
    region.hidden = !open;
    if (!open) return;
    region.textContent = '동별 지도를 불러오는 중입니다.';
    try {
      const maps = await load();
      if (generation !== request || region.hidden) return;
      const queries = new Set(getRows().flatMap(({city,district}) =>
        typeof city === 'string' && typeof district === 'string' && /^[가-힣 ]{2,24}$/.test(city) && /^[가-힣0-9]{2,16}동$/.test(district) ? [`${city} ${district}`] : []));
      if (!queries.size) {region.textContent = '표시할 동 위치가 없습니다.'; return;}
      const geocoder = new maps.services.Geocoder();
      const positions = await Promise.all([...queries].map(query => new Promise(resolve => {
        geocoder.addressSearch(query,(rows,status) => resolve(status === maps.services.Status.OK && rows[0] ? {query,row:rows[0]} : null));
      })));
      if (generation !== request || region.hidden) return;
      const found = positions.filter(Boolean);
      if (!found.length) {region.textContent = '표시할 동 위치가 없습니다.'; return;}
      region.replaceChildren();
      const point = hit => new maps.LatLng(Number(hit.row.y),Number(hit.row.x));
      const map = new maps.Map(region,{center:point(found[0]),level:6});
      const bounds = new maps.LatLngBounds();
      for (const hit of found) {
        const position = point(hit);
        new maps.Marker({map,position,title:hit.query});
        bounds.extend(position);
      }
      if (found.length > 1) map.setBounds(bounds);
    } catch {if (generation === request && !region.hidden) region.textContent = '지도를 열 수 없습니다. 매물 목록은 계속 볼 수 있습니다.';}
  });
}
