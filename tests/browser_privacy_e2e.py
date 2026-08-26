#!/usr/bin/env python3
import json, random, sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from lottereal_supabase import load_env, supabase_request

CHROME = '/opt/data/cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell'
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002 - stdlib override signature
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
BASE = f'http://127.0.0.1:{server.server_port}'
phone = '0109' + ''.join(str(random.randrange(10)) for _ in range(7))
out = {}

def tracked(url):
    host = urlparse(url).netloc
    return 'googletagmanager.com' in host or 'google-analytics.com' in host or 'wcs' in host

def context(browser, viewport=None, dnt=False):
    ctx = browser.new_context(viewport=viewport or {'width': 1280, 'height': 900}, locale='ko-KR')
    if dnt:
        ctx.add_init_script("Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'})")
    return ctx

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=CHROME,
            args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],
            env={'HOME':'/opt/data','XDG_CONFIG_HOME':'/opt/data/cache/chrome-config','XDG_CACHE_HOME':'/opt/data/cache/chrome-cache'})

        ctx = context(browser)
        page = ctx.new_page()
        requests = []
        errors = []
        page.on('request', lambda req: requests.append(req.url) if tracked(req.url) else None)
        page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
        page.goto(BASE + '/index.html?private_test=01012345678', wait_until='domcontentloaded')
        page.wait_for_timeout(800)
        assert not requests, requests
        assert page.locator('[data-analytics-notice]').is_visible()
        out['before_choice'] = {'tracking_requests': 0, 'notice_visible': True}
        with page.expect_navigation(wait_until='domcontentloaded'):
            page.locator('[data-notice-allow]').click()
        page.wait_for_timeout(2500)
        config = page.evaluate("""() => (window.dataLayer || []).map(x => Array.from(x)).find(x => x[0] === 'config')""")
        assert config and config[2]['page_location'] == BASE + '/index.html', config
        assert any('googletagmanager.com' in u for u in requests), requests
        assert not any('wcs' in u for u in requests), requests
        assert all('01012345678' not in u and 'private_test' not in u for u in requests), requests
        out['allowed'] = {'tracking_hosts': sorted(set(urlparse(u).netloc for u in requests)), 'config_location': config[2]['page_location'], 'console_errors': errors}

        requests.clear()
        page.goto(BASE + '/privacy.html', wait_until='domcontentloaded')
        page.wait_for_timeout(1000)
        assert not requests, requests
        assert page.locator('[data-analytics-disable]').is_enabled()
        assert '사용하고 있습니다' in page.locator('[data-analytics-status]').inner_text()
        with page.expect_navigation(wait_until='domcontentloaded'):
            page.locator('[data-analytics-disable]').click()
        assert page.evaluate("localStorage.getItem('lr_analytics_choice')") == 'required-only'
        assert page.locator('[data-analytics-enable]').is_enabled()
        requests.clear()
        page.goto(BASE + '/index.html?private_test=01012345678', wait_until='domcontentloaded')
        page.wait_for_timeout(1200)
        assert not requests, requests
        assert page.evaluate("typeof window.gtag") == 'undefined'
        assert not any(c['name'].startswith('_ga') for c in ctx.cookies()), ctx.cookies()
        out['opt_out'] = {'tracking_requests': len(requests), 'ga_cookies': 0}
        ctx.close()

        ctx = context(browser, dnt=True)
        page = ctx.new_page(); requests = []
        page.on('request', lambda req: requests.append(req.url) if tracked(req.url) else None)
        page.goto(BASE + '/index.html', wait_until='domcontentloaded')
        page.wait_for_timeout(1000)
        assert not requests, requests
        out['dnt'] = {'tracking_requests': len(requests)}
        ctx.close()

        ctx = context(browser, {'width': 390, 'height': 844})
        page = ctx.new_page(); requests = []
        page.on('request', lambda req: requests.append(req.url) if tracked(req.url) else None)
        page.goto(BASE + '/privacy.html', wait_until='domcontentloaded')
        metrics = page.evaluate("""() => ({overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, heights: [...document.querySelectorAll('.lr-policy-controls button')].map(b => b.getBoundingClientRect().height)})""")
        assert not requests and not metrics['overflow'] and min(metrics['heights']) >= 44, metrics
        page.screenshot(path='/opt/data/cache/lottereal/privacy-mobile.png', full_page=True)
        page.goto(BASE + '/index.html', wait_until='domcontentloaded')
        overlap = page.evaluate("""() => { const n=document.querySelector('[data-analytics-notice]').getBoundingClientRect(); const b=document.querySelector('.lr-mobile-actionbar').getBoundingClientRect(); return {noticeBottom:n.bottom, actionTop:b.top, overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth, buttonHeights:[...document.querySelectorAll('[data-analytics-notice] button')].map(x=>x.getBoundingClientRect().height)}; }""")
        assert not overlap['overflow'] and overlap['noticeBottom'] <= overlap['actionTop'] and min(overlap['buttonHeights']) >= 44, overlap
        page.screenshot(path='/opt/data/cache/lottereal/privacy-choice-mobile.png', full_page=True)
        out['mobile'] = {**metrics, 'notice_action_gap': overlap['actionTop'] - overlap['noticeBottom']}
        ctx.close()

        ctx = context(browser)
        page = ctx.new_page(); errors = []
        page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
        page.goto(BASE + '/listing-detail-en.html', wait_until='domcontentloaded')
        form = page.locator('[data-inquiry-form]')
        page.locator('input[name="phone"]').fill(phone)
        page.locator('textarea[name="message"]').fill('PRIVACY_E2E_DELETE_ME')
        assert form.evaluate('(f) => f.checkValidity()') is False
        page.locator('input[name="privacyConsent"]').check()
        assert form.evaluate('(f) => f.checkValidity()') is True
        page.locator('button[type="submit"]').click()
        page.locator('[data-inquiry-status]').filter(has_text='submitted').wait_for(timeout=15000)
        out['english_inquiry'] = {'persisted': True, 'consent_required': True, 'console_errors': errors}
        ctx.close(); browser.close()
finally:
    server.shutdown()
    server.server_close()
    try:
        status, rows = supabase_request('DELETE', 'inquiries', load_env(), query=f'?phone=eq.{phone}&select=id')
        out['cleanup'] = {'status': status, 'deleted_rows': len(rows or [])}
        if out.get('english_inquiry', {}).get('persisted'):
            assert len(rows or []) >= 1
    except Exception as exc:
        out['cleanup'] = {'error': type(exc).__name__}
        print(json.dumps(out, ensure_ascii=False))
        raise

print(json.dumps(out, ensure_ascii=False))
