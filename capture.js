// ===================================================================
// 깡갤 복사기 확장프로그램 - capture.js 모듈
// ===================================================================
// "유저가 보는 화면 그대로" 메시지 본문 캡처 (이미지로 클립보드 복사 / PNG 저장)
//
// === 🎯 모듈 역할 ===
// • 지정 범위의 메시지 상자 — 이름·아바타·메시지 메뉴 제외 — 실제 렌더링 그대로 이미지화
//   (테마 CSS·웹폰트·HTML 상태창·이미지까지 포함: DOM → SVG foreignObject → canvas 방식)
// • 익명화: 미리 적어둔 규칙(원문 => 대치)대로 텍스트를 바꿔서 캡처 (화면은 건드리지 않고 복제본에만 적용)
// • 시각 요소 종류(상태창·자동 생성 이미지·에셋·선택지·표…) 감지 → 옵션 기본값 + 캐릭터별 선택으로 숨김
// • 빈 범위는 처음/마지막으로 자동 채움(한 번 더 누르게), 부하 예측 후 큰 범위는 확인 팝업, 너무 크면 거절
// • 결과: 한 장(길면 여러 장으로 자동 분할) 또는 메시지마다 따로 → 미리보기에서 클립보드 복사 / PNG 저장
//
// === 🔗 의존성 ===
// • vendor/modern-screenshot.js (MIT, 동봉) — window.modernScreenshot. 없으면 안내 후 중단
// • commands.js(jumpToMessage: 안 그려진 과거 메시지 로드용)
// ===================================================================

(function() {
    'use strict';

    let isDebugMode = false;
    let libPromise = null;

    function debugLog(...args) {
        window.CopyBotUtils?.debugLog(isDebugMode, ...args);
    }

    function getContext() {
        return window.SillyTavern?.getContext?.() || null;
    }

    // 동봉된 렌더링 라이브러리 지연 로드
    function loadLibrary() {
        if (window.modernScreenshot) return Promise.resolve(window.modernScreenshot);
        if (libPromise) return libPromise;
        libPromise = new Promise((resolve, reject) => {
            const base = window.CopyBotBasePath || '/scripts/extensions/third-party/ggang-copy';
            const script = document.createElement('script');
            script.src = `${base}/vendor/modern-screenshot.js`;
            // 실패·지연 시 죽은 <script> 를 남기지 않고, 다음 캡처가 영원히 걸리지 않게 20초 제한
            const fail = (msg) => { clearTimeout(timer); try { script.remove(); } catch (e) { /* 무시 */ } reject(new Error(msg)); };
            const timer = setTimeout(() => fail('vendor/modern-screenshot.js 로드 시간 초과'), 20000);
            script.onload = () => { clearTimeout(timer); window.modernScreenshot ? resolve(window.modernScreenshot) : fail('라이브러리 전역 객체 없음'); };
            script.onerror = () => fail('vendor/modern-screenshot.js 로드 실패');
            document.head.appendChild(script);
        }).catch(err => { libPromise = null; throw err; });
        return libPromise;
    }

    // 익명화 규칙 파싱: 한 줄에 "원문 => 대치" (대치가 비면 삭제). 긴 원문부터 적용.
    function parseRules(text) {
        return String(text || '')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => {
                const idx = line.indexOf('=>');
                if (idx === -1) return null;
                const from = line.slice(0, idx).trim();
                const to = line.slice(idx + 2).trim();
                return from ? { from, to } : null;
            })
            .filter(Boolean)
            .sort((a, b) => b.from.length - a.from.length);
    }

    function applyRulesToText(text, rules) {
        let out = text;
        for (const { from, to } of rules) {
            if (out.includes(from)) out = out.split(from).join(to);
        }
        return out;
    }

    // 복제된 서브트리의 텍스트 노드에만 익명화 적용 (원본 화면은 그대로)
    function anonymizeClone(root, rules) {
        if (!rules.length || !root) return;
        // root 가 다른 문서(상태창 iframe 스냅샷)의 노드일 수 있으므로 그 문서의 TreeWalker 로
        const walker = (root.ownerDocument || document).createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(node => {
            const replaced = applyRulesToText(node.nodeValue, rules);
            if (replaced !== node.nodeValue) node.nodeValue = replaced;
        });
        // alt/title 같은 속성도 함께
        root.querySelectorAll?.('[alt],[title],[placeholder]').forEach(el => {
            ['alt', 'title', 'placeholder'].forEach(attr => {
                const v = el.getAttribute(attr);
                if (v) el.setAttribute(attr, applyRulesToText(v, rules));
            });
        });
    }

    // 요소 뒤쪽의 실제 배경색(투명이면 조상에서 찾음)
    function findBackgroundColor(el) {
        let node = el;
        while (node && node !== document.documentElement) {
            const bg = getComputedStyle(node).backgroundColor;
            if (bg && bg !== 'transparent' && !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)/.test(bg)) return bg;
            node = node.parentElement;
        }
        const body = getComputedStyle(document.body).backgroundColor;
        return body && body !== 'transparent' ? body : '#1e1e1e';
    }

    // 범위의 메시지가 DOM 에 없으면(지연 로딩) 실리의 chat-jump 로 로드한 뒤 스크롤 원복
    async function ensureRendered(start) {
        const el = document.querySelector(`#chat .mes[mesid="${start}"]`);
        if (el) return true;
        const chat = document.querySelector('#chat');
        const prevScroll = chat ? chat.scrollTop : 0;
        const prevHeight = chat ? chat.scrollHeight : 0;   // 점프 "전" 높이 (후 높이로 계산하면 원복이 무효가 됨)
        const context = getContext();
        if (!context?.executeSlashCommandsWithOptions) return false;
        await context.executeSlashCommandsWithOptions(`/chat-jump ${start}`, { handleParserErrors: false, handleExecutionErrors: false });
        await new Promise(r => setTimeout(r, 300));
        fixChatOrder(chat);
        // 과거 메시지가 위에 추가되면 scrollTop 기준이 바뀌므로 "맨 아래 기준" 거리로 원복
        if (chat) {
            const distanceFromBottom = Math.max(0, prevHeight - prevScroll);
            const restore = () => { chat.scrollTop = Math.max(0, chat.scrollHeight - distanceFromBottom); };
            restore();
            await new Promise(r => requestAnimationFrame(r));
            restore();
        }
        return !!document.querySelector(`#chat .mes[mesid="${start}"]`);
    }

    // 실리 1.19.0 버그 방어 (2026-10-09 폰에서 확인): printMessages 가 "Show more messages" 버튼을 #chat 맨 아래에 append 하고 CSS order:-1 로 위에
    // 보이게만 해 두는데, showMoreMessages 는 그 버튼 '뒤'에 과거 메시지를 끼워 넣어 DOM 이 [2,3,4,0,1] 처럼 꼬인다(버튼 직접 클릭·/chat-jump 모두).
    // 우리가 /chat-jump 로 그리게 한 뒤에는 번호 순서가 틀어진 메시지만 제자리(자기보다 큰 번호 중 첫 메시지 앞)로 옮긴다. 채팅 데이터는 건드리지 않음.
    function fixChatOrder(chat) {
        try {
            if (!chat) return 0;
            const items = [...chat.querySelectorAll(':scope > .mes[mesid]')].filter(el => Number.isFinite(parseInt(el.getAttribute('mesid'), 10)));
            const idOf = (el) => parseInt(el.getAttribute('mesid'), 10);
            const sorted = items.slice().sort((a, b) => idOf(a) - idOf(b));
            if (items.every((el, i) => el === sorted[i])) return 0;
            // 이미 제자리인 것(번호가 증가하는 가장 긴 부분열)은 그대로 두고 나머지만 옮긴다 → 이동 최소(메시지 안 iframe 재로드 최소)
            const n = items.length, len = new Array(n).fill(1), prevIdx = new Array(n).fill(-1);
            let best = 0;
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < i; j++) if (idOf(items[j]) < idOf(items[i]) && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prevIdx[i] = j; }
                if (len[i] > len[best]) best = i;
            }
            const keep = new Set();
            for (let k = best; k !== -1; k = prevIdx[k]) keep.add(items[k]);
            let moved = 0, prev = null;
            for (const el of sorted) {
                if (!keep.has(el)) {
                    if (prev) chat.insertBefore(el, prev.nextSibling);
                    else chat.insertBefore(el, chat.querySelector(':scope > .mes[mesid]'));
                    moved++;
                }
                prev = el;
            }
            debugLog(`채팅 DOM 순서 보정: ${moved}개 이동`);
            return moved;
        } catch (e) { debugLog('채팅 DOM 순서 보정 실패(그대로 둠)', e); return 0; }
    }

    // 캡처에서 완전히 제외할 것 (메시지 메뉴·편집 UI·스와이프·타임스탬프 등)
    const REMOVE_SELECTORS = [
        '.mes_buttons', '.mes_edit_buttons', '.swipe_left', '.swipe_right', '.swipes-counter', '.swipeRightBlock',
        '.mes_reasoning_actions', '.mes_img_controls', '.timestamp', '.mesIDDisplay', '.mes_timer', '.tokenCounterDisplay',
        '.copybot_capture_exclude',
    ];
    // 자리는 남기되 안 보이게 할 것 (아바타: 좌측 여백·본문 위치를 화면과 동일하게 유지)
    const BLANK_SELECTORS = ['.mesAvatarWrapper', '.avatar'];
    // 세로 공간까지 접을 것 (이름 줄)
    const COLLAPSE_SELECTORS = ['.ch_name'];

    // ===== 표시 요소 (봇/유저 × 프사·이름·메시지) — 유저 확정 기본값: 유저 이름만 가림 =====
    const SHOW_DEFAULT = { bot: { avatar: true, name: true, text: true }, user: { avatar: true, name: false, text: true } };
    const ROLE_SELECTOR = { user: '.mes[is_user="true"]', bot: '.mes:not([is_user="true"])' };

    function readShowSettings() {
        const out = { bot: {}, user: {} };
        for (const role of ['bot', 'user']) for (const part of ['avatar', 'name', 'text']) {
            const $cb = $(`#copybot_capture_show_${role}_${part}`);
            out[role][part] = $cb.length ? $cb.is(':checked') : SHOW_DEFAULT[role][part];
        }
        return out;
    }

    function roleOf(mes) {
        return (mes && mes.getAttribute && mes.getAttribute('is_user') === 'true') ? 'user' : 'bot';
    }

    function isRoleTextHidden(mes, show) {
        const r = (show && show[roleOf(mes)]) || SHOW_DEFAULT[roleOf(mes)];
        return r.text === false;
    }

    // 미리보기 문서용 역할별 규칙 CSS — 옵션이 바뀌면 이 스타일만 갈아끼워 즉시 반영
    function buildRoleCss(show) {
        let css = '';
        for (const role of ['bot', 'user']) {
            const r = (show && show[role]) || SHOW_DEFAULT[role];
            const sel = ROLE_SELECTOR[role];
            if (r.avatar === false) css += `${sel} .mesAvatarWrapper, ${sel} .avatar { visibility: hidden !important; }\n`;   // 자리는 남김(화면과 같은 위치)
            if (r.name === false) css += `${sel} .ch_name { display: none !important; }\n`;                                     // 이름 줄 접기
            if (r.text === false) css += `${sel} { display: none !important; }\n`;                                               // 그 역할 메시지 상자 통째로 제외
        }
        return css;
    }

    // 오프스크린 렌더 복제본(.mes)에 역할 규칙을 인라인으로 적용 (복제본은 본 문서에 놓여 미리보기 CSS 가 닿지 않음)
    function applyRoleInline(clone, show) {
        const r = (show && show[roleOf(clone)]) || SHOW_DEFAULT[roleOf(clone)];
        if (r.avatar === false) clone.querySelectorAll(BLANK_SELECTORS.join(',')).forEach(el => { el.style.visibility = 'hidden'; });
        if (r.name === false) clone.querySelectorAll(COLLAPSE_SELECTORS.join(',')).forEach(el => { el.style.display = 'none'; });
    }

    function matchesAny(el, selectors) {
        return selectors.some(sel => { try { return el.matches(sel); } catch (e) { return false; } });
    }

    // ===== 캡처 직전 화면 상태 정리 =====
    // 문제: 폰에서 설정 패널 입력칸에 번호를 치고 바로 캡처 버튼을 누르면 키보드가 아직 떠 있다. 실리의 viewport 설정
    //       (interactive-widget=resizes-content) 때문에 키보드가 있으면 레이아웃 높이가 줄고, vh 단위 크기
    //       (.mes_img 의 max-height:40vh 등)가 평소보다 작게 잡힌 "그 순간의 화면"이 그대로 찍힌다 → 이미지가 작게 나옴.
    // 대응: 입력칸 포커스를 풀어 키보드를 닫고, 화면 높이가 안정될 때까지만 잠깐 기다린다 (키보드가 없으면 거의 0초).
    async function settleViewport() {
        const active = document.activeElement;
        const editable = !!active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable);
        if (editable) { try { active.blur(); } catch (e) { /* 무시 */ } }
        const keyboardLikely = editable || window.innerHeight < (window.screen?.height || 0) * 0.65;
        if (!keyboardLikely) return;
        const deadline = Date.now() + 1500;
        let last = window.innerHeight, stable = 0;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 100));
            const h = window.innerHeight;
            if (h === last) { if (++stable >= 2) break; }
            else { stable = 0; last = h; }
        }
        debugLog(`화면 높이 안정화 대기 끝 (innerHeight=${window.innerHeight})`);
    }

    // ===== 하단 여백 정리 =====
    // 메시지 상자 아래쪽에는 스와이프 화살표·이미지 조작 버튼 자리처럼 캡처에서 지워지는 요소를 위한 빈 공간이 크게 남는다
    // (마지막 메시지는 padding-bottom 46px, 이미지 아래 45px 등). 실제 내용의 맨 아래를 재어, 위쪽 여백(padding-top)만큼만
    // 남기고 빈 띠를 잘라 낸다. 테마가 그리는 말풍선·카드 상자(배경/테두리 있는 컨테이너)는 바닥 모서리 띠를 남기고
    // 안쪽의 단색 부분만 잘라 상자 모양이 유지되게 한다. 잘라 낼 띠 목록 [[from, to], ...] (상자 top 기준 CSS px) 을 돌려준다.
    const LEAF_TAGS = /^(IMG|VIDEO|CANVAS|SVG|IFRAME|INPUT|TEXTAREA|SELECT|BUTTON|HR|EMBED|OBJECT|PROGRESS|METER)$/;
    const SVG_NS = 'http://www.w3.org/2000/svg';

    function isVisibleBox(cs) {
        const bg = cs.backgroundColor;
        const hasBg = !!bg && bg !== 'transparent' && !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)/.test(bg);
        const hasImg = !!cs.backgroundImage && cs.backgroundImage !== 'none';
        const hasBorder = parseFloat(cs.borderBottomWidth) > 0 && cs.borderBottomStyle !== 'none';
        const hasShadow = !!cs.boxShadow && cs.boxShadow !== 'none';
        const hasOutline = parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none';
        return { any: hasBg || hasImg || hasBorder || hasShadow || hasOutline, flat: !hasImg };
    }

    function hasVisiblePseudo(view, el) {
        return ['::before', '::after'].some(p => {
            try {
                const pc = view.getComputedStyle(el, p);
                return !!pc.content && pc.content !== 'none' && pc.content !== 'normal' && isVisibleBox(pc).any;
            } catch (e) { return false; }
        });
    }

    function measureBottomBands(mes) {
        try {
            const view = mes.ownerDocument.defaultView || window;
            const mesRect = mes.getBoundingClientRect();
            if (!(mesRect.height > 0)) return [];
            const top0 = mesRect.top;
            const H = mesRect.height;
            const keep = Math.max(parseFloat(view.getComputedStyle(mes).paddingTop) || 0, 10);
            const skipSel = REMOVE_SELECTORS.concat(COLLAPSE_SELECTORS, BLANK_SELECTORS).join(',');
            let contentBottom = -Infinity;
            const boxes = [];
            for (const el of [mes, ...mes.querySelectorAll('*')]) {
                if (el !== mes && el.closest(skipSel)) continue;
                if (el.namespaceURI === SVG_NS && el.tagName.toLowerCase() !== 'svg') continue;   // svg 안쪽은 svg 전체로 셈
                const cs = view.getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed' || cs.opacity === '0') continue;
                const r = el.getBoundingClientRect();
                if (!(r.width > 0) || !(r.height > 0)) continue;
                if (r.top >= mesRect.bottom) continue;
                const bottom = Math.min(r.bottom, mesRect.bottom) - top0;   // 상자 밖으로 넘친 부분은 캔버스에도 안 찍힘
                const box = isVisibleBox(cs);
                const hasText = [...el.childNodes].some(n => n.nodeType === 3 && /\S/.test(n.nodeValue));
                if (LEAF_TAGS.test(el.tagName) || hasText || hasVisiblePseudo(view, el)) { contentBottom = Math.max(contentBottom, bottom); continue; }
                if (!box.any) continue;                                   // 투명 컨테이너: 자식들이 정한다
                if (el.children.length && box.flat) {
                    // 단색 상자 컨테이너: 안쪽은 잘라도 되고, 바닥 모서리(둥근 모서리·테두리)만 남기면 된다
                    const corner = Math.max(parseFloat(cs.borderBottomLeftRadius) || 0, parseFloat(cs.borderBottomRightRadius) || 0, parseFloat(cs.borderBottomWidth) || 0) + 1;
                    boxes.push({ top: r.top - top0, bottom, corner });
                } else {
                    contentBottom = Math.max(contentBottom, bottom);      // 무늬 배경·빈 장식 상자: 통째로 내용 취급
                }
            }
            if (!isFinite(contentBottom)) return [];
            const intervals = [[0, contentBottom]];
            for (const b of boxes) {
                if (b.bottom <= contentBottom) continue;
                if (b.top >= contentBottom) intervals.push([b.top, b.bottom]);                         // 내용 아래 통째로 있는 상자는 그대로
                else intervals.push([Math.max(contentBottom, b.bottom - b.corner), b.bottom]);         // 바닥 모서리 띠만
            }
            intervals.sort((a, b) => a[0] - b[0]);
            const merged = [];
            for (const iv of intervals) {
                const last = merged[merged.length - 1];
                if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
                else merged.push([iv[0], iv[1]]);
            }
            const bands = [];
            for (let i = 0; i < merged.length; i++) {
                const end = merged[i][1];
                const next = i + 1 < merged.length ? merged[i + 1][0] : H;
                if (next - end > keep + 1) bands.push([end + keep, next]);   // 빈 구간은 keep 만큼만 남기고 자름
            }
            return bands;
        } catch (e) {
            debugLog('하단 여백 측정 실패(자르지 않음)', e);
            return [];
        }
    }

    // 캔버스에서 띠(CSS px 구간)들을 잘라 내고 이어 붙인 새 캔버스 (자를 게 없으면 원본 그대로)
    function cutBands(canvas, bands, scale) {
        if (!bands || !bands.length) return canvas;
        const H = canvas.height;
        const keepRanges = [];
        let y = 0;
        for (const [a, b] of bands) {
            const ya = Math.min(H, Math.round(a * scale)), yb = Math.min(H, Math.round(b * scale));
            if (ya > y) keepRanges.push([y, ya]);
            y = Math.max(y, yb);
        }
        if (y < H) keepRanges.push([y, H]);
        const newH = keepRanges.reduce((s, [a, b]) => s + (b - a), 0);
        if (newH <= 0 || newH >= H) return canvas;
        const out = document.createElement('canvas');
        out.width = canvas.width;
        out.height = newH;
        const g = out.getContext('2d');
        let dy = 0;
        for (const [a, b] of keepRanges) { g.drawImage(canvas, 0, a, canvas.width, b - a, 0, dy, canvas.width, b - a); dy += b - a; }
        debugLog(`하단 여백 ${((H - newH) / scale).toFixed(1)}px 자름 (${bands.length}개 띠)`);
        return out;
    }

    // ===== 글꼴·줄바꿈 정규화 (근본 대응) =====
    // 문제: SVG 이미지 안에서는 폰에 설치된 글꼴을 "이름"으로 못 쓰고(기본 글꼴 generic 만 가능), 이름을 못 찾았을 때의
    //       대체 글꼴도 실제 페이지와 다르게 골라진다. 그래서 글자 폭이 살짝 달라지고, 라이브러리가 복사한 고정 폭 안에서
    //       글자가 넘쳐 엉뚱한 줄바꿈이 생긴다 (봇·테마 무관하게 공통).
    // 대응: ① 각 요소의 글꼴 목록이 실제로 어떤 generic 글꼴(sans-serif/serif/monospace)로 그려지는지 페이지에서 폭을 재어
    //          알아낸 뒤, 그 generic 으로 바꿔 SVG 에서도 같은 글꼴을 쓰게 함 (페이지가 실제로 내려받은 웹폰트는 그대로 두면 내장됨)
    //       ② 화면에서 한 줄로 보이는 글자는 복제본에서 줄바꿈을 금지해 미세한 폭 차이로 줄이 깨지지 않게 함
    const FONT_SAMPLE = '메인댄서 호감도 컨디션 멘탈 가나다라 ABC Artist 1234 Status';
    const GENERIC_FONTS = ['sans-serif', 'serif', 'monospace'];
    const measureCache = new WeakMap();   // doc → Map(family → width)

    function measureFamily(doc, family) {
        let map = measureCache.get(doc);
        if (!map) { map = new Map(); measureCache.set(doc, map); }
        if (map.has(family)) return map.get(family);
        let width = 0;
        try {
            const cv = doc.createElement('canvas');
            const g = cv.getContext('2d');
            g.font = `16px ${family}`;
            width = g.measureText(FONT_SAMPLE).width;
        } catch (e) { width = 0; }
        map.set(family, width);
        return width;
    }

    function loadedWebFonts(doc) {
        try { return new Set([...doc.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/^["']|["']$/g, '').toLowerCase())); }
        catch (e) { return new Set(); }
    }

    // 글꼴 목록 → 그대로 둘지(null) / 어떤 generic 으로 바꿀지
    function resolveFontFamily(doc, familyList, webFonts) {
        const families = familyList.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        if (!families.length) return null;
        // 페이지가 실제 내려받은 웹폰트가 목록 맨 앞이면 그대로 (라이브러리가 파일째 내장함)
        if (webFonts.has(families[0].toLowerCase())) return null;
        const actual = measureFamily(doc, familyList);
        if (!actual) return null;
        let best = null, bestDiff = Infinity;
        for (const g of GENERIC_FONTS) {
            const diff = Math.abs(measureFamily(doc, g) - actual);
            if (diff < bestDiff) { bestDiff = diff; best = g; }
        }
        // generic 자체를 쓰고 있었고 폭도 같으면 바꿀 필요 없음
        if (families.length === 1 && GENERIC_FONTS.includes(families[0]) ) return null;
        return best;
    }

    // 원본 요소들에 임시 표식(data-cb-font / data-cb-nowrap) 달기 — 복제본에서 읽어 적용
    function tagFontsAndLines(root) {
        if (!root || !root.querySelectorAll) return;
        const doc = root.ownerDocument;
        const view = doc.defaultView || window;
        const webFonts = loadedWebFonts(doc);
        const familyCache = new Map();
        const elements = [root, ...root.querySelectorAll('*')];
        for (const el of elements) {
            let cs;
            try { cs = view.getComputedStyle(el); } catch (e) { continue; }
            const fam = cs.fontFamily;
            if (fam) {
                let repl = familyCache.get(fam);
                if (repl === undefined) { repl = resolveFontFamily(doc, fam, webFonts); familyCache.set(fam, repl); }
                if (repl) el.setAttribute('data-cb-font', repl);
            }
            // 직접 글자를 가진 요소가 화면에서 한 줄이면 줄바꿈 금지 표식
            const hasText = [...el.childNodes].some(n => n.nodeType === 3 && /\S/.test(n.nodeValue));
            if (hasText && cs.whiteSpace !== 'pre' && cs.whiteSpace !== 'pre-wrap' && cs.whiteSpace !== 'pre-line') {
                const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.35;
                const h = el.getBoundingClientRect().height;
                if (h > 0 && lineHeight > 0 && h < lineHeight * 1.6) el.setAttribute('data-cb-nowrap', '1');
            }
        }
    }

    function clearTags(root) {
        if (!root || !root.querySelectorAll) return;
        [root, ...root.querySelectorAll('[data-cb-font],[data-cb-nowrap]')].forEach(el => { el.removeAttribute?.('data-cb-font'); el.removeAttribute?.('data-cb-nowrap'); });
    }

    // 복제본에 표식 적용
    function applyTags(cloneRoot) {
        if (!cloneRoot || !cloneRoot.querySelectorAll) return;
        [cloneRoot, ...cloneRoot.querySelectorAll('[data-cb-font],[data-cb-nowrap]')].forEach(el => {
            if (!el.style) return;
            const font = el.getAttribute('data-cb-font');
            if (font) el.style.setProperty('font-family', font, 'important');
            if (el.getAttribute('data-cb-nowrap') === '1') el.style.setProperty('white-space', 'nowrap', 'important');
        });
    }

    // ===== 선택지 감지 (봇/확장마다 구조가 제각각이라 휴리스틱) =====
    const CHOICE_WORD = /choice|choices|cyoa|선택지|선택항목/i;

    function isChoiceLike(el) {
        if (!el || el.nodeType !== 1) return false;   // 다른 realm(iframe) 요소는 instanceof Element 가 false → nodeType 으로
        const tag = el.tagName.toLowerCase();
        if (/^(choice|choices|cyoa|option-?list|options)$/.test(tag)) return true;          // <choice> 같은 커스텀 태그
        const cls = typeof el.className === 'string' ? el.className : (el.getAttribute('class') || '');
        if (CHOICE_WORD.test(cls) || CHOICE_WORD.test(el.id || '')) return true;
        for (const attr of el.attributes) { if (CHOICE_WORD.test(attr.name)) return true; }
        return false;
    }

    // 선택지로 판단된 요소를 포함해, 선택지로만 이루어진 조상 블록까지 — 지울(숨길) 블록 목록 (제목·테두리까지)
    function collectChoiceBlocks(root) {
        if (!root || !root.querySelectorAll) return [];
        const stop = root;
        const blocks = [];
        const inBlock = (el) => blocks.some(b => b === el || b.contains(el));
        const matched = [...root.querySelectorAll('*')].filter(isChoiceLike);
        for (const el of matched) {
            if (inBlock(el)) continue;   // 앞서 잡힌 블록 안의 요소
            let block = el;
            while (block.parentElement && block.parentElement !== stop) {
                const parent = block.parentElement;
                const parentText = (parent.textContent || '').replace(/\s+/g, '');
                const choiceText = [...parent.children].filter(c => c === block || isChoiceLike(c) || c.querySelector?.(':scope *') && [...c.querySelectorAll('*')].some(isChoiceLike))
                    .map(c => (c.textContent || '').replace(/\s+/g, '')).join('');
                // 부모 글자의 60% 이상이 선택지면 부모도 선택지 블록으로 본다 (제목/안내문 포함)
                if (parentText.length && choiceText.length / parentText.length >= 0.6) block = parent;
                else break;
            }
            // 더 큰 블록이 잡히면 그 안의 기존 블록은 대체
            for (let i = blocks.length - 1; i >= 0; i--) if (block.contains(blocks[i])) blocks.splice(i, 1);
            blocks.push(block);
        }
        // "선택지" 제목만 달린 블록(태그·클래스 단서 없음) — 제목 바로 다음 형제들이 버튼/목록이면 함께
        [...root.querySelectorAll('h1,h2,h3,h4,h5,h6,b,strong,p,div,span,summary,title')]
            .filter(h => !inBlock(h) && h.children.length === 0 && /^\s*[\[【(]?\s*(선택지|choices?)\s*[\]】)]?\s*[:：]?\s*$/i.test(h.textContent || ''))
            .forEach(h => {
                const container = h.parentElement && h.parentElement !== stop ? h.parentElement : null;
                if (container && !inBlock(container) && (container.querySelectorAll('button, li, label, input').length >= 2)) blocks.push(container);
                else blocks.push(h);
            });
        return blocks;
    }

    function removeChoices(root) {
        const blocks = collectChoiceBlocks(root);
        blocks.forEach(b => b.remove());
        return blocks.length;
    }

    // iframe 문서 전체가 선택지인지 (제목/본문 앞부분에 '선택지' 단서 + 버튼·항목이 여러 개)
    function iframeLooksLikeChoices(doc) {
        try {
            const head = `${doc.title || ''} ${(doc.body?.textContent || '').trim().slice(0, 120)}`;
            const hasChoiceEls = doc.body && (doc.body.querySelectorAll('[class*="choice" i], [id*="choice" i], choice, choices').length > 0);
            const manyButtons = doc.body && doc.body.querySelectorAll('button, [role="button"], li').length >= 2;
            return hasChoiceEls || (CHOICE_WORD.test(head) && manyButtons);
        } catch (e) { return false; }
    }

    // ===== 상태창 감지 (봇·프롬프트마다 천차만별이라 휴리스틱) =====
    // 세 갈래: ① 정규식이 iframe(srcdoc)으로 그린 상태창 → iframeLooksLikeStatus, ② 정규식이 div.status 같은 요소로 그린 것 → isStatusLike,
    // ③ 정규식이 없어 <status>…</status> 태그만 벗겨지고 글만 남은 것 → 원문(chat[i].mes)의 태그 구간과 본문 줄을 대조(collectStatusTextBlocks)
    const STAT_TAG = /^(stat|stats|status|statusblock|status[-_]block|status[-_]window|state|tracker|tracker[-_]guide|hud|상태창|상태)$/i;
    const STAT_WORD = /(^|[^a-z])(stat|stats|status|tracker|hud)(?![a-z])|상태창/i;
    const STAT_RAW_RE = /<(stat|stats|status|statusblock|status[-_]block|status[-_]window|state|tracker|tracker[-_]guide|hud|상태창|상태)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi;

    function isStatusLike(el) {
        if (!el || el.nodeType !== 1 || !el.closest || !el.closest('.mes_text')) return false;
        if (STAT_TAG.test(el.tagName)) return true;                                   // <status> 같은 커스텀 태그가 남아 있는 경우
        const cls = typeof el.className === 'string' ? el.className : (el.getAttribute('class') || '');
        if (STAT_WORD.test(cls) || STAT_WORD.test(el.id || '')) return true;
        for (const attr of el.attributes) { if (STAT_WORD.test(attr.name)) return true; }
        return false;
    }

    // iframe 문서가 상태창인지 (제목·본문 앞부분·요소 클래스에 stat/status/tracker/hud/상태창 단서)
    function iframeLooksLikeStatus(doc) {
        try {
            if (!doc || !doc.body) return false;
            const head = `${doc.title || ''} ${(doc.body.textContent || '').trim().slice(0, 160)}`;
            if (STAT_WORD.test(head)) return true;
            const cls = `${doc.documentElement.className || ''} ${doc.body.className || ''} ${doc.body.id || ''}`;
            if (STAT_WORD.test(cls)) return true;
            return [...doc.body.querySelectorAll('[class],[id]')].some(el => STAT_WORD.test(`${typeof el.className === 'string' ? el.className : ''} ${el.id || ''}`))
                || doc.body.querySelector('status, stat, stats, tracker, hud') !== null;
        } catch (e) { return false; }
    }

    function rawMessageText(index) {
        const i = parseInt(index, 10);
        if (isNaN(i)) return '';
        const m = getContext()?.chat?.[i];
        return typeof m?.mes === 'string' ? m.mes : '';
    }

    function escapeRegExp(t) {
        return String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // 정규식 없이 태그만 벗겨진 상태창: 원문의 <status>…</status> 안쪽 글자와 정확히 일치하는 본문 최상위 요소 연속 구간을 찾음
    // 반환: [[el, el, …], …] (구간마다 요소 배열). 본문과 한 문단에 섞여 있으면(정확히 일치하는 구간 없음) 못 잡음 — 보수적.
    function collectStatusTextBlocks(textRoot, raw) {
        if (!textRoot || !raw || !textRoot.children) return [];
        const norm = (t) => String(t || '').replace(/\s+/g, '');
        const children = [...textRoot.children].filter(c => norm(c.textContent).length);
        const used = new Set();
        const blocks = [];
        STAT_RAW_RE.lastIndex = 0;
        let m;
        while ((m = STAT_RAW_RE.exec(raw))) {
            const inner = norm(m[2]);
            if (!inner) continue;
            const lit = new RegExp(`<\\/?${escapeRegExp(m[1])}(?:\\s[^>]*)?>`, 'gi');   // 태그가 글자로 남은 경우(<상태창>)
            let found = null;
            for (let i = 0; i < children.length && !found; i++) {
                if (used.has(children[i])) continue;
                let acc = '';
                for (let j = i; j < children.length; j++) {
                    if (used.has(children[j])) break;
                    acc += norm(children[j].textContent);
                    const cmp = acc.replace(lit, '');
                    if (cmp === inner) { found = children.slice(i, j + 1); break; }
                    if (cmp.length >= inner.length) break;
                }
            }
            if (found) { found.forEach(el => used.add(el)); blocks.push(found); }
        }
        return blocks;
    }

    // ===== 시각 요소 종류(kind) =====
    // 캡처에서 숨길 수 있는 요소 종류. 고정 종류 외에 본문(.mes_text) 최상위의 클래스 있는 블록은 'block:태그.클래스' 로 동적 추가.
    // 고정 종류(미리 알 수 있는 분류)의 숨김은 공통(모든 봇) 설정, 동적 블록의 숨김은 캐릭터별 설정으로 저장된다.
    const GENIMG_SELECTORS = ['.mes_img', '.mes_img_container', '.mes_media_container', '.mes_media_wrapper', '.mes_video_container'];
    const ASSET_SELECTORS = ['[class*="characterImage"]', '[class*="imageWrapper"]', 'img[src^="/characters/"]', 'img[src^="characters/"]'];
    const KIND_DEFS = [
        { id: 'frame',    label: 'HTML 프레임(기타)',   test: el => el.tagName === 'IFRAME' },
        { id: 'genimg',   label: '자동 생성 이미지',    test: el => matchesAny(el, GENIMG_SELECTORS) },
        { id: 'asset',    label: '캐릭터 에셋 이미지',  test: el => matchesAny(el, ASSET_SELECTORS) && !el.closest('.mesAvatarWrapper, .avatar') },   // 프사는 에셋이 아님(표시 요소 옵션 담당)
        { id: 'otherimg', label: '기타 이미지·영상',   test: el => /^(IMG|VIDEO|PICTURE|CANVAS)$/.test(el.tagName) && !el.closest('.mesAvatarWrapper, .avatar') && !el.classList.contains('copybot_inlined_frame') },
        { id: 'stat',     label: '상태창',              test: el => isStatusLike(el) },
        { id: 'details',  label: '접기(펼치기) 블록',  test: el => el.tagName === 'DETAILS' },
        { id: 'table',    label: '표',                  test: el => el.tagName === 'TABLE' },
        { id: 'code',     label: '코드 블록',           test: el => el.tagName === 'PRE' },
        { id: 'quote',    label: '인용 블록',           test: el => el.tagName === 'BLOCKQUOTE' },
    ];
    const KIND_LABELS = Object.fromEntries(KIND_DEFS.map(k => [k.id, k.label]));
    KIND_LABELS.choice = '선택지';
    const KIND_ORDER = ['stat', 'frame', 'genimg', 'asset', 'otherimg', 'choice', 'details', 'table', 'code', 'quote'];

    // 요소의 고정 종류 (없으면 null)
    function kindOf(el) {
        if (!el || el.nodeType !== 1) return null;
        for (const def of KIND_DEFS) { try { if (def.test(el)) return def.id; } catch (e) { /* 무시 */ } }
        return null;
    }

    // 본문 최상위 블록의 동적 종류 id ('block:div.custom-xxx'), 해당 없으면 null
    function blockKindOf(el) {
        if (!el || el.nodeType !== 1) return null;
        const parent = el.parentElement;
        if (!parent || !parent.classList.contains('mes_text')) return null;
        if (!/^(DIV|SECTION|ASIDE|FIGURE|ARTICLE|SPAN|CENTER)$/.test(el.tagName)) return null;
        const cls = (typeof el.className === 'string' ? el.className : (el.getAttribute('class') || '')).trim().split(/\s+/).filter(Boolean)[0];
        if (!cls) return null;
        if (kindOf(el)) return null;   // 고정 종류가 우선
        return `block:${el.tagName.toLowerCase()}.${cls}`;
    }

    // 고정 종류(공통 저장)인지 — 아니면 봇마다 다른 동적 블록(캐릭터별 저장)
    function isFixedKind(id) {
        return !String(id).startsWith('block:');
    }

    function kindLabel(id) {
        if (KIND_LABELS[id]) return KIND_LABELS[id];
        if (id.startsWith('block:')) return `블록 <${id.slice(6)}>`;
        return id;
    }

    // 메시지 상자 안의 시각 요소 종류와 개수 (같은 종류가 겹쳐 있으면 바깥 것만 셈)
    function detectKinds(mes) {
        const found = new Map();   // id → count
        const add = (id) => found.set(id, (found.get(id) || 0) + 1);
        const counted = [];        // [{el, id}]
        const block = mes.querySelector('.mes_block') || mes;
        const skipSel = REMOVE_SELECTORS.concat(COLLAPSE_SELECTORS, BLANK_SELECTORS).join(',');
        for (const el of block.querySelectorAll('*')) {
            if (el.closest(skipSel)) continue;
            let id = kindOf(el) || blockKindOf(el);
            if (!id && isChoiceLike(el)) id = 'choice';
            if (!id) continue;
            if (id === 'frame') {
                try {
                    if (iframeLooksLikeChoices(el.contentDocument)) id = 'choice';
                    else if (iframeLooksLikeStatus(el.contentDocument)) id = 'stat';
                } catch (e) { /* 다른 출처 */ }
            }
            if (counted.some(c => c.id === id && c.el !== el && c.el.contains(el))) continue;
            counted.push({ el, id });
            add(id);
        }
        // 태그만 벗겨진 글자 상태창 (원문 대조)
        collectStatusTextBlocks(mes.querySelector('.mes_text'), rawMessageText(mes.getAttribute('mesid'))).forEach(() => add('stat'));
        return found;
    }

    function sortKindIds(ids) {
        return [...ids].sort((a, b) => {
            const ia = KIND_ORDER.indexOf(a), ib = KIND_ORDER.indexOf(b);
            if (ia !== -1 && ib !== -1) return ia - ib;
            if (ia !== -1) return -1;
            if (ib !== -1) return 1;
            return a.localeCompare(b);
        });
    }

    // 복제본에서 숨길 종류의 요소 제거 (frame 은 inlineIframes 에서, choice 는 removeChoices 로)
    function removeKinds(root, hideSet, mesIndex = null) {
        if (!root || !hideSet || !hideSet.size) return 0;
        let removed = 0;
        if (hideSet.has('stat') && mesIndex !== null) {
            collectStatusTextBlocks(root.querySelector('.mes_text'), rawMessageText(mesIndex)).forEach(block => { block.forEach(el => el.remove()); removed++; });
        }
        for (const el of [...root.querySelectorAll('*')]) {
            if (!root.contains(el)) continue;
            const id = kindOf(el) || blockKindOf(el);
            if (id && id !== 'frame' && hideSet.has(id)) { el.remove(); removed++; }
        }
        if (hideSet.has('choice')) removed += removeChoices(root.querySelector('.mes_text') || root);
        return removed;
    }

    // 같은 출처 iframe(srcdoc 상태창 등)의 안쪽 문서를 렌더해서, 복제본의 iframe 자리를 <img> 로 바꿈
    // hideSet 에 'choice' 가 있으면 선택지 프레임은 통째로 제거(섞여 있으면 안쪽에서 선택지만 제거), 'frame' 이 있으면 모든 프레임 제거
    async function inlineIframes(lib, originalRoot, clonedRoot, rules, scale, hideSet = null) {
        const skipChoices = !!hideSet?.has('choice');
        const skipStatus = !!hideSet?.has('stat');
        const hideFrames = !!hideSet?.has('frame');
        const origFrames = Array.isArray(originalRoot) ? originalRoot : [...originalRoot.querySelectorAll('iframe')];
        const cloneFrames = [...clonedRoot.querySelectorAll('iframe')];
        const removeWithWrapper = (target) => {
            const wrapper = target.parentElement && target.parentElement !== clonedRoot && target.parentElement.children.length === 1 ? target.parentElement : target;
            wrapper.remove();
        };
        for (let i = 0; i < cloneFrames.length && i < origFrames.length; i++) {
            const src = origFrames[i];
            const target = cloneFrames[i];
            try {
                if (hideFrames) { removeWithWrapper(target); debugLog(`iframe ${i}: 프레임 숨김 → 제거`); continue; }
                const doc = src.contentDocument;
                if (!doc || !doc.documentElement) continue;      // 다른 출처: 접근 불가 → 그대로 둠
                if (skipChoices && iframeLooksLikeChoices(doc)) {
                    removeWithWrapper(target);                     // 프레임 전체가 선택지면 흔적 없이 제거
                    debugLog(`iframe ${i}: 선택지 프레임으로 판단 → 제거`);
                    continue;
                }
                if (skipStatus && !iframeLooksLikeChoices(doc) && iframeLooksLikeStatus(doc)) {
                    removeWithWrapper(target);                     // 상태창 프레임 → 흔적 없이 제거
                    debugLog(`iframe ${i}: 상태창 프레임으로 판단 → 제거`);
                    continue;
                }
                const width = src.offsetWidth || src.clientWidth;
                const height = src.offsetHeight || src.clientHeight;
                if (!width || !height) continue;
                const bodyBg = doc.body ? getComputedStyle(doc.body).backgroundColor : 'transparent';
                const backgroundColor = (bodyBg && bodyBg !== 'transparent' && !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)/.test(bodyBg)) ? bodyBg : undefined;
                tagFontsAndLines(doc.documentElement);
                let dataUrl;
                try {
                    dataUrl = await lib.domToDataUrl(doc.documentElement, libOptions({
                        scale,
                        width,
                        height,
                        backgroundColor,
                        onCloneNode: (c) => { applyTags(c); if (skipChoices) removeChoices(c); anonymizeClone(c, rules); },
                    }));
                } finally {
                    clearTags(doc.documentElement);
                }
                const img = clonedRoot.ownerDocument.createElement('img');
                img.src = dataUrl;
                img.width = width;
                img.height = height;
                // iframe 이 차지하던 자리와 똑같이: 여백·정렬·표시 방식·테두리·둥근 모서리를 계산값 그대로 옮김 (안 그러면 iframe 선택자 규칙이 빠져 높이가 달라짐)
                let boxCss = '';
                try {
                    const scs = (src.ownerDocument.defaultView || window).getComputedStyle(src);
                    boxCss = `display:${scs.display === 'inline' ? 'inline-block' : scs.display};vertical-align:${scs.verticalAlign};margin:${scs.marginTop} ${scs.marginRight} ${scs.marginBottom} ${scs.marginLeft};` +
                        `padding:${scs.paddingTop} ${scs.paddingRight} ${scs.paddingBottom} ${scs.paddingLeft};border-radius:${scs.borderRadius};box-shadow:${scs.boxShadow};` +
                        `border:${scs.borderTopWidth} ${scs.borderTopStyle} ${scs.borderTopColor};box-sizing:${scs.boxSizing};`;
                } catch (e) { boxCss = 'display:block;border:0;'; }
                img.setAttribute('style', (target.getAttribute('style') || '') + `;${boxCss}width:${width}px;height:${height}px;max-width:none;`);
                img.className = `${target.className} copybot_inlined_frame`;   // 상태창 등: 이미지 숨김 모드에서도 지우지 않음
                target.replaceWith(img);
                debugLog(`iframe ${i} 를 이미지로 치환 (${width}x${height})`);
            } catch (error) {
                debugLog('iframe 렌더 실패(그대로 둠)', error);
            }
        }
    }

    // 라이브 문서에 잠깐 붙이는 렌더용 복제본에서 "살아 움직일 수 있는 것"을 전부 끈다:
    //  • 이미지로 못 바꾼 iframe(다른 출처·0 크기·렌더 실패)은 src/srcdoc 을 떼고 sandbox 로 막아 스크립트가 실리 창(window.top) 권한으로 재실행되지 않게
    //  • last_mes 표식은 떼어 다른 확장의 "마지막 메시지" 감지에 안 걸리게
    function neutralizeRenderClone(clone) {
        clone.classList.remove('last_mes');
        clone.querySelectorAll('iframe').forEach(f => {
            f.removeAttribute('src');
            f.removeAttribute('srcdoc');
            f.setAttribute('sandbox', '');
        });
        clone.querySelectorAll('script').forEach(s => s.remove());
    }

    // 렌더 중 예외가 나면 라이브러리의 숨은 샌드박스 iframe 이 body 에 남을 수 있음 → 정리
    function removeOrphanSandboxes() {
        document.querySelectorAll('iframe[id^="__SANDBOX__"]').forEach(f => { try { f.remove(); } catch (e) { /* 무시 */ } });
    }

    // 숨김 모드: 메시지 상자를 #chat 안 보이지 않는 곳에 복제해 숨길 요소를 뺀 채 다시 배치 → 없던 것처럼 글이 이어짐
    // (라이브러리는 원본 요소 크기로 캔버스를 잡기 때문에, 복제본 안에서 지우기만 하면 빈 공간이 남음)
    async function renderMessageReflowed(lib, mes, rules, scale, hideSet) {
        const chat = document.querySelector('#chat') || mes.parentElement;
        const width = mes.getBoundingClientRect().width;
        tagFontsAndLines(mes);
        const clone = mes.cloneNode(true);
        clearTags(mes);
        // iframe 은 복제하면 다시 로드되어 로딩 상태로 찍히므로, 원본에서 먼저 이미지로 바꿔 둠
        await inlineIframes(lib, mes, clone, rules, scale, hideSet);
        clone.querySelectorAll(REMOVE_SELECTORS.join(',')).forEach(el => el.remove());
        const n = removeKinds(clone, hideSet, mes.getAttribute('mesid'));
        window.CopyBotCapture._lastRemoved = n;
        debugLog(`숨김 요소 ${n}개 제거 (${[...hideSet].join(', ')})`);
        await waitForImages(clone);
        applyRoleInline(clone, readShowSettings());
        clone.removeAttribute('mesid');
        clone.classList.add('copybot_capture_offscreen');
        neutralizeRenderClone(clone);
        clone.style.cssText += `;position:absolute;left:-20000px;top:0;width:${width}px;max-width:${width}px;pointer-events:none;`;
        chat.appendChild(clone);
        try {
            await new Promise(r => requestAnimationFrame(r));
            const backgroundColor = findBackgroundColor(mes);
            // 재배치된 복제본 기준으로 한 줄 여부를 다시 판정 (요소를 뺀 뒤 줄이 바뀔 수 있음)
            clearTags(clone);
            tagFontsAndLines(clone);
            const bands = measureBottomBands(clone);
            const canvas = await lib.domToCanvas(clone, libOptions({
                scale,
                backgroundColor,
                onCloneNode: (c) => { applyTags(c); anonymizeClone(c, rules); },
            }));
            window.CopyBotCapture._lastBottomBands = bands;
            return { canvas: cutBands(canvas, bands, scale), backgroundColor };
        } finally {
            clone.remove();
            removeOrphanSandboxes();
        }
    }

    async function renderMessage(lib, mesIndex, rules, scale, hideSet) {
        const mes = document.querySelector(`#chat .mes[mesid="${mesIndex}"]`);
        if (!mes || !mes.querySelector('.mes_text')) return null;
        if (isRoleTextHidden(mes, readShowSettings())) return null;   // 메시지 OFF 인 역할은 건너뜀
        if (hideSet && hideSet.size) return renderMessageReflowed(lib, mes, rules, scale, hideSet);
        await waitForImages(mes);
        // 유저가 보는 그대로: 본문(.mes_text)만 떼지 않고 메시지 상자(.mes) 전체를 렌더 → 좌우 여백·패딩·배경·줄간격이 화면과 같음
        const backgroundColor = findBackgroundColor(mes);
        const bands = measureBottomBands(mes);
        // 라이브러리는 같은출처 iframe 의 안쪽 문서를 스스로 복제해 넣으므로(복제본엔 iframe 태그가 남지 않음),
        // 안쪽 문서에도 미리 표식을 달아 두어야 복제본에서 글꼴·줄바꿈 정규화가 적용된다
        const innerDocs = [...mes.querySelectorAll('iframe')].map(f => { try { return f.contentDocument?.documentElement || null; } catch (e) { return null; } }).filter(Boolean);
        tagFontsAndLines(mes);
        innerDocs.forEach(tagFontsAndLines);
        let canvas;
        try {
            canvas = await lib.domToCanvas(mes, libOptions({
                scale,
                backgroundColor,
                filter: (node) => !(node && node.nodeType === 1) || !matchesAny(node, REMOVE_SELECTORS),
                onCloneNode: async (cloned) => {
                    if (cloned.querySelectorAll) {
                        applyTags(cloned);
                        applyRoleInline(cloned, readShowSettings());
                        // 호버 시에만 보이는 요소들이 캡처에 찍히지 않도록
                        cloned.querySelectorAll('[class*="hover"], .mes_hover').forEach(el => { el.style.visibility = 'hidden'; });
                        // 시각적 정규식/HTML 렌더 확장이 만든 iframe(상태창 등)은 복제만으론 속이 비어 찍힘 → 안쪽 문서를 따로 그려 이미지로 치환
                        await inlineIframes(lib, mes, cloned, rules, scale, null);
                    }
                    anonymizeClone(cloned, rules);
                },
            }));
        } finally {
            clearTags(mes);
            innerDocs.forEach(clearTags);
            removeOrphanSandboxes();
        }
        window.CopyBotCapture._lastBottomBands = bands;
        return { canvas: cutBands(canvas, bands, scale), backgroundColor };
    }

    async function toBlob(canvas) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('이미지를 만들지 못했습니다 (메모리 부족이거나 너무 큼). 범위를 나누거나 품질을 낮춰 주십시오.');
        return blob;
    }

    async function copyBlobToClipboard(blob) {
        if (!navigator.clipboard || typeof ClipboardItem === 'undefined') return false;
        try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            return true;
        } catch (error) {
            debugLog('클립보드 이미지 복사 실패', error);
            return false;
        }
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ===== ZIP (저장만, 압축 없음 — PNG 는 이미 압축됨) =====
    // 이미지가 여러 장이면 폴더 하나에 담긴 ZIP 한 개로 저장 (브라우저는 폴더를 직접 만들 수 없음)
    const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let v = n; for (let k = 0; k < 8; k++) v = (v & 1) ? (0xEDB88320 ^ (v >>> 1)) : (v >>> 1); t[n] = v >>> 0; } return t; })();
    function crc32(bytes) { let v = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) v = CRC_TABLE[(v ^ bytes[i]) & 0xFF] ^ (v >>> 8); return (v ^ 0xFFFFFFFF) >>> 0; }
    function dosDateTime(d) {
        return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
    }
    async function makeZip(entries) {   // [{ name, blob }] → Blob(zip)
        const enc = new TextEncoder();
        const parts = [], central = [];
        let offset = 0;
        const now = dosDateTime(new Date());
        for (const { name, blob } of entries) {
            const data = new Uint8Array(await blob.arrayBuffer());
            const nameBytes = enc.encode(name);
            const crc = crc32(data);
            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
            local.setUint16(10, now.time, true); local.setUint16(12, now.date, true); local.setUint32(14, crc, true);
            local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, nameBytes.length, true); local.setUint16(28, 0, true);
            parts.push(local.buffer, nameBytes, data);
            const cd = new DataView(new ArrayBuffer(46));
            cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true);
            cd.setUint16(12, now.time, true); cd.setUint16(14, now.date, true); cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
            cd.setUint16(28, nameBytes.length, true); cd.setUint16(30, 0, true); cd.setUint16(32, 0, true); cd.setUint16(34, 0, true); cd.setUint16(36, 0, true); cd.setUint32(38, 0, true); cd.setUint32(42, offset, true);
            central.push(cd.buffer, nameBytes);
            offset += 30 + nameBytes.length + data.length;
        }
        const cdSize = central.reduce((s, b) => s + b.byteLength, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
        end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
        return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
    }
    function stampName() {
        const d = new Date(), p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    }

    // 규칙 배열 정리: 원문 비어있는 것 제외, 긴 원문부터
    function normalizeRules(list) {
        return (Array.isArray(list) ? list : [])
            .map(r => ({ from: String(r?.from ?? '').trim(), to: String(r?.to ?? '') }))
            .filter(r => r.from)
            .sort((a, b) => b.from.length - a.from.length);
    }

    // 메시지 안 이미지가 다 로드될 때까지 잠깐 대기 (지연 로딩 이미지가 빈 칸으로 찍히지 않도록)
    async function waitForImages(root, timeoutMs = 4000) {
        const imgs = [...root.querySelectorAll('img')].filter(i => !i.complete);
        if (!imgs.length) return;
        await Promise.race([
            Promise.all(imgs.map(i => new Promise(resolve => { i.addEventListener('load', resolve, { once: true }); i.addEventListener('error', resolve, { once: true }); }))),
            new Promise(resolve => setTimeout(resolve, timeoutMs)),
        ]);
    }

    // 이미지 품질 → 렌더 배율. 'full'(기본) = 화면 픽셀 그대로(devicePixelRatio), 'light' = 그보다 작게(용량·속도 우선)
    function scaleForQuality(mode) {
        const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
        if (mode === 'light') return Math.max(1, Math.round(dpr * 2 / 3 * 4) / 4);
        if (typeof mode === 'number' && mode > 0) return Math.min(3, mode);   // 구버전 숫자값
        return dpr;
    }

    // 여러 조각을 세로로 이어 붙여 한 장으로 (메시지 상자마다 자체 여백이 있으므로 사이 간격 없음)
    async function composeParts(parts) {
        const width = Math.max(...parts.map(p => p.canvas.width));
        const height = parts.reduce((sum, p) => sum + p.canvas.height, 0);
        const out = document.createElement('canvas');
        out.width = width;
        out.height = height;
        const ctx2d = out.getContext('2d');
        ctx2d.fillStyle = parts[0].backgroundColor;
        ctx2d.fillRect(0, 0, width, height);
        let y = 0;
        parts.forEach(p => {
            ctx2d.fillStyle = p.backgroundColor;
            ctx2d.fillRect(0, y, width, p.canvas.height);
            ctx2d.drawImage(p.canvas, 0, y);
            y += p.canvas.height;
        });
        const blob = await toBlob(out);
        out.width = out.height = 0;   // 메모리 즉시 반환
        return { blob, width, height };
    }

    // ===== 이미지 가져오기 폴백 (2026-10-09) =====
    // 결과물은 SVG 로 그리므로 모든 이미지를 데이터 URL 로 받아야 하는데, 외부 호스트가 CORS 를 안 주면 라이브러리가 못 받아
    // 자리표시 그림만 남는다 — 미리보기(브라우저가 그림)에선 안 보이는 유일하게 흔한 "그대로" 구멍. 순서:
    //  1) 직접 cors 요청 → 2) 실리 CORS 프록시(/proxy/…, config.yaml enableCorsProxy) → 3) 그래도 안 되면 중립 회색 박스 + 렌더 끝에 개수 안내
    const IMG_PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" preserveAspectRatio="none"><rect width="100" height="100" fill="#e5e7eb"/><rect x="1" y="1" width="98" height="98" fill="none" stroke="#9ca3af" stroke-width="2" stroke-dasharray="4 3"/></svg>');
    let proxyDisabled = false;            // 실리 프록시가 꺼져 있으면(403) 이번 세션엔 더 시도하지 않음
    let imageFetchStats = null;           // 렌더 1회 동안: { direct, proxied, failed: Set<host>, cache: Map<url, dataUrl> }
    function beginImageFetchStats() { imageFetchStats = { direct: 0, proxied: 0, failed: new Set(), cache: new Map() }; }
    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = () => reject(fr.error); fr.readAsDataURL(blob); });
    }
    async function fetchImageWithFallback(url) {
        if (!imageFetchStats) beginImageFetchStats();
        const stats = imageFetchStats;
        if (!url || /^(data|blob):/i.test(url)) return null;                // 라이브러리가 그대로 처리
        let u; try { u = new URL(url, location.href); } catch (e) { return null; }
        if (u.origin === location.origin) return null;                      // 같은 출처: 라이브러리 기본 경로(쿠키 포함)
        if (stats.cache.has(u.href)) return stats.cache.get(u.href);
        let result = null;
        try {
            const r = await fetch(u.href, { mode: 'cors', credentials: 'omit' });
            if (r.ok) { const b = await r.blob(); if (b.size > 0) { result = await blobToDataUrl(b); stats.direct++; } }
        } catch (e) { /* 아래 프록시로 */ }
        if (!result && !proxyDisabled) {
            try {
                const r = await fetch('/proxy/' + u.href, { credentials: 'same-origin' });
                if (r.status === 403) proxyDisabled = true;
                else if (r.ok) { const b = await r.blob(); if (b.size > 0) { result = await blobToDataUrl(b); stats.proxied++; } }
            } catch (e) { /* 실패 */ }
        }
        if (!result) { stats.failed.add(u.host); result = IMG_PLACEHOLDER; }
        stats.cache.set(u.href, result);
        return result;
    }
    // 라이브러리 렌더 옵션 공통 묶음 (모든 domToCanvas/domToDataUrl 호출이 이걸 쓴다)
    function libOptions(extra) {
        return { ...extra, fetchFn: fetchImageWithFallback, fetch: { requestInit: { mode: 'cors', credentials: 'same-origin' }, placeholderImage: IMG_PLACEHOLDER } };
    }
    function reportImageFetchStats() {
        const s = imageFetchStats;
        if (!s) return;
        debugLog('이미지 가져오기: 직접', s.direct, '프록시', s.proxied, '실패', [...s.failed]);
        if (s.failed.size) {
            const hosts = [...s.failed].slice(0, 3).join(', ');
            toastr.warning(`외부 이미지 ${s.failed.size}곳(${hosts})은 호스트가 막아서 캡처에 못 넣었습니다(회색 자리).${proxyDisabled ? ' 실리 config.yaml 의 enableCorsProxy 를 켜면 들어갑니다.' : ''}`, '', { timeOut: 7000 });
        }
        imageFetchStats = null;
    }

    // ===== 진행 토스트 (화면에 1개만, [중단] 버튼) =====
    let captureState = null;   // { aborted, toast }

    // [중단] 버튼 리스너는 첫 토스트 때 1회만 등록 (캡처를 안 쓰면 전역 리스너 0)
    let abortHandlerBound = false;
    function ensureAbortHandler() {
        if (abortHandlerBound) return;
        abortHandlerBound = true;
        $(document).off('click.copybot_capture_abort').on('click.copybot_capture_abort', '.copybot_capture_abort', function(e) {
            e.preventDefault(); e.stopPropagation();
            if (captureState) captureState.aborted = true;
            $(this).prop('disabled', true).text('중단 중…');
        });
    }

    function showCaptureToast(text) {
        ensureAbortHandler();
        const html = `<div class="copybot_stage_toast copybot_capture_toast"><span class="copybot_stage_text">${window.CopyBotUtils.escapeHtml(text)}</span><button type="button" class="copybot_capture_abort">중단</button></div>`;
        const $existing = $('.copybot_capture_toast').last().closest('.toast');
        if ($existing.length) { $existing.find('.toast-message').html(html); return $existing; }
        const $toast = toastr.info(html, '', { timeOut: 0, extendedTimeOut: 0, tapToDismiss: false, closeButton: false, escapeHtml: false, preventDuplicates: false });
        const $all = $('.copybot_capture_toast').closest('.toast');
        if ($all.length > 1) $all.slice(0, -1).remove();
        return $toast;
    }

    function clearCaptureToast() {
        $('.copybot_capture_toast').closest('.toast').each(function() { toastr.clear($(this), { force: true }); $(this).remove(); });
    }

    // ===== 부하 예측 =====
    // 한 장(캔버스)의 최대 세로 픽셀: 이보다 길어지면 여러 장으로 나눔 (브라우저 캔버스 한계 16384 보다 넉넉히 아래, 메모리 ~50MB)
    const MAX_IMAGE_HEIGHT_PX = 12000;
    const SOFT_LIMIT = { count: 20, megapixels: 40 };     // 넘으면 확인 팝업
    const HARD_LIMIT = { count: 100, megapixels: 250 };   // 넘으면 거절

    // 아직 안 그려진 메시지는 글자 수로 높이를 어림 (한글 기준 1글자 ≈ 글꼴 크기 폭)
    function estimateMessageHeight(index, chatWidth) {
        const el = document.querySelector(`#chat .mes[mesid="${index}"]`);
        if (el) return el.getBoundingClientRect().height;
        const context = getContext();
        const text = String(context?.chat?.[index]?.mes || '');
        const fontSize = parseFloat(getComputedStyle(document.body).fontSize) || 15;
        const charsPerLine = Math.max(10, Math.floor((chatWidth - 60) / fontSize));
        const lines = text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
        return lines * fontSize * 1.6 + 80;
    }

    function confirmPopup(text) {
        const context = getContext();
        try {
            if (typeof context?.callGenericPopup === 'function') {
                const type = context.POPUP_TYPE?.CONFIRM ?? 2;
                return Promise.resolve(context.callGenericPopup(text, type, '', { okButton: '캡처하기', cancelButton: '취소' }))
                    .then(r => r === (context.POPUP_RESULT?.AFFIRMATIVE ?? 1) || r === true);
            }
        } catch (e) { /* 폴백 */ }
        return Promise.resolve(window.confirm(text));
    }

    // ===== 숨김 종류 계산 =====
    // 공통: 옵션 select(자동 생성 이미지·선택지·에셋) + 그 밖의 고정 종류 숨김 맵(hideGlobal). 캐릭터별: 동적 블록 숨김 맵(hideChar).
    const KIND_FROM_OPTION = { skipImages: 'genimg', skipChoices: 'choice', skipAssets: 'asset', skipStatus: 'stat' };

    function computeHideSet(settings) {
        const set = new Set();
        for (const [opt, kind] of Object.entries(KIND_FROM_OPTION)) if (settings[opt]) set.add(kind);
        for (const [kind, hidden] of Object.entries(settings.hideGlobal || {})) { if (hidden && isFixedKind(kind)) set.add(kind); }
        for (const [kind, hidden] of Object.entries(settings.hideChar || {})) { if (hidden && !isFixedKind(kind)) set.add(kind); }
        return set;
    }

    // ===== 살아있는 미리보기 =====
    // 캡처 버튼 → 느린 이미지 렌더 대신, 메시지 상자 복제본을 같은 CSS 환경(실리 스타일시트·body 클래스·#sheld>#chat 구조)을
    // 갖춘 미리보기 iframe 문서에 넣어 즉시 보여준다. 요소 종류 체크는 복제본에 .copybot_kind_hidden 을 켜고 끄는 것뿐이라 바로 반영.
    // 이미지는 사용자가 복사/저장을 누를 때 그 미리보기 상태 그대로 한 번만 렌더한다.
    let preview = null;   // { s, e, frame, doc, chatWidth, items: [{ index, el }], kinds, rules, timer }

    function kindMarkerFor(el) {
        return kindOf(el) || blockKindOf(el);
    }

    // 복제본의 요소에 data-cb-kind 표식 (선택지는 블록 단위·프레임 단위로)
    function annotateKinds(cloneMes, mesIndex = null) {
        const counts = new Map();
        const add = (id) => counts.set(id, (counts.get(id) || 0) + 1);
        const block = cloneMes.querySelector('.mes_block') || cloneMes;
        const skipSel = COLLAPSE_SELECTORS.concat(BLANK_SELECTORS).join(',');
        const marked = [];
        for (const el of block.querySelectorAll('*')) {
            if (el.closest(skipSel)) continue;
            const id = kindMarkerFor(el);
            if (!id) continue;
            if (marked.some(m => m.id === id && m.el !== el && m.el.contains(el))) continue;   // 같은 종류가 겹치면 바깥 것만
            el.setAttribute('data-cb-kind', id);
            marked.push({ el, id });
            add(id);
        }
        // 선택지: 블록 단위로 표식 (removeChoices 와 같은 판정, 제거 대신 표식)
        const text = cloneMes.querySelector('.mes_text') || cloneMes;
        const choiceBlocks = collectChoiceBlocks(text);
        choiceBlocks.forEach(el => { el.setAttribute('data-cb-kind', 'choice'); add('choice'); });
        // 태그만 벗겨진 글자 상태창: 원문 대조로 찾은 구간의 요소마다 표식 (구간당 1개로 셈)
        if (mesIndex !== null) {
            collectStatusTextBlocks(text, rawMessageText(mesIndex)).forEach(block => {
                block.forEach(el => { if (!el.hasAttribute('data-cb-kind')) el.setAttribute('data-cb-kind', 'stat'); });
                add('stat');
            });
        }
        // 정규식 래퍼(block:div.TH-render 등) 안에 상태창/선택지/프레임 하나만 들어 있으면 래퍼를 그 종류로 승격
        promoteWrappers(block).forEach(id => { counts.set(id, Math.max(0, (counts.get(id) || 0) - 1)); if (!counts.get(id)) counts.delete(id); });
        return counts;
    }

    // 상태창·선택지·프레임 표식이 "그것만 담은" 래퍼(정규식이 만든 div 등) 안에 있으면 표식을 래퍼로 올린다.
    // → 숨길 때 빈 껍데기가 안 남고, 요소 목록에 "블록 <div.TH-render>" 대신 "상태창"으로 보인다. 반환: 사라진 래퍼 종류 id 목록(개수 보정용)
    const PROMOTE_KINDS = new Set(['stat', 'choice', 'frame']);
    function promoteWrappers(root) {
        const removedWrapperKinds = [];
        for (let inner of [...root.querySelectorAll('[data-cb-kind]')]) {
            const kind = inner.getAttribute('data-cb-kind');
            if (!PROMOTE_KINDS.has(kind)) continue;
            let p = inner.parentElement;
            while (p && p !== root && !p.classList.contains('mes_text') && !p.classList.contains('mes_block')) {
                const pk = p.getAttribute('data-cb-kind');
                if (pk && !pk.startsWith('block:')) break;                       // 다른 고정 종류 래퍼면 중단
                const onlyChild = p.children.length === 1 && p.firstElementChild === inner;
                const hasText = [...p.childNodes].some(n => n.nodeType === 3 && (n.textContent || '').trim());
                if (!onlyChild || hasText) break;
                if (pk) removedWrapperKinds.push(pk);
                p.setAttribute('data-cb-kind', kind);
                inner.removeAttribute('data-cb-kind');
                inner = p;
                p = p.parentElement;
            }
        }
        return removedWrapperKinds;
    }

    // 프레임 표식 보정: 미리보기 iframe 이 로드된 뒤 선택지처럼 보이는 프레임은 'choice' 로 바꿈
    function reclassifyChoiceFrames(doc) {
        let changed = false;
        for (const f of doc.querySelectorAll('.mes iframe')) {
            // 표식이 래퍼로 승격돼 있을 수 있으므로 가장 가까운 표식 요소를 바꾼다
            const holder = f.closest('[data-cb-kind]');
            if (!holder || holder.getAttribute('data-cb-kind') !== 'frame') continue;
            try {
                if (iframeLooksLikeChoices(f.contentDocument)) { holder.setAttribute('data-cb-kind', 'choice'); changed = true; }
                else if (iframeLooksLikeStatus(f.contentDocument)) { holder.setAttribute('data-cb-kind', 'stat'); changed = true; }
            } catch (e) { /* 다른 출처 */ }
        }
        if (changed) doc.querySelectorAll('.mes').forEach(m => promoteWrappers(m.querySelector('.mes_block') || m));
        return changed;
    }

    function previewKindCounts() {
        const counts = {};
        if (!preview) return counts;
        preview.doc.querySelectorAll('[data-cb-kind]').forEach(el => {
            // 우리가 숨긴 건 세고(“(뺌)” 표시용), 원래부터 화면에 없는 잔재(정규식이 남긴 display:none 원본 등)는 세지 않음
            if (!el.classList.contains('copybot_kind_hidden') && !el.closest('.copybot_kind_wrap_hidden') && !el.getClientRects().length) return;
            const id = el.getAttribute('data-cb-kind'); counts[id] = (counts[id] || 0) + 1;
        });
        return counts;
    }

    // ===== 요소 넣고 빼기 되돌리기(↶)·다시하기(↷) =====
    // 숨김 집합의 스냅샷을 순서대로 쌓는다. 어디서 바꿨든(꾹 누르기·요소 목록·⚙ 옵션 select) 전부 applyHiddenToPreview 를 지나므로
    // 거기서 "직전 스냅샷과 다르면 한 칸 추가". 되돌리기는 "가장 최근 변경"을 되돌리는 것이라 경로가 달라도 충돌이 없다.
    // 스택은 미리보기 한 건(채팅·범위) 한정: 다른 범위/채팅을 열거나 비우면 초기화. 크게보기 이동·접기/펼치기는 유지.
    let hideHistory = null;   // { key, stack: [sig], pos, applying }
    const hideSig = (set) => sortKindIds(set).join(',');
    const hideHistoryKey = () => preview ? `${window.CopyBotCapture.currentChatKey() || ''}|${preview.s}|${preview.e}` : null;

    function recordHideHistory(hideSet) {
        if (!preview) return;
        const key = hideHistoryKey();
        const sig = hideSig(hideSet);
        if (!hideHistory || hideHistory.key !== key) { hideHistory = { key, stack: [sig], pos: 0, applying: false }; }
        else if (!hideHistory.applying && sig !== hideHistory.stack[hideHistory.pos]) {
            hideHistory.stack.length = hideHistory.pos + 1;
            hideHistory.stack.push(sig);
            hideHistory.pos++;
            if (hideHistory.stack.length > 50) { hideHistory.stack.shift(); hideHistory.pos--; }
        }
        window.CopyBotUI?.renderCaptureHistory?.();
    }

    function resetHideHistory() {
        hideHistory = null;
        window.CopyBotUI?.renderCaptureHistory?.();
    }

    // 스택의 pos 위치 스냅샷으로 이동: 지금 숨김 집합과 다른 종류만 setKindHidden 으로 맞춘다 (설정도 함께 그 시점으로)
    function gotoHideHistory(pos) {
        if (!preview || !hideHistory || pos < 0 || pos >= hideHistory.stack.length) return false;
        const C = window.CopyBotCapture;
        const target = new Set(hideHistory.stack[pos].split(',').filter(Boolean));
        const current = computeHideSet(C.getSettings());
        hideHistory.applying = true;
        try {
            for (const kind of target) if (!current.has(kind)) C.setKindHidden(kind, true);
            for (const kind of current) if (!target.has(kind)) C.setKindHidden(kind, false);
        } finally { hideHistory.applying = false; }
        hideHistory.pos = pos;
        // 일부를 못 바꿨으면(캐릭터 없음 등) 실제 상태를 그 칸에 기록해 스택과 화면이 어긋나지 않게
        hideHistory.stack[pos] = hideSig(computeHideSet(C.getSettings()));
        try { window.CopyBotSettings?.saveSettings?.(); } catch (e) { /* 무시 */ }
        applyHiddenToPreview();
        window.CopyBotUI?.renderCaptureKinds?.();
        return true;
    }

    // 숨김 상태를 미리보기 문서에 즉시 반영
    function applyHiddenToPreview() {
        if (!preview) return;
        const settings = window.CopyBotCapture.getSettings();
        const hideSet = computeHideSet(settings);
        recordHideHistory(hideSet);
        preview.doc.querySelectorAll('.copybot_kind_wrap_hidden').forEach(el => el.classList.remove('copybot_kind_wrap_hidden'));
        preview.doc.querySelectorAll('[data-cb-kind]').forEach(el => {
            const hidden = hideSet.has(el.getAttribute('data-cb-kind'));
            el.classList.toggle('copybot_kind_hidden', hidden);
            // 숨긴 요소 하나만 감싼 상자(정규식 래퍼 등)는 빈 껍데기(여백·테두리)가 남지 않게 같이 접음
            if (hidden) {
                const p = el.parentElement;
                const otherContent = p && [...p.childNodes].some(n => n !== el && (n.nodeType === 1 || (n.textContent || '').trim()));
                if (p && !p.classList.contains('mes_text') && !p.classList.contains('mes_block') && !otherContent) p.classList.add('copybot_kind_wrap_hidden');
            }
        });
        const roles = preview.doc.getElementById('copybot_preview_roles');
        if (roles) roles.textContent = buildRoleCss(settings.show);
        schedulePreviewResize();
    }

    function previewContentHeight() {
        if (!preview) return 0;
        const chat = preview.doc.getElementById('chat');
        const r = chat ? chat.getBoundingClientRect() : null;
        const win = preview.doc.defaultView;
        return r ? Math.ceil(r.bottom + (win ? win.scrollY : 0)) : (preview.doc.body ? preview.doc.body.scrollHeight : 0);
    }

    // iframe 은 내용 높이만큼 통째로 두고(안에서는 스크롤 안 함), 스크롤은 바깥 상자(.copybot_capture_overlay_body)가 맡는다.
    // (예전엔 iframe 안에서 스크롤했는데, 축소(scale)된 iframe 안 스크롤은 안드로이드에서 한 번씩 걸려 두 번 밀어야 했음 — 2026-10-09)
    function resizePreviewFrame() {
        if (!preview || !preview.frame.isConnected) return;
        const frame = preview.frame;
        const holder = frame.parentElement;
        if (!holder) return;
        const avail = holder.clientWidth || holder.getBoundingClientRect().width;
        if (!(avail > 0)) return;
        const k = preview.chatWidth > avail ? avail / preview.chatWidth : 1;
        const contentH = Math.max(80, Math.ceil(previewContentHeight()));
        holder.style.height = `${Math.ceil(contentH * k)}px`;
        frame.style.transform = k < 1 ? `scale(${k})` : '';
        frame.style.height = `${contentH}px`;
    }

    // (2026-10-09 유저 결정) 메시지 아래 빈 띠를 재서 잘라내던 범용 트림은 없앰 — 말풍선 안 여백·메시지 사이 간격까지 잘라
    // 라이브 화면보다 빽빽해졌음. 대신 복제본에서 조작 영역 두 곳만 정확히 되돌린다 (makePreviewClone: last_mes 특수 여백, 이미지 조작 버튼 여백).
    function schedulePreviewResize() {
        if (!preview) return;
        requestAnimationFrame(() => { resizePreviewFrame(); setTimeout(resizePreviewFrame, 250); });
    }

    // ===== viewport 단위 보정 =====
    // 문제: iframe 안에서 vh/vw 는 iframe 자기 크기 기준이라, 작은 미리보기에선 `.mes_img{max-height:40vh}` 같은 값이 쪼그라들고
    //       전체 화면에선 커진다 → 미리보기가 결과물(본 화면 기준으로 렌더)과 달라짐.
    // 대응: 본 화면의 100vh/100vw 실제 px 를 재고, 페이지의 모든 스타일 규칙 중 vh/vw/vmin/vmax 를 쓰는 선언을 같은 선택자·같은
    //       미디어 조건으로 px 로 바꾼 덮어쓰기 규칙을 만들어 미리보기 문서 맨 뒤에 넣는다.
    function measureViewportUnits() {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;visibility:hidden;pointer-events:none;';
        document.body.appendChild(probe);
        const r = probe.getBoundingClientRect();
        probe.remove();
        return { vh: r.height || window.innerHeight, vw: r.width || window.innerWidth };
    }

    const VIEWPORT_UNIT_RE = /(-?\d*\.?\d+)(d|s|l)?(vh|vw|vmin|vmax)\b/gi;

    function convertViewportUnits(value, units) {
        return value.replace(VIEWPORT_UNIT_RE, (m, num, prefix, unit) => {
            const n = parseFloat(num);
            let base;
            switch (unit.toLowerCase()) {
                case 'vh': base = units.vh; break;
                case 'vw': base = units.vw; break;
                case 'vmin': base = Math.min(units.vh, units.vw); break;
                default: base = Math.max(units.vh, units.vw);
            }
            return `${Math.round(n * base / 100 * 100) / 100}px`;
        });
    }

    function buildViewportOverrideCss() {
        const units = measureViewportUnits();
        const out = [];
        let count = 0;
        const walk = (rules, wrap) => {
            for (const rule of rules) {
                try {
                    if (rule.cssRules && rule.cssRules.length && (rule.conditionText !== undefined || rule.media)) {
                        const cond = rule.conditionText !== undefined ? rule.conditionText : (rule.media ? rule.media.mediaText : '');
                        const kw = rule instanceof CSSMediaRule ? '@media' : (typeof CSSSupportsRule !== 'undefined' && rule instanceof CSSSupportsRule ? '@supports' : null);
                        if (!kw) continue;
                        walk(rule.cssRules, wrap.concat(`${kw} ${cond}`));
                        continue;
                    }
                    if (!rule.selectorText || !rule.style) continue;
                    const decls = [];
                    for (let i = 0; i < rule.style.length; i++) {
                        const prop = rule.style[i];
                        const val = rule.style.getPropertyValue(prop);
                        if (!val || !VIEWPORT_UNIT_RE.test(val)) { VIEWPORT_UNIT_RE.lastIndex = 0; continue; }
                        VIEWPORT_UNIT_RE.lastIndex = 0;
                        const pri = rule.style.getPropertyPriority(prop);
                        decls.push(`${prop}: ${convertViewportUnits(val, units)}${pri ? ' !important' : ''};`);
                    }
                    if (!decls.length) continue;
                    count += decls.length;
                    let text = `${rule.selectorText} { ${decls.join(' ')} }`;
                    for (let k = wrap.length - 1; k >= 0; k--) text = `${wrap[k]} { ${text} }`;
                    out.push(text);
                } catch (e) { /* 개별 규칙 실패는 무시 */ }
            }
        };
        for (const sheet of document.styleSheets) {
            let rules;
            try { rules = sheet.cssRules; } catch (e) { continue; }   // 다른 출처 시트: 접근 불가
            if (!rules) continue;
            walk(rules, []);
        }
        debugLog(`viewport 단위 보정 ${count}개 (100vh=${units.vh}px, 100vw=${units.vw}px)`);
        return { css: out.join('\n'), units };
    }

    // 미리보기 문서 만들기 (실리 스타일 환경 복제)
    async function createPreviewDoc(frame, chatWidth, backgroundColor) {
        const doc = frame.contentDocument;
        doc.open();
        doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="sheld"><div id="chat"></div></div></body></html>');
        doc.close();
        const base = doc.createElement('base');
        base.href = document.baseURI;
        doc.head.appendChild(base);
        const loads = [];
        for (const node of document.querySelectorAll('link[rel~="stylesheet"], style')) {
            if (node.id === 'copybot_preview_style') continue;
            const copy = node.cloneNode(true);
            if (copy.tagName === 'LINK') loads.push(new Promise(resolve => { copy.addEventListener('load', resolve, { once: true }); copy.addEventListener('error', resolve, { once: true }); }));
            doc.head.appendChild(copy);
        }
        const own = doc.createElement('style');
        own.id = 'copybot_preview_style';
        own.textContent = `
            html { margin: 0 !important; padding: 0 !important; height: auto !important; overflow: hidden !important; background: ${backgroundColor} !important; }
            body { margin: 0 !important; padding: 0 !important; overflow: visible !important; height: auto !important; min-height: 0 !important; background: ${backgroundColor} !important; }
            #sheld { position: static !important; margin-left: 0 !important; width: ${chatWidth}px !important; max-width: none !important; height: auto !important; max-height: none !important; margin: 0 !important; padding: 0 !important; transform: none !important; display: block !important; }
            #chat { position: static !important; width: ${chatWidth}px !important; max-width: none !important; height: auto !important; max-height: none !important; overflow: visible !important; margin: 0 !important; display: flow-root !important; padding-bottom: 0 !important; }
            .copybot_kind_hidden, .copybot_kind_wrap_hidden { display: none !important; }
            .copybot_kind_focus { outline: 2px dashed #e8a838 !important; outline-offset: 2px; }
            #copybot_kind_popup { position: absolute; z-index: 2147483000; display: flex; flex-direction: column; gap: 4px; padding: 8px; border-radius: 8px; background: rgba(30, 30, 30, 0.96); color: #fff; font: 13px/1.4 sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,0.4); max-width: 260px; }
            #copybot_kind_popup button { padding: 7px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.12); color: #fff; font-size: 13px; text-align: left; cursor: pointer; }
            #copybot_kind_popup button.copybot_kind_popup_close { background: transparent; opacity: 0.8; text-align: center; }
            ${REMOVE_SELECTORS.map(s => `.mes ${s}`).join(', ')} { display: none !important; }
        `;
        doc.head.appendChild(own);
        // 표시 요소(봇/유저 × 프사·이름·메시지) 규칙 — applyHiddenToPreview 가 옵션 변경 때마다 갈아끼움
        const roles = doc.createElement('style');
        roles.id = 'copybot_preview_roles';
        roles.textContent = buildRoleCss(readShowSettings());
        doc.head.appendChild(roles);
        // vh/vw → 본 화면 기준 px (미리보기가 결과물과 같아야 함)
        try {
            const vp = buildViewportOverrideCss();
            const fix = doc.createElement('style');
            fix.id = 'copybot_preview_viewport_fix';
            fix.textContent = vp.css;
            doc.head.appendChild(fix);
        } catch (e) { debugLog('viewport 보정 실패', e); }
        doc.documentElement.className = document.documentElement.className;
        doc.documentElement.setAttribute('style', document.documentElement.getAttribute('style') || '');
        doc.body.className = document.body.className;
        doc.body.setAttribute('style', document.body.getAttribute('style') || '');
        await Promise.race([Promise.all(loads), new Promise(r => setTimeout(r, 4000))]);
        return doc;
    }

    // 복제본 준비 (원본은 건드리지 않음)
    // cloneNode 는 속성만 복사하고 "지금 체크됨/입력값/선택값" 같은 현재 상태는 안 가져옴 → 원본과 같은 순서로 맞춰 줌
    function syncFormState(origRoot, cloneRoot) {
        const o = [...origRoot.querySelectorAll('input, textarea, select')];
        const k = [...cloneRoot.querySelectorAll('input, textarea, select')];
        for (let i = 0; i < o.length && i < k.length; i++) {
            try {
                if (o[i].tagName === 'INPUT' && (o[i].type === 'checkbox' || o[i].type === 'radio')) k[i].checked = o[i].checked;
                else if (o[i].tagName === 'SELECT') k[i].value = o[i].value;
                else k[i].value = o[i].value;
            } catch (e) { /* 무시 */ }
        }
    }

    // 문서를 문자열로 직렬화하기 전에 현재 폼 상태를 속성에 반영 (끝나면 원복) — 접힘/펼침이 체크박스로 된 상태창 대응
    function withFormStateAsAttributes(doc, fn) {
        const touched = [];
        try {
            for (const el of doc.querySelectorAll('input, textarea, select')) {
                if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
                    const had = el.hasAttribute('checked');
                    if (el.checked !== had) { touched.push({ el, kind: 'checked', had }); if (el.checked) el.setAttribute('checked', ''); else el.removeAttribute('checked'); }
                } else if (el.tagName === 'INPUT') {
                    const prev = el.getAttribute('value');
                    if (prev !== el.value) { touched.push({ el, kind: 'value', prev }); el.setAttribute('value', el.value); }
                } else if (el.tagName === 'TEXTAREA') {
                    if (el.textContent !== el.value) { touched.push({ el, kind: 'text', prev: el.textContent }); el.textContent = el.value; }
                }
            }
            return fn();
        } finally {
            for (const t of touched) {
                if (t.kind === 'checked') { if (t.had) t.el.setAttribute('checked', ''); else t.el.removeAttribute('checked'); }
                else if (t.kind === 'value') { if (t.prev === null) t.el.removeAttribute('value'); else t.el.setAttribute('value', t.prev); }
                else t.el.textContent = t.prev;
            }
        }
    }

    // ===== 미리보기 격리 ("평행세계", 2026-10-09 유저 지시) =====
    // 스냅샷 상태창 안에서 스크립트는 그대로 돌되(상호작용 유지), 바깥 세계엔 손을 못 대게 한다:
    //  parent/top → 자기 자신(실리 창·미리보기 창 접근 불가), postMessage 무력화, fetch/XHR/WebSocket/EventSource/sendBeacon 차단,
    //  localStorage/sessionStorage/indexedDB/cookie 차단. 다른 스크립트보다 먼저 실행되도록 <head> 맨 앞에 넣는다.
    // 브라우저 수준 차단(스크립트가 window.fetch 를 되살려도 막힘): 네트워크 연결·폼 전송 금지. 이미지/스타일 로드는 그대로.
    // 한계: window.top 은 브라우저가 덮어쓰기를 금지(unforgeable)해서 막지 못함 — 완전 격리는 별도 설계(불투명 출처 + 안쪽 렌더 에이전트) 필요.
    const ISOLATION_PRELUDE = '<meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; form-action \'none\';">'
        + '<script data-copybot-isolation="1">(function(){try{'
        + 'var w=window;'
        + 'var shadow=function(n,v){try{Object.defineProperty(w,n,{configurable:true,get:function(){return v;}});}catch(e){}};'
        + 'shadow("parent",w);shadow("top",w);shadow("frameElement",null);shadow("opener",null);'
        + '["localStorage","sessionStorage","indexedDB","caches","openDatabase"].forEach(function(n){try{Object.defineProperty(w,n,{configurable:true,get:function(){return undefined;}});}catch(e){}});'
        + 'var blocked=function(){throw new Error("copybot preview: blocked");};'
        + 'try{w.fetch=blocked;}catch(e){}'
        + 'try{w.XMLHttpRequest=blocked;}catch(e){}'
        + 'try{w.WebSocket=blocked;}catch(e){}'
        + 'try{w.EventSource=blocked;}catch(e){}'
        + 'try{w.postMessage=function(){};}catch(e){}'
        + 'try{navigator.sendBeacon=function(){return false;};}catch(e){}'
        + 'try{Object.defineProperty(document,"cookie",{configurable:true,get:function(){return "";},set:function(){}});}catch(e){}'
        + '}catch(e){}})();</script>';
    function injectIsolation(html) {
        if (html.indexOf('data-copybot-isolation') !== -1) return html;   // 이미 격리된 문서(미리보기 재스냅샷)
        const head = html.match(/<head[^>]*>/i);
        if (head) return html.slice(0, head.index + head[0].length) + ISOLATION_PRELUDE + html.slice(head.index + head[0].length);
        const root = html.match(/<html[^>]*>/i);
        if (root) return html.slice(0, root.index + root[0].length) + ISOLATION_PRELUDE + html.slice(root.index + root[0].length);
        return ISOLATION_PRELUDE + html;
    }

    // 상태창 iframe: 복제하면 srcdoc 이 처음부터 다시 실행돼 접힘/펼침·진행 상태가 초기화된다.
    // → 원본 iframe 안 문서의 "지금 그려진 DOM" 을 **스크립트를 떼고** 그대로 직렬화해 복제본의 srcdoc 으로 넣고, 높이·스크롤 위치도 지금 보이는 값 그대로.
    // (2026-10-09 유저 결정: 미리보기 안에서 상태창 스크립트가 '동작'하는 건 포기, 대신 보는 화면 그대로. 스크립트가 다시 돌면
    //  외부 스크립트 재다운로드로 늦게 뜨고, 부모 창(실리)을 못 읽어 유저 이름이 기본값 '사용자'로 바뀌고, 높이가 바뀌며 미리보기가 들썩였음)
    function stripScripts(root) {
        root.querySelectorAll('script').forEach(s => { if (!s.hasAttribute('data-copybot-isolation')) s.remove(); });
        for (const el of root.querySelectorAll('*')) {
            for (const a of [...el.attributes]) { if (/^on/i.test(a.name)) el.removeAttribute(a.name); }
        }
        return root;
    }
    function snapshotIframes(origMes, cloneMes, rules = []) {
        const orig = [...origMes.querySelectorAll('iframe')];
        const cl = [...cloneMes.querySelectorAll('iframe')];
        for (let i = 0; i < orig.length && i < cl.length; i++) {
            let doc;
            try { doc = orig[i].contentDocument; } catch (e) { doc = null; }
            if (!doc || !doc.documentElement) continue;   // 다른 출처: 그대로 둠
            try {
                // 익명화 규칙은 상태창 문서 안 글자에도 (미리보기 = 결과물: 결과 이미지는 inlineIframes 가 같은 규칙을 적용함)
                const html = injectIsolation(withFormStateAsAttributes(doc, () => { const root = stripScripts(doc.documentElement.cloneNode(true)); anonymizeClone(root, rules); return '<!DOCTYPE html>' + root.outerHTML; }));
                cl[i].removeAttribute('src');
                cl[i].setAttribute('srcdoc', html);
                const h = orig[i].getBoundingClientRect().height;
                if (h > 0) cl[i].style.height = `${Math.round(h)}px`;   // 라이브와 같은 높이 (안에서 스크롤되는 작은 상자면 그대로 작은 상자)
                const se = doc.scrollingElement || doc.documentElement;
                cl[i].setAttribute('data-cb-static', '1');
                cl[i].setAttribute('data-cb-scroll', String(Math.round(se ? se.scrollTop : 0)));
            } catch (e) { debugLog('상태창 스냅샷 실패(그대로 둠)', e); }
        }
    }

    // 미리보기 안 상태창 iframe(정적 스냅샷): 높이는 스냅샷 때 잰 라이브 값 그대로 두고, 로드되면 라이브의 스크롤 위치 복원 + 꾹 누르기만 붙인다
    function attachStaticFrame(frame) {
        if (frame.__cbStatic) return;
        const hook = () => {
            let doc;
            try { doc = frame.contentDocument; } catch (e) { return; }
            if (!doc || !doc.body) return;
            const top = parseFloat(frame.getAttribute('data-cb-scroll')) || 0;
            if (top > 0) { try { (doc.scrollingElement || doc.documentElement).scrollTop = top; } catch (e) { /* 무시 */ } }
            installKindLongPress(doc, frame);
            schedulePreviewResize();
        };
        frame.__cbStatic = true;
        frame.addEventListener('load', hook);
        try { if (frame.contentDocument && frame.contentDocument.readyState === 'complete' && frame.contentDocument.body) hook(); } catch (e) { /* 무시 */ }
    }

    // ===== 꾹 누르기 → "이 요소 빼기" 팝업 (알못 친화) =====
    // 미리보기 안 시각 요소를 ~0.6초 누르면 팝업. 다음 일반 터치가 올 때까지 유지. 팝업의 버튼으로 그 종류를 캡처에서 뺌.
    const LONG_PRESS_MS = 550;

    function closeKindPopup() {
        if (!preview) return;
        preview.doc.getElementById('copybot_kind_popup')?.remove();
        preview.doc.querySelectorAll('.copybot_kind_focus').forEach(el => el.classList.remove('copybot_kind_focus'));
    }

    // 눌린 요소에서 바깥쪽으로 표식 달린 조상들 (안쪽부터 최대 3개)
    function markedChain(el) {
        const chain = [];
        // 미리보기 iframe 문서의 요소는 바깥 창의 Element 와 다른 realm 이라 instanceof 로 못 가림 → nodeType 으로
        let cur = (el && el.nodeType === 1 && el.closest) ? el.closest('[data-cb-kind]') : null;
        while (cur && chain.length < 3) { chain.push(cur); cur = cur.parentElement ? cur.parentElement.closest('[data-cb-kind]') : null; }
        return chain;
    }

    function showKindPopup(targets, x, y) {
        if (!preview || !targets.length) return;
        closeKindPopup();
        const doc = preview.doc;
        const pop = doc.createElement('div');
        pop.id = 'copybot_kind_popup';
        targets[0].classList.add('copybot_kind_focus');
        // 고정 종류(상태창·이미지·선택지·표…)는 공통(모든 봇) 설정을, 동적 블록은 이 캐릭터 설정을 바꾼다 — 범위를 버튼 글자에 그대로 적는다 (2026-10-09 회의 결론)
        targets.forEach(t => {
            const kind = t.getAttribute('data-cb-kind');
            const b = doc.createElement('button');
            b.type = 'button';
            b.textContent = `"${kindLabel(kind)}" 빼기 · ${isFixedKind(kind) ? '모든 봇' : '이 봇만'}`;
            b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); window.CopyBotCapture.hideKindFromPreview(kind); closeKindPopup(); });
            b.addEventListener('pointerenter', () => { doc.querySelectorAll('.copybot_kind_focus').forEach(el => el.classList.remove('copybot_kind_focus')); t.classList.add('copybot_kind_focus'); });
            pop.appendChild(b);
        });
        const close = doc.createElement('button');
        close.type = 'button';
        close.className = 'copybot_kind_popup_close';
        close.textContent = '닫기';
        close.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); closeKindPopup(); });
        pop.appendChild(close);
        pop.addEventListener('pointerdown', (e) => e.stopPropagation());
        doc.body.appendChild(pop);
        const vw = doc.documentElement.clientWidth || preview.chatWidth;
        const w = pop.offsetWidth || 220, hgt = pop.offsetHeight || 80;
        const left = Math.max(4, Math.min(x - w / 2, vw - w - 4));
        const top = Math.max(4, y - hgt - 12 > 0 ? y - hgt - 12 : y + 12);
        pop.style.left = `${Math.round(left)}px`;
        pop.style.top = `${Math.round(top)}px`;
    }

    // doc: 미리보기 문서 또는 그 안 상태창 문서. frame: 상태창 문서일 때 그 iframe 요소(눌린 자리를 바깥 좌표로 바꿀 때 씀)
    function installKindLongPress(doc, frame = null) {
        if (!doc || doc.__cbLongPress) return;
        doc.__cbLongPress = true;
        let timer = null, sx = 0, sy = 0;
        const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
        const resolve = (target) => frame ? [frame, ...markedChain(frame.parentElement)] : markedChain(target);
        const toOuter = (x, y) => {
            if (!frame) return { x: x + (doc.defaultView?.scrollX || 0), y: y + (doc.defaultView?.scrollY || 0) };
            const r = frame.getBoundingClientRect();
            const win = preview?.doc.defaultView;
            return { x: r.left + x + (win?.scrollX || 0), y: r.top + y + (win?.scrollY || 0) };
        };
        doc.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            if (e.target?.closest?.('#copybot_kind_popup')) return;
            closeKindPopup();                        // 일반 터치 → 떠 있던 팝업 닫힘
            const targets = resolve(e.target);
            cancel();
            if (!targets.length) return;
            sx = e.clientX; sy = e.clientY;
            timer = setTimeout(() => { timer = null; const p = toOuter(sx, sy); showKindPopup(targets, p.x, p.y); }, LONG_PRESS_MS);
        }, true);
        doc.addEventListener('pointermove', (e) => { if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) cancel(); }, true);
        ['pointerup', 'pointercancel'].forEach(ev => doc.addEventListener(ev, cancel, true));
        doc.addEventListener('scroll', cancel, true);
        doc.addEventListener('contextmenu', (e) => { if (resolve(e.target).length) e.preventDefault(); }, true);   // 길게 누를 때 브라우저 메뉴 안 뜨게
    }

    function makePreviewClone(mes, rules) {
        const clone = mes.cloneNode(true);
        clone.removeAttribute('mesid');
        clone.classList.add('copybot_capture_preview_mes');
        // 조작 영역 되돌리기 (라이브 화면과 같은 간격, 조작 UI 자리만 제외): 마지막 메시지의 스와이프 화살표용 특수 여백(.last_mes) → 일반 메시지와 같게,
        // 이미지 조작 버튼이 차지하던 아래 여백 → 0 (버튼은 REMOVE_SELECTORS 로 제거됨)
        clone.classList.remove('last_mes');
        clone.querySelectorAll('.mes_media_wrapper, .mes_img_container').forEach(el => el.style.setProperty('margin-bottom', '0px', 'important'));
        syncFormState(mes, clone);
        snapshotIframes(mes, clone, rules);
        clone.querySelectorAll(REMOVE_SELECTORS.join(',')).forEach(el => el.remove());
        clone.querySelectorAll('[class*="hover"], .mes_hover').forEach(el => { el.style.visibility = 'hidden'; });
        const counts = annotateKinds(clone, mes.getAttribute('mesid'));
        anonymizeClone(clone, rules);
        return { clone, counts };
    }

    function destroyPreview() {
        if (!preview) return;
        if (preview.timer) clearInterval(preview.timer);
        try { preview.ro?.disconnect(); } catch (e) { /* 무시 */ }
        try { preview.frame.remove(); } catch (e) { /* 무시 */ }
        preview = null;
    }

    // 미리보기 iframe 을 holder 안에 만들고 범위의 메시지를 채움.
    // sourceItems 가 있으면(컨테이너 옮기기) 라이브 채팅 대신 기존 미리보기 복제본에서 지금 상태 그대로 다시 스냅샷
    // 동시에 두 번 만들지 않는다(자동 열기 + 버튼 겹침 방지). 만드는 도중 다른 빌드가 preview 를 갈아끼우면 이 빌드는 조용히 중단
    let previewBuilding = false;
    async function buildPreview(holder, s, e, rules, sourceItems = null) {
        if (previewBuilding) throw new Error('미리보기를 만드는 중입니다. 잠시 뒤 다시 눌러 주십시오.');
        previewBuilding = true;
        try {
            return await buildPreviewInner(holder, s, e, rules, sourceItems);
        } finally {
            previewBuilding = false;
        }
    }
    async function buildPreviewInner(holder, s, e, rules, sourceItems) {
        const prepared = sourceItems ? sourceItems.map(it => ({ index: it.index, ...makePreviewClone(it.el, []) })) : null;
        destroyPreview();
        const chat = document.querySelector('#chat');
        const chatWidth = Math.round(chat ? chat.getBoundingClientRect().width : 400);
        const firstMes = document.querySelector(`#chat .mes[mesid="${s}"]`) || chat;
        const backgroundColor = findBackgroundColor(firstMes || document.body);
        const frame = document.createElement('iframe');
        frame.id = 'copybot_capture_frame';
        frame.setAttribute('title', '캡처 미리보기');
        // iframe 폭은 본 창 폭과 같게 (폭 기준 미디어쿼리가 본 화면과 같게) — #chat 은 그 안에서 chatWidth 로 왼쪽 정렬
        const frameWidth = Math.max(chatWidth, window.innerWidth);
        frame.style.cssText = `display:block;border:0;width:${frameWidth}px;height:200px;transform-origin:top left;background:${backgroundColor};`;
        holder.innerHTML = '';
        holder.appendChild(frame);
        const doc = await createPreviewDoc(frame, chatWidth, backgroundColor);
        if (!frame.isConnected) throw new Error('미리보기 화면이 사라졌습니다.');
        const pv = { s, e, frame, doc, chatWidth, items: [], rules, timer: null, backgroundColor };
        preview = pv;
        installKindLongPress(doc);
        const target = doc.getElementById('chat');
        const kinds = {};
        const place = (index, clone, counts) => {
            for (const [id, n] of counts) kinds[id] = (kinds[id] || 0) + n;
            target.appendChild(clone);
            clone.querySelectorAll('iframe[data-cb-static]').forEach(attachStaticFrame);
            pv.items.push({ index, el: clone });
        };
        if (prepared) {
            prepared.forEach(p => place(p.index, p.clone, p.counts));
        } else {
            for (let i = s; i <= e; i++) {
                if (!document.querySelector(`#chat .mes[mesid="${i}"]`)) {
                    const ok = await ensureRendered(i);
                    if (preview !== pv) throw new Error('미리보기가 바뀌어 중단했습니다.');
                    if (!ok) continue;
                }
                const mes = document.querySelector(`#chat .mes[mesid="${i}"]`);
                if (!mes || !mes.querySelector('.mes_text')) continue;
                const { clone, counts } = makePreviewClone(mes, rules);
                place(i, clone, counts);
                if ((i - s) % 5 === 4) { await new Promise(r => setTimeout(r, 0)); if (preview !== pv) throw new Error('미리보기가 바뀌어 중단했습니다.'); }
            }
        }
        if (!pv.items.length) { destroyPreview(); throw new Error('미리보기에 넣을 본문을 찾지 못했습니다.'); }
        pv.kinds = kinds;
        applyHiddenToPreview();
        // 미리보기 안 내용 크기가 바뀌면(상태창 접기 등) 바깥 프레임 높이를 바로 맞춤
        try {
            const RO = doc.defaultView?.ResizeObserver;
            if (RO) { pv.ro = new RO(() => schedulePreviewResize()); pv.ro.observe(target); pv.ro.observe(doc.body); }
        } catch (e) { /* 무시 */ }
        // 상태창 프레임 로드 뒤 높이 보정·선택지 프레임 재분류 (최대 6초간 주기적으로)
        let ticks = 0;
        pv.timer = setInterval(() => {
            if (preview !== pv || !pv.frame.isConnected) { clearInterval(pv.timer); pv.timer = null; return; }
            if (reclassifyChoiceFrames(pv.doc)) { pv.kinds = previewKindCounts(); applyHiddenToPreview(); window.CopyBotUI?.renderCaptureKinds?.(); }
            resizePreviewFrame();
            if (++ticks >= 12) { clearInterval(pv.timer); pv.timer = null; }
        }, 500);
        schedulePreviewResize();
        return pv;
    }

    // 미리보기 상태 서명 (같은 상태면 렌더 결과 재사용)
    function previewSignature(settings) {
        if (!preview) return null;
        const hide = sortKindIds(computeHideSet(settings));
        return JSON.stringify({ s: preview.s, e: preview.e, hide, show: settings.show, scale: settings.scale, layout: settings.layout, rules: settings.anonymize ? settings.rules : [] });
    }

    // 미리보기 안의 메시지 복제본 하나를 이미지로 (숨긴 요소는 아예 빼고 #chat 옆에 재배치해서 렌더)
    async function renderPreviewItem(lib, item, rules, scale) {
        const source = item.el;
        const chat = document.querySelector('#chat') || document.body;
        const clone = source.cloneNode(true);
        clone.style.removeProperty('margin-bottom');
        clone.querySelectorAll('.copybot_kind_hidden, .copybot_kind_wrap_hidden').forEach(el => el.remove());
        const origFrames = [...source.querySelectorAll('iframe')].filter(f => !f.closest('.copybot_kind_hidden, .copybot_kind_wrap_hidden'));
        await inlineIframes(lib, origFrames, clone, rules, scale, null);
        applyRoleInline(clone, readShowSettings());
        clone.classList.add('copybot_capture_offscreen');
        neutralizeRenderClone(clone);   // 이미지로 못 바꾼 iframe·스크립트는 라이브 문서에서 절대 실행되지 않게
        clone.style.cssText += `;position:absolute;left:-20000px;top:0;width:${preview.chatWidth}px;max-width:${preview.chatWidth}px;pointer-events:none;`;
        chat.appendChild(clone);
        try {
            await waitForImages(clone);
            await new Promise(r => requestAnimationFrame(r));
            const backgroundColor = preview.backgroundColor;
            tagFontsAndLines(clone);
            window.CopyBotCapture._lastRenderDebug = measureLayout(clone);
            const canvas = await lib.domToCanvas(clone, libOptions({
                scale,
                backgroundColor,
                onCloneNode: (c) => { applyTags(c); },
            }));
            window.CopyBotCapture._lastBottomBands = [];   // 미리보기 = 결과물: 미리보기에 없는 자르기는 결과물에도 없음
            return { canvas, backgroundColor };
        } finally {
            clone.remove();
            removeOrphanSandboxes();
        }
    }

    // 치수 기록 (미리보기 ↔ 렌더 복제본 비교용): 상자/블록/본문/최상위 블록들의 높이
    function measureLayout(mes) {
        const h = (el) => el ? Math.round(el.getBoundingClientRect().height) : null;
        const w = (el) => el ? Math.round(el.getBoundingClientRect().width) : null;
        const cs = mes.ownerDocument.defaultView.getComputedStyle(mes);
        const block = mes.querySelector('.mes_block');
        const text = mes.querySelector('.mes_text');
        return {
            mes: [w(mes), h(mes)], padding: `${cs.paddingTop}/${cs.paddingBottom}`, display: cs.display,
            block: block ? [w(block), h(block)] : null,
            blockKids: block ? [...block.children].map(k => k.className.split(' ')[0] + ':' + h(k)) : [],
            text: text ? [w(text), h(text)] : null,
            textKids: text ? [...text.children].slice(0, 60).map(k => k.tagName + ':' + h(k)) : [],
        };
    }

    // 미리보기 전체를 이미지들로 (분할/한 장 규칙은 captureRange 와 동일)
    async function renderPreview(settings) {
        if (!preview) throw new Error('미리보기가 없습니다.');
        if (captureState) throw new Error('이미 캡처가 진행 중입니다.');
        captureState = { aborted: false };   // 검사 직후 바로 점유 (라이브러리 로드·뷰포트 대기 중 두 번 눌러도 렌더가 겹치지 않게)
        beginImageFetchStats();
        const rules = settings.anonymize ? normalizeRules(settings.rules) : [];
        const scale = Math.min(3, Math.max(1, settings.scale || 2));
        const split = settings.layout === 'split';
        let lib, items, count;
        try {
            lib = await loadLibrary();
            await settleViewport();
            if (!preview) throw new Error('미리보기가 없습니다.');
            const show = readShowSettings();
            items = preview.items.filter(it => !isRoleTextHidden(it.el, show));   // 메시지 OFF 인 역할은 통째로 제외
            if (!items.length) throw new Error('표시 요소 설정으로 찍을 메시지가 하나도 없습니다.');
            count = items.length;
        } catch (error) {
            captureState = null;
            throw error;
        }
        const images = [];
        let chunk = [], chunkHeight = 0, chunkStart = items[0].index;
        const flush = async (endIdx) => {
            if (!chunk.length) return;
            const img = await composeParts(chunk);
            images.push({ ...img, start: chunkStart, end: endIdx });
            chunk.forEach(p => { p.canvas.width = p.canvas.height = 0; });
            chunk = []; chunkHeight = 0;
        };
        try {
            for (let k = 0; k < items.length; k++) {
                const item = items[k];
                if (captureState.aborted) throw new Error('중단했습니다.');
                showCaptureToast(count > 1 ? `이미지 만드는 중… ${k + 1}/${count} (#${item.index})` : `#${item.index} 이미지 만드는 중…`);
                await new Promise(r => setTimeout(r, 0));
                const part = await renderPreviewItem(lib, item, rules, scale);
                if (split) { chunk = [part]; chunkStart = item.index; await flush(item.index); continue; }
                if (chunk.length && chunkHeight + part.canvas.height > MAX_IMAGE_HEIGHT_PX) await flush(items[k - 1].index);
                if (!chunk.length) chunkStart = item.index;
                chunk.push(part);
                chunkHeight += part.canvas.height;
            }
            await flush(items[items.length - 1].index);
        } catch (error) {
            chunk.forEach(p => { p.canvas.width = p.canvas.height = 0; });
            throw error;
        } finally {
            captureState = null;
            clearCaptureToast();
        }
        if (!images.length) throw new Error('이미지를 만들지 못했습니다.');
        reportImageFetchStats();   // 외부 이미지가 빠졌으면 여기서 한 번 안내
        const first = images[0];
        return { images, count, start: preview.s, end: preview.e, kinds: { ...preview.kinds }, blob: first.blob, width: first.width, height: first.height, signature: previewSignature(settings) };
    }

    window.CopyBotCapture = {
        init: function(config = {}) {
            if (config.isDebugMode !== undefined) isDebugMode = config.isDebugMode;
            return true;
        },
        setDebugMode: function(enabled) { isDebugMode = enabled; },
        parseRules,
        kindLabel,
        sortKindIds,
        isFixedKind,
        lastResult: null,
        // 디버그/테스트용 내부 함수 노출
        _removeChoices: removeChoices,
        _iframeLooksLikeChoices: iframeLooksLikeChoices,
        _tagFontsAndLines: tagFontsAndLines,
        _applyTags: applyTags,
        _clearTags: clearTags,
        _resolveFontFamily: (doc, fam) => resolveFontFamily(doc, fam, loadedWebFonts(doc)),
        _measureBottomBands: measureBottomBands,
        _cutBands: cutBands,
        _fixChatOrder: fixChatOrder,
        _settleViewport: settleViewport,
        _detectKinds: detectKinds,
        _removeKinds: removeKinds,
        _computeHideSet: computeHideSet,
        _makeZip: makeZip,
        _measureLayout: measureLayout,
        _injectIsolation: injectIsolation,
        _libOptions: libOptions,
        _imageFetchStats: () => imageFetchStats,
        _beginImageFetchStats: beginImageFetchStats,
        _estimateLoad: null,   // 아래서 채움

        // 현재 캐릭터/그룹 키 (캐릭터별 익명화 규칙·요소 숨김 저장 키)
        currentCharKey: function() {
            const context = getContext();
            if (!context) return null;
            if (context.groupId) return `group:${context.groupId}`;
            const ch = context.characters?.[context.characterId];
            if (ch) return `char:${ch.avatar || ch.name}`;
            return null;
        },
        currentCharLabel: function() {
            const context = getContext();
            if (!context) return '(캐릭터 없음)';
            if (context.groupId) return `그룹 (${context.name2 || context.groupId})`;
            const ch = context.characters?.[context.characterId];
            return ch ? (ch.name || ch.avatar) : '(캐릭터 없음)';
        },

        // 현재 설정 읽기 (익명화 규칙 = 공통 + 현재 캐릭터, 숨김 = 옵션 기본 + 캐릭터별 선택)
        getSettings: function() {
            const globalRules = window.CopyBotUI?.readCaptureRules ? window.CopyBotUI.readCaptureRules('global') : [];
            const key = this.currentCharKey();
            const charRules = (key && window.CopyBotUI?.readCaptureRules) ? window.CopyBotUI.readCaptureRules('char') : [];
            const hideGlobal = window.CopyBotSettings?.getCaptureHideGlobal ? window.CopyBotSettings.getCaptureHideGlobal() : {};
            const hideChar = (key && window.CopyBotSettings?.getCaptureHideKinds) ? window.CopyBotSettings.getCaptureHideKinds(key) : {};
            // 페르소나 이름 항상 익명화 (2026-10-09 유저 지시, 기본 ON — 개인정보 안전장치라 기본 OFF 원칙의 명시적 예외):
            // 지금 쓰는 페르소나 이름(name1)을 공통 규칙 맨 앞에 자동 추가. 캡처 이미지에만 적용되고(익명화 토글 ON 일 때), 채팅·텍스트 복사에는 영향 없음.
            const personaRules = [];
            if ($('#copybot_capture_persona_anon').is(':checked')) {
                const name1 = String(getContext()?.name1 || '').trim();
                if (name1) personaRules.push({ from: name1, to: String($('#copybot_capture_persona_to').val() ?? 'ㅇㅇ') });
            }
            return {
                anonymize: $('#copybot_capture_anonymize_toggle').attr('data-enabled') === 'true',
                rules: [...personaRules, ...globalRules, ...charRules],
                skipImages: $('#copybot_capture_images').val() === 'skip',
                skipChoices: $('#copybot_capture_choices').val() !== 'include',   // 기본: 선택지 빼고 캡처
                skipStatus: $('#copybot_capture_statuswin').val() === 'skip',          // 기본: 상태창 같이 캡처
                skipAssets: $('#copybot_capture_assets').val() === 'skip',
                show: readShowSettings(),
                scale: scaleForQuality($('#copybot_capture_scale').val()),
                layout: $('#copybot_capture_layout').val() === 'split' ? 'split' : 'single',
                hideGlobal,
                hideChar,
            };
        },

        // 종류별 "지금 숨겨지는가" (요소 선택 UI 표시용)
        isKindHidden: function(kind) {
            return computeHideSet(this.getSettings()).has(kind);
        },
        // (setKindHidden 은 아래 "요소 선택 변경" 쪽 정의 하나만 사용 — 중복 정의 제거)

        // 범위 정리: 빈 값은 처음/마지막으로. {s, e, last, filled}
        resolveRange: function(start, end) {
            const context = getContext();
            const last = Math.max(0, (context?.chat?.length || 0) - 1);
            const startEmpty = start === '' || start === null || start === undefined || isNaN(parseInt(start, 10));
            const endEmpty = end === '' || end === null || end === undefined || isNaN(parseInt(end, 10));
            let s = startEmpty ? 0 : Math.max(0, parseInt(start, 10));
            let e = endEmpty ? last : parseInt(end, 10);
            if (e > last) e = last;
            return { s, e, last, filled: startEmpty || endEmpty };
        },

        // 부하 예측: {count, heightCss, megapixels, pages, tooHeavy, needConfirm}
        estimateLoad: function(s, e, scale) {
            const chat = document.querySelector('#chat');
            const chatWidth = chat ? chat.getBoundingClientRect().width : 400;
            let heightCss = 0;
            for (let i = s; i <= e; i++) heightCss += estimateMessageHeight(i, chatWidth);
            const px = heightCss * scale * chatWidth * scale;
            const megapixels = Math.round(px / 1e6);
            const count = e - s + 1;
            const pages = Math.max(1, Math.ceil(heightCss * scale / MAX_IMAGE_HEIGHT_PX));
            return {
                count, heightCss: Math.round(heightCss), megapixels, pages,
                tooHeavy: count > HARD_LIMIT.count || megapixels > HARD_LIMIT.megapixels,
                needConfirm: count > SOFT_LIMIT.count || megapixels > SOFT_LIMIT.megapixels,
            };
        },

        abort: function() { if (captureState) captureState.aborted = true; },
        isBusy: function() { return !!captureState; },

        // 범위 캡처 → { images: [{blob,width,height,start,end}], count, start, end, kinds: {id: count}, blob/width/height(첫 장) }
        captureRange: async function(start, end, options = {}) {
            if (captureState) throw new Error('이미 캡처가 진행 중입니다.');
            const { s, e, last } = this.resolveRange(start, end);
            if (last < 0 || !getContext()?.chat?.length) throw new Error('캡처할 채팅이 없습니다.');
            if (s > e) throw new Error('시작 번호가 끝 번호보다 큽니다.');
            if (e - s + 1 > HARD_LIMIT.count) throw new Error(`한 번에 최대 ${HARD_LIMIT.count}개까지만 캡처할 수 있습니다.`);

            const settings = { ...this.getSettings(), ...options };
            const rules = settings.anonymize
                ? (typeof settings.rules === 'string' ? parseRules(settings.rules) : normalizeRules(settings.rules))
                : [];
            const scale = Math.min(3, Math.max(1, settings.scale || 2));
            const hideSet = computeHideSet(settings);
            const split = settings.layout === 'split';

            const lib = await loadLibrary();
            await settleViewport();
            const count = e - s + 1;
            captureState = { aborted: false };
            beginImageFetchStats();
            const images = [];
            const kinds = {};
            let chunk = [];
            let chunkHeight = 0;
            let chunkStart = s;
            const flush = async (endIdx) => {
                if (!chunk.length) return;
                const img = await composeParts(chunk);
                images.push({ ...img, start: chunkStart, end: endIdx });
                chunk.forEach(p => { p.canvas.width = p.canvas.height = 0; });
                chunk = []; chunkHeight = 0;
            };
            try {
                for (let i = s; i <= e; i++) {
                    if (captureState.aborted) throw new Error('중단했습니다.');
                    showCaptureToast(count > 1 ? `캡처 중… ${i - s + 1}/${count} (#${i})` : `#${i} 캡처 중…`);
                    await new Promise(r => setTimeout(r, 0));   // 토스트·UI 갱신 틈
                    if (!document.querySelector(`#chat .mes[mesid="${i}"]`)) {
                        const ok = await ensureRendered(i);
                        if (!ok) { debugLog(`#${i} 화면에 없음 → 건너뜀`); continue; }
                    }
                    const mes = document.querySelector(`#chat .mes[mesid="${i}"]`);
                    for (const [id, n] of detectKinds(mes)) kinds[id] = (kinds[id] || 0) + n;
                    const part = await renderMessage(lib, i, rules, scale, hideSet);
                    if (!part) continue;
                    if (split) {
                        chunk = [part]; chunkStart = i;
                        await flush(i);
                        continue;
                    }
                    if (chunk.length && chunkHeight + part.canvas.height > MAX_IMAGE_HEIGHT_PX) await flush(i - 1);
                    if (!chunk.length) chunkStart = i;
                    chunk.push(part);
                    chunkHeight += part.canvas.height;
                }
                await flush(e);
            } catch (error) {
                chunk.forEach(p => { p.canvas.width = p.canvas.height = 0; });
                throw error;
            } finally {
                reportImageFetchStats();
                captureState = null;
                clearCaptureToast();
            }
            if (!images.length) throw new Error('캡처할 본문을 찾지 못했습니다.');
            const first = images[0];
            return { images, count, start: s, end: e, kinds, blob: first.blob, width: first.width, height: first.height };
        },

        // ===== 미리보기 흐름: 캡처 버튼 → 살아있는 미리보기(즉시) → 요소 체크 즉시 반영 → 복사/저장 때 한 번만 이미지 렌더 =====
        clearResult: function() {
            const r = this.lastResult;
            if (r) r.images.forEach(img => { if (img.url) { try { URL.revokeObjectURL(img.url); } catch (e) { /* 무시 */ } } });
            this.lastResult = null;
        },
        hasPreview: function() { return !!preview; },
        previewRange: function() { return preview ? { s: preview.s, e: preview.e } : null; },
        previewKinds: function() { return preview ? { ...preview.kinds } : {}; },
        lastRange: null,
        previewClosedByUser: false,   // ✕ 로 닫으면 true → 캡처 모드에 다시 들어가도 자동으로 안 열림 (새 캡처나 '다시 열기'면 해제)

        // 번호 범위 → 미리보기 열기. 빈 번호는 처음/마지막으로 채우고 한 번 더 누르게 함(범위 복사와 동일).
        openPreview: async function(start, end, { skipFillCheck = false } = {}) {
            const $status = $('#copybot_capture_status');
            const { s, e, last, filled } = this.resolveRange(start, end);
            if (filled && !skipFillCheck) {
                $('#copybot_capture_start').val(s);
                $('#copybot_capture_end').val(e);
                toastr.info('범위가 비어 있어 처음/마지막 메시지로 채웠습니다. 범위를 확인하고 캡처 버튼을 한 번 더 눌러 주십시오.');
                return false;
            }
            if (!getContext()?.chat?.length) { toastr.warning('캡처할 채팅이 없습니다.'); return false; }
            if (this.isBusy()) { toastr.warning('이미지 만드는 중입니다. 끝나거나 중단한 뒤 다시 눌러 주십시오.'); return false; }
            if (parseInt(end, 10) > last) { $('#copybot_capture_end').val(e); toastr.warning(`종료위치가 마지막 메시지(${last}번)로 자동 조정되었습니다.`); }
            if (s > e) { toastr.error('시작위치는 종료위치보다 작아야 합니다.'); return false; }
            if (e - s + 1 > HARD_LIMIT.count) { toastr.error(`한 번에 최대 ${HARD_LIMIT.count}개까지만 캡처할 수 있습니다. 범위를 나눠 주십시오.`, '', { timeOut: 5000 }); return false; }
            try {
                $status.text('미리보기 준비 중…').css('color', '');
                const settings = this.getSettings();
                const rules = settings.anonymize ? normalizeRules(settings.rules) : [];
                const holder = window.CopyBotUI?.openCaptureOverlay ? window.CopyBotUI.openCaptureOverlay() : null;
                if (!holder) throw new Error('미리보기 화면을 만들지 못했습니다.');
                // 전체 화면이 떠 있는데 패널 안으로 새로 열면 전체 화면은 닫음
                const dlg = document.getElementById('copybot_capture_dialog');
                if (dlg && dlg.open && !dlg.contains(holder)) { try { dlg.close(); } catch (err) { /* 무시 */ } }
                await settleViewport();
                await buildPreview(holder, s, e, rules);
                this.lastRange = { s, e, chatKey: this.currentChatKey() };
                this.previewClosedByUser = false;
                try { window.CopyBotSettings?.saveSettings?.(); } catch (err) { /* 무시 */ }
                window.CopyBotUI?.updateCaptureRangeLabel?.();
                window.CopyBotUI?.renderCaptureKinds?.();
                $status.text(`미리보기 열림: #${s}~#${e} (${preview.items.length}개). 미리보기 안에서 요소를 고르고 복사/저장하면 됩니다.`).css('color', '#48bb78');
                return true;
            } catch (error) {
                console.error('깡갤 복사기: 미리보기 실패', error);
                $status.text(`실패: ${error.message}`).css('color', '#e53e3e');
                toastr.error(`미리보기 실패: ${error.message}`);
                if (!previewBuilding) destroyPreview();   // 반쯤 만들어진 미리보기를 남기지 않음 (다른 빌드가 진행 중이면 그쪽 것은 건드리지 않음)
                window.CopyBotUI?.closeCaptureOverlay?.();
                return false;
            }
        },

        // 익명화 토글·규칙이 바뀌면 미리보기 본문도 새 규칙으로 다시 스냅샷 (미리보기 = 결과물 원칙: 본문 텍스트 익명화는 스냅샷 때 적용되므로)
        refreshPreviewRules: async function() {
            if (!preview || previewBuilding || this.isBusy()) return false;
            const settings = this.getSettings();
            const rules = settings.anonymize ? normalizeRules(settings.rules) : [];
            if (JSON.stringify(rules) === JSON.stringify(preview.rules || [])) return false;
            const r = { s: preview.s, e: preview.e };
            return this.openPreview(r.s, r.e, { skipFillCheck: true });
        },

        // 접기: 미리보기 iframe 만 내림 (기록·만든 이미지는 유지, 상자 헤더는 남음)
        closePreview: function() {
            destroyPreview();
            window.CopyBotUI?.renderCaptureHistory?.();
            this.previewClosedByUser = true;
            window.CopyBotUI?.collapseCaptureBox?.();
        },
        // 펼치기: 기록으로 다시 띄움
        reopenPreview: function() {
            const r = this.lastRange;
            if (!r) return false;
            this.previewClosedByUser = false;
            return this.openPreview(r.s, r.e, { skipFillCheck: true });
        },
        // 비우기: 미리보기·기록·만든 이미지 전부
        clearAll: function() {
            destroyPreview();
            resetHideHistory();
            this.clearResult();
            this.lastRange = null;
            this.previewClosedByUser = false;
            try { window.CopyBotSettings?.saveSettings?.(); } catch (err) { /* 무시 */ }
            window.CopyBotUI?.closeCaptureOverlay?.();
            window.CopyBotUI?.clearCapturePreview?.();
        },
        // 현재 채팅 식별 (기록이 같은 채팅일 때만 자동으로 미리보기 다시 열기)
        currentChatKey: function() {
            const context = getContext();
            if (!context) return null;
            return `${this.currentCharKey() || ''}|${context.chatId || ''}`;
        },
        // 캡처 모드에 들어왔을 때: 기록이 있으면 상자를 보이고, 접어두지 않았으면 미리보기도 자동으로 띄움
        autoOpenPreview: function() {
            const r = this.lastRange;
            if (!r || r.chatKey !== this.currentChatKey()) return false;
            if (preview || this.isBusy() || previewBuilding) return false;
            // 패널 안 캡처 화면이 실제로 보일 때만 (안 보이면 openCaptureOverlay 가 전체화면 modal 로 떨어져 페이지 로드 직후 화면을 덮는 사고)
            if (!$('#copybot_mode_capture').is(':visible')) return false;
            if (this.previewClosedByUser) { window.CopyBotUI?.collapseCaptureBox?.(); return false; }
            return this.openPreview(r.s, r.e, { skipFillCheck: true });
        },

        // 요소 선택 변경 (고정 종류=공통, 동적 블록=캐릭터별) → 미리보기 즉시 반영
        setKindHidden: function(kind, hidden) {
            const S = window.CopyBotSettings;
            let ok = false;
            if (isFixedKind(kind)) {
                const optionSelect = { genimg: '#copybot_capture_images', choice: '#copybot_capture_choices', asset: '#copybot_capture_assets', stat: '#copybot_capture_statuswin' }[kind];
                if (optionSelect) { $(optionSelect).val(hidden ? 'skip' : 'include').trigger('change'); ok = true; }
                else if (S?.setCaptureHideGlobal) { S.setCaptureHideGlobal(kind, hidden); ok = true; }
            } else {
                const key = this.currentCharKey();
                if (key && S?.setCaptureHideKind) { S.setCaptureHideKind(key, kind, hidden); ok = true; }
            }
            if (ok) applyHiddenToPreview();
            return ok;
        },
        refreshPreviewHidden: function() { applyHiddenToPreview(); },
        // 미리보기 꾹 누르기 팝업에서 호출: 종류 숨김 + 설정 저장 + 요소 목록 갱신
        hideKindFromPreview: function(kind) {
            if (!this.setKindHidden(kind, true)) { toastr.warning('이 요소는 지금 저장할 수 없습니다(캐릭터 없음).'); return false; }
            try { window.CopyBotSettings?.saveSettings?.(); } catch (e) { /* 무시 */ }
            window.CopyBotUI?.renderCaptureKinds?.();
            toastr.info(`${isFixedKind(kind) ? '모든 봇' : '이 봇'}에서 "${kindLabel(kind)}"을(를) 뺐습니다. ↶ 로 되돌릴 수 있습니다.`, '', { timeOut: 3500 });
            return true;
        },
        // 요소 넣고 빼기 되돌리기/다시하기 (설정도 그 시점으로). 상태: { canUndo, canRedo }
        undoHide: function() { return hideHistory ? gotoHideHistory(hideHistory.pos - 1) : false; },
        redoHide: function() { return hideHistory ? gotoHideHistory(hideHistory.pos + 1) : false; },
        hideHistoryState: function() {
            if (!preview || !hideHistory) return { canUndo: false, canRedo: false };
            return { canUndo: hideHistory.pos > 0, canRedo: hideHistory.pos < hideHistory.stack.length - 1 };
        },
        relayoutPreview: function() { schedulePreviewResize(); },
        // 미리보기를 다른 컨테이너로 (현재 상태 그대로 재스냅샷)
        movePreview: async function(holder) {
            if (!preview || !holder) return false;
            if (holder.contains(preview.frame)) { schedulePreviewResize(); return true; }
            const items = preview.items.slice();
            await buildPreview(holder, preview.s, preview.e, preview.rules, items);
            window.CopyBotUI?.renderCaptureKinds?.();
            return true;
        },

        // 미리보기 기준 부하 예측 (실제 복제본 높이)
        estimatePreviewLoad: function(settings) {
            if (!preview) return null;
            const scale = settings.scale;
            let heightCss = 0;
            preview.items.forEach(it => { heightCss += it.el.getBoundingClientRect().height; });
            const megapixels = Math.round(heightCss * scale * preview.chatWidth * scale / 1e6);
            const count = preview.items.length;
            const pages = Math.max(1, Math.ceil(heightCss * scale / MAX_IMAGE_HEIGHT_PX));
            return { count, heightCss: Math.round(heightCss), megapixels, pages, tooHeavy: megapixels > HARD_LIMIT.megapixels, needConfirm: count > SOFT_LIMIT.count || megapixels > SOFT_LIMIT.megapixels };
        },

        // 미리보기 상태의 이미지가 준비돼 있으면 그대로, 아니면 렌더 (렌더는 느림 → 진행 토스트)
        ensureRendered: async function() {
            // 익명화 규칙이 미리보기를 만들 때와 다르면 먼저 새 규칙으로 다시 스냅샷 (본문 텍스트 익명화 누락 방지)
            if (preview) {
                const cur = this.getSettings();
                const curRules = cur.anonymize ? normalizeRules(cur.rules) : [];
                if (JSON.stringify(curRules) !== JSON.stringify(preview.rules || [])) {
                    const ok = await this.openPreview(preview.s, preview.e, { skipFillCheck: true });
                    if (!ok || !preview) throw new Error('익명화 규칙을 적용한 미리보기를 다시 만들지 못했습니다.');
                }
            }
            const settings = this.getSettings();
            const sig = previewSignature(settings);
            if (this.lastResult && this.lastResult.signature && this.lastResult.signature === sig) return { result: this.lastResult, fresh: false };
            const est = this.estimatePreviewLoad(settings);
            if (est?.tooHeavy) { toastr.error(`너무 큽니다: 예상 약 ${est.megapixels}MP. 범위를 나눠 주십시오.`, '', { timeOut: 5000 }); return null; }
            if (est?.needConfirm) {
                const ok = await confirmPopup(`메시지 ${est.count}개, 예상 크기 약 ${est.megapixels}MP(이미지 ${est.pages}장 분량)입니다.\n시간이 꽤 걸리고(메시지 하나에 수십 초) 기기가 느려지거나 잠시 멈출 수 있습니다. 정말 만드시겠습니까?`);
                if (!ok) return null;
            }
            const result = await renderPreview(settings);
            this.clearResult();
            this.lastResult = result;
            window.CopyBotUI?.renderCaptureThumbs?.(result);
            return { result, fresh: true };
        },

        // 미리보기 → 복사/저장. 렌더가 오래 걸려 클립보드 권한(사용자 제스처)이 만료되면 한 번 더 누르게 안내
        _delivering: false,
        deliver: async function(action = 'copy', index = 0) {
            if (!preview) { toastr.warning('미리보기가 없습니다. 먼저 캡처를 눌러 주십시오.'); return false; }
            if (this.isBusy() || this._delivering) { toastr.warning('이미지 만드는 중입니다. 잠시 기다려 주십시오.'); return false; }
            this._delivering = true;
            try {
                return await this._deliverInner(action, index);
            } finally {
                this._delivering = false;
            }
        },
        _deliverInner: async function(action, index) {
            const $status = $('#copybot_capture_status');
            let prepared;
            try {
                prepared = await this.ensureRendered();
            } catch (error) {
                const aborted = /중단/.test(error?.message || '');
                if (!aborted) console.error('깡갤 복사기: 이미지 생성 실패', error);
                $status.text(aborted ? '중단했습니다.' : `실패: ${error.message}`).css('color', aborted ? '' : '#e53e3e');
                toastr[aborted ? 'info' : 'error'](aborted ? '이미지 만들기를 중단했습니다.' : `이미지 생성 실패: ${error.message}`);
                return false;
            }
            if (!prepared) return false;
            const { result, fresh } = prepared;
            if (action === 'copy') {
                const copied = await copyBlobToClipboard(result.images[index]?.blob || result.blob);
                if (copied) { toastr.success('캡처 이미지를 클립보드에 복사했습니다.', '', { timeOut: 2000 }); $status.text(`복사 완료: #${result.start}~#${result.end}`).css('color', '#48bb78'); return true; }
                if (fresh) { toastr.info('이미지가 준비됐습니다. 클립보드 복사 버튼을 한 번 더 눌러 주십시오.', '', { timeOut: 4000 }); $status.text('이미지 준비됨 — 복사 버튼을 한 번 더 눌러 주십시오.').css('color', '#e8a838'); return false; }
                this.saveImage(index);
                toastr.info('클립보드 복사가 안 되는 환경이라 PNG 파일로 저장했습니다.', '', { timeOut: 3000 });
                return false;
            }
            if (action === 'save') return this.saveImage(index);
            return this.saveAll();
        },

        // 만든 이미지의 n번째를 클립보드로 (실패 시 PNG 저장 폴백)
        copyImage: async function(index = 0) {
            const img = this.lastResult?.images?.[index];
            if (!img) { toastr.warning('복사할 캡처가 없습니다.'); return false; }
            const copied = await copyBlobToClipboard(img.blob);
            if (copied) toastr.success('캡처 이미지를 클립보드에 복사했습니다.', '', { timeOut: 2000 });
            else { this.saveImage(index); toastr.info('클립보드 복사가 안 되는 환경이라 PNG 파일로 저장했습니다.', '', { timeOut: 3000 }); }
            return copied;
        },
        saveImage: function(index = 0) {
            const img = this.lastResult?.images?.[index];
            if (!img) { toastr.warning('저장할 캡처가 없습니다.'); return false; }
            const range = img.start === img.end ? `${img.start}` : `${img.start}-${img.end}`;
            downloadBlob(img.blob, `깡갤캡처_${range}_${stampName()}.png`);
            return true;
        },
        // 한 장이면 PNG, 여러 장이면 폴더에 담긴 ZIP 한 개
        saveAll: async function() {
            const r = this.lastResult;
            const imgs = r?.images || [];
            if (!imgs.length) { toastr.warning('저장할 캡처가 없습니다.'); return false; }
            if (imgs.length === 1) return this.saveImage(0);
            const folder = `깡갤캡처_${r.start}-${r.end}_${stampName()}`;
            const pad = String(imgs.length).length;
            const fileName = (img, i) => `${String(i + 1).padStart(pad, '0')}_${img.start === img.end ? img.start : `${img.start}-${img.end}`}.png`;
            // PC 크롬/엣지: 폴더 선택창 → 그 안에 진짜 폴더를 만들어 PNG 를 바로 넣음. 폰(안드로이드/iOS)은 함수가 있어도 동작이 제각각이라 항상 ZIP
            const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.userAgentData?.mobile === true;
            if (!isMobile && typeof window.showDirectoryPicker === 'function') {
                try {
                    const root = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'downloads' });
                    const dir = await root.getDirectoryHandle(folder, { create: true });
                    for (let i = 0; i < imgs.length; i++) {
                        const fh = await dir.getFileHandle(fileName(imgs[i], i), { create: true });
                        const w = await fh.createWritable();
                        await w.write(imgs[i].blob);
                        await w.close();
                    }
                    toastr.success(`${imgs.length}장을 '${folder}' 폴더에 저장했습니다.`, '', { timeOut: 3000 });
                    return true;
                } catch (error) {
                    if (error?.name === 'AbortError') { toastr.info('폴더 선택을 취소해서 ZIP 으로 저장합니다.', '', { timeOut: 2500 }); }
                    else if (error?.name === 'SecurityError') { toastr.info('이미지가 준비됐습니다. PNG 저장을 한 번 더 누르면 폴더를 고를 수 있습니다.', '', { timeOut: 4000 }); return false; }
                    else debugLog('폴더 저장 실패 → ZIP 폴백', error);
                }
            }
            try {
                const entries = imgs.map((img, i) => ({ name: `${folder}/${fileName(img, i)}`, blob: img.blob }));
                const zip = await makeZip(entries);
                downloadBlob(zip, `${folder}.zip`);
                toastr.success(`${imgs.length}장을 '${folder}' 폴더(zip)로 저장했습니다.`, '', { timeOut: 3000 });
                return true;
            } catch (error) {
                console.error('깡갤 복사기: zip 저장 실패', error);
                toastr.warning('zip 묶기에 실패해 장별로 저장합니다.');
                imgs.forEach((img, i) => setTimeout(() => this.saveImage(i), i * 400));
                return false;
            }
        },

        // 마지막 봇 메시지 캡처 → 바로 미리보기 (커스텀 버튼용; 거기서 복사/저장)
        captureLastBot: async function() {
            const chat = getContext()?.chat || [];
            for (let i = chat.length - 1; i >= 0; i--) {
                if (!chat[i].is_user && !chat[i].is_system) return this.openPreview(i, i, { skipFillCheck: true });
            }
            toastr.warning('캡처할 봇 메시지가 없습니다.');
            return false;
        },
    };
    window.CopyBotCapture._estimateLoad = (s, e, scale) => window.CopyBotCapture.estimateLoad(s, e, scale);

    if (window.copybot_debug_mode) {
        console.log('깡갤 복사기: capture.js 모듈 로드 완료');
    }
})();
