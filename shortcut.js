// ===================================================================
// 깡갤 복사기 확장프로그램 - shortcut.js 모듈
// ===================================================================
// 커스텀 버튼 "바로가기": 실리 메뉴 열기 / 프리셋·프로필·월드 인포·페르소나·봇 바로 바꾸기 / 확장 연결 / QR 세트 팝업
//
// === 🛣️ 대원칙 (고속도로) ===
// • 버튼은 "유저 손가락이 했을 일"만 대신한다:
//   ① 실리 상단바 토글 누르기  ② 실리 공식 슬래시 명령(/preset /profile /persona /persona-lock, /go 는 폴백)
//   ③ 실리 자체 드롭다운 바꾸기(테마 #themes, 월드 인포 편집창 #world_editor_select)  ④ 유저가 고른 버튼에 탭 1회 흉내(제자리 좌표)
//   (봇·그룹 열기는 실리 공식 컨텍스트 API selectCharacterById / openGroupChat — 봇 목록에서 카드를 눌렀을 때 실리가 부르는 그 함수)
// • 다른 확장의 함수·설정·DOM 은 건드리지 않는다. 남기는 건 우리 슬롯 설정(link)뿐 → 연동을 빼면 아무것도 남지 않는다.
// • 못 찾으면 토스트 한 번(누르면 다시 고르기)으로 끝. 재시도·타이머·옵저버·전역 리스너 없음
//   (QR 팝업이 열려 있는 동안의 바깥 탭/ESC 감지만 예외, 닫으면 즉시 해제).
// • 대상은 고유값으로 저장: 프로필 id · 페르소나/봇 아바타 파일명 · 그룹 id · 확장 폴더명.
//   실리가 이름으로만 관리하는 것(프리셋·월드 인포 책·QR 세트)은 이름.
// • 유일한 외부 API: 실리 내장 QR 확장이 공개한 window.quickReplyApi (없으면 안내만, 의존 아님).
// • 모든 목록 읽기는 설정 모달을 열 때만, 실행 때는 찾기+누르기뿐. 로드 시 아무 일도 하지 않는다.
//
// === 🔗 의존성 ===
// • 실행 시점에 commands.js(executeSilentCommand), ui.js(commitSlotLink) 사용
// ===================================================================

(function() {
    'use strict';

    let isDebugMode = window.copybot_debug_mode || false;
    function debugLog(...args) { if (isDebugMode) console.log('🐞 깡갤 복사기 [shortcut]:', ...args); }
    function ctx() { return window.SillyTavern?.getContext?.() || null; }
    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    // 실리 상단바 메뉴 (고급 서식은 유저 결정으로 제외). key 는 설정에 저장되므로 변경 금지
    const MENUS = {
        preset:  { label: '사전설정',    buttonId: 'ai-config-button',           icon: 'fa-sliders',      action: { label: '프리셋 바꾸기',   sub: '고른 프리셋으로 바로 바꿉니다' } },
        api:     { label: 'API·프로필',  buttonId: 'sys-settings-button',        icon: 'fa-plug',         action: { label: '프로필 바꾸기',   sub: 'API·모델·딸린 프리셋까지 그 프로필대로' } },
        wi:      { label: '월드 인포',   buttonId: 'WI-SP-button',               icon: 'fa-book-atlas',   action: { label: '책 열기',         sub: '월드 인포 편집창에 고른 책을 엽니다' } },
        user:    { label: '사용자 설정', buttonId: 'user-settings-button',       icon: 'fa-user-cog',     action: { label: '테마 바꾸기',     sub: '사용자 설정 안의 UI 테마를 고른 것으로 바로 바꿉니다', icon: 'fa-palette' } },
        bg:      { label: '배경',        buttonId: 'backgrounds-button',         icon: 'fa-panorama' },
        ext:     { label: '확장',        buttonId: 'extensions-settings-button', icon: 'fa-cubes',        action: { label: '확장 연결',       sub: '고른 확장의 화면(설정·마법봉·옵션 메뉴 등)을 바로 엽니다' } },
        persona: { label: '페르소나',    buttonId: 'persona-management-button',  icon: 'fa-face-smile',   action: { label: '페르소나 바꾸기', sub: '고른 페르소나로 바꾸고(원하면) 고정합니다' } },
        char:    { label: '봇',          buttonId: 'rightNavHolder',             icon: 'fa-address-card', action: { label: '봇 바꾸기',       sub: '고른 봇과의 채팅을 엽니다' } },
    };
    const MENU_ORDER = ['preset', 'api', 'wi', 'user', 'bg', 'ext', 'persona', 'char'];
    // 예전 저장본의 별도 '테마' 메뉴는 "사용자 설정 → 테마 바꾸기" 로 옮긴다 (유저 결정: 테마는 사용자 설정의 하위)
    function normalizeLink(link) {
        if (link && typeof link === 'object' && link.menu === 'theme') return { menu: 'user', mode: 'select', target: link.target || null };
        return link;
    }
    const HOW = {
        simple:    { label: '단순 변경',       sub: '페르소나만 바꾸고 고정은 하지 않습니다' },
        chat:      { label: '이 채팅에 고정',  sub: '바꾼 뒤 지금 열린 채팅에 잠급니다' },
        character: { label: '봇에 고정',       sub: '바꾼 뒤 지금 열린 봇에 잠급니다' },
        default:   { label: '기본 페르소나로', sub: '바꾼 뒤 새 채팅에서 자동 선택되는 기본으로 지정합니다' },
    };
    // 확장 진입 버튼이 놓이는 자리 (읽기 전용 스캔)
    const ZONES = {
        drawer:  { label: '확장 목록',    icon: 'fa-cubes' },
        wand:    { label: '마법봉 메뉴',  icon: 'fa-magic-wand-sparkles' },
        options: { label: '옵션(≡) 메뉴', icon: 'fa-bars' },
        input:   { label: '입력창 옆',    icon: 'fa-keyboard' },
        topbar:  { label: '상단바',       icon: 'fa-window-maximize' },
    };
    const NATIVE_TOPBAR = new Set(['ai-config-button', 'sys-settings-button', 'advanced-formatting-button', 'WI-SP-button', 'user-settings-button', 'backgrounds-button', 'extensions-settings-button', 'persona-management-button', 'rightNavHolder']);
    const NATIVE_INPUT = new Set(['options_button', 'extensionsMenuButton', 'qr_toggle_button', 'send_but', 'mes_stop', 'mes_continue', 'mes_impersonate', 'stscript_continue', 'stscript_pause', 'stscript_stop', 'file_form_reset', 'qr--popoutTrigger', 'send_textarea', 'leftSendForm', 'rightSendForm', 'nonQRFormItems', 'send_form']);
    const isOurs = (el) => /copybot/i.test(`${el.id || ''} ${typeof el.className === 'string' ? el.className : ''}`);

    // ----------------------------------------------------------------
    // 공통 도우미
    // ----------------------------------------------------------------
    function fail(msg) { try { toastr.warning(msg); } catch (e) { /* 무시 */ } return false; }
    function notFound(msg, env) {
        const index = env?.slot?.index;
        const opts = { timeOut: 7000 };
        if (Number.isInteger(index)) { opts.onclick = () => reconfigureSlot(index); msg += ' (눌러서 다시 고르기)'; }
        try { toastr.warning(msg, '', opts); } catch (e) { /* 무시 */ }
        return false;
    }
    function normText(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
    function normKey(s) { return String(s || '').toLowerCase().replace(/[\s_\-\.:]+/g, ''); }
    function faClasses(el) {
        if (!el) return '';
        const node = (el.className && /\bfa-/.test(String(el.className))) ? el : el.querySelector('[class*="fa-"]');
        if (!node || typeof node.className !== 'string') return '';
        return node.className.split(/\s+/).filter(c => /^fa-/.test(c) && !/^fa-(solid|regular|light|brands|fw|lg|sm|xs|\dx)$/.test(c)).join(' ');
    }
    // STscript 인자: 공백·따옴표·파이프·등호가 들어 있으면 큰따옴표로 감싼다
    //  • 따옴표는 백슬래시로 가린다. 파이프는 실리 파서 설정에 따라 다르다(실리 1.19 SlashCommandParser 확인):
    //      기본(느슨) 모드 — 따옴표 안이라도 안 가린 파이프는 "명령 끝"으로 읽어 파서 오류로 통째로 실패 → `\|` 로 가려야 글자로 읽힌다
    //      엄격 모드(유저 설정 STRICT_ESCAPING) — 따옴표 안 파이프는 그냥 글자이고, 가리면 백슬래시까지 이름에 들어간다 → 가리지 않는다
    //  • 등호: `temp=1` 같은 이름은 감싸지 않으면 이름 붙은 인자(key=value)로 읽혀 대상이 빈 값이 된다
    function strictEscaping() {
        try { return ctx()?.powerUserSettings?.stscript?.parser?.flags?.[1] === true; } catch (e) { return false; }   // PARSER_FLAG.STRICT_ESCAPING = 1
    }
    function quoteArg(s, strict = strictEscaping()) {
        s = String(s);
        if (!/[\s"|{}=]/.test(s)) return s;
        return `"${s.replace(strict ? /(")/g : /(["|])/g, '\\$1')}"`;
    }
    async function cmd(command) {
        if (!window.CopyBotCommands?.executeSilentCommand) return { isError: true, errorMessage: 'commands 모듈 없음' };
        return await window.CopyBotCommands.executeSilentCommand(command, null);
    }
    // 열린 채팅의 메타데이터(페르소나 잠금 등)를 실리 공식 API 로 즉시 저장 (실리 자체는 지연 저장이라, 바로 채팅을 바꾸면 유실될 수 있음)
    async function flushChatMetadata() {
        try { const c = ctx(); if (c && typeof c.saveMetadata === 'function' && c.getCurrentChatId?.()) await c.saveMetadata(); } catch (e) { debugLog('saveMetadata 실패', e); }
    }
    const normalizeAction = (raw) => (String(raw || '').startsWith('st_menu:') ? 'st_menu' : String(raw || ''));
    function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
    // 조건이 참이 될 때까지 짧게 기다림 (고정 대기 대신 실제 상태 확인)
    async function waitFor(pred, ms = 1000, step = 50) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
            try { if (pred()) return true; } catch (e) { /* 무시 */ }
            await wait(step);
        }
        try { return !!pred(); } catch (e) { return false; }
    }
    const isGenerating = () => { try { return $('#mes_stop').is(':visible'); } catch (e) { return false; } };
    // 유저의 탭을 흉내 낸다: 누름(pointerdown/mousedown) → 뗌(pointerup/mouseup) → click, 좌표는 그 요소가 실제로 있는 자리 가운데.
    // 좌표를 다른 곳(우리 버튼 등)으로 바꾸지 않는다 — 그 확장의 팝업은 원래 뜨던 자리에 원래대로 떠야 한다(변조 금지).
    // 그 확장의 코드는 우리가 직접 부르지 않는다 — 브라우저가 평소처럼 이벤트를 전달할 뿐.
    function tapElement(target) {
        const r = target.getBoundingClientRect();
        const hasBox = r.width > 0 && r.height > 0;
        const x = hasBox ? r.left + r.width / 2 : 0;
        const y = hasBox ? r.top + r.height / 2 : 0;
        const base = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons: 1 };
        const ptr = { pointerId: 1, pointerType: 'mouse', isPrimary: true, width: 1, height: 1 };
        try {
            if (typeof PointerEvent === 'function') target.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, base, ptr)));
            target.dispatchEvent(new MouseEvent('mousedown', base));
            if (typeof PointerEvent === 'function') target.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, base, ptr, { buttons: 0 })));
            target.dispatchEvent(new MouseEvent('mouseup', Object.assign({}, base, { buttons: 0 })));
        } catch (e) { debugLog('포인터 이벤트 생략', e); }
        target.dispatchEvent(new MouseEvent('click', Object.assign({}, base, { buttons: 0, detail: 1 })));
    }
    // 마법봉(🪄)·옵션(≡) 메뉴 안 항목: 유저가 하듯이 실리 기본 메뉴 버튼으로 메뉴를 열고 → 항목을 제자리에서 누르고 → 우리가 연 메뉴만 닫는다.
    // (그 확장이 항목 위치 기준으로 팝업을 띄우면 원래 자리에 뜨고, 이미 열려 있던 메뉴는 건드리지 않는다)
    async function tapMenuItem(found) {
        const isWand = found.zone === 'wand';
        const menu = document.getElementById(isWand ? 'extensionsMenu' : 'options');
        const opener = document.getElementById(isWand ? 'extensionsMenuButton' : 'options_button');
        let openedByUs = false;
        // 우리가 여는 동안만 메뉴를 눈에 안 보이게 가린다(visibility — 자리·크기는 그대로라 항목 좌표·팝업 위치는 실제 메뉴와 같고, jQuery :visible 판정도 그대로).
        // 유저가 누른 건 "메모장 열기"지 "마법봉 메뉴 보기"가 아니다(2026-10-25 유저 지적: 메뉴가 잠깐 떴다 사라짐). 끝나면 어떤 경로든 되돌린다(finally).
        const prevVisibility = menu ? menu.style.visibility : '';
        let masked = false;
        try {
            if (menu && opener && !$(menu).is(':visible')) {
                try { menu.style.visibility = 'hidden'; masked = true; } catch (e) { /* 무시 */ }
                // 실제 탭처럼 버튼에 포커스를 둔다 — 실리의 "메뉴 밖을 눌렀으면 닫기" 판정이 버튼의 :focus/:hover 를 보므로, 포커스 없이 누르면 열리자마자 닫힘
                try { opener.focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
                // 실리 기본 메뉴 버튼 (유저가 누른 것과 동일). 어떤 확장은 메뉴를 직접 숨겨 실리의 열림/닫힘 기억이 어긋나 있어
                // 한 번 눌러도 안 열릴 수 있다 → 유저가 하듯 한 번 더 누른다 (둘 다 실리 토글 경로라 상태가 다시 맞춰짐)
                for (let attempt = 0; attempt < 2 && !$(menu).is(':visible'); attempt++) {
                    $(opener).trigger('click');
                    await waitFor(() => $(menu).is(':visible') && found.el.getBoundingClientRect().height > 0, 350);
                }
                openedByUs = $(menu).is(':visible');
                // 항목을 누르기 전에 버튼 포커스를 뗀다 → 항목 클릭이 문서까지 올라갈 때 실리의 "메뉴 밖 클릭" 판정이 평소처럼 메뉴를 닫아
                // 실리 내부의 열림/닫힘 기억이 어긋나지 않는다 (어떤 확장은 메뉴를 직접 숨겨 어긋나게 만듦 → 다음 ≡ 탭이 두 번 필요해지는 현상 방지)
                try { if (document.activeElement === opener) opener.blur(); } catch (e) { /* 무시 */ }
            }
            tapElement(found.el);
            if (openedByUs) await closeMenuWeOpened(menu, opener);
        } finally {
            if (masked) { try { menu.style.visibility = prevVisibility; } catch (e) { /* 무시 */ } }
        }
    }
    // 우리가 연 메뉴 닫기. 실리는 항목 클릭이 문서까지 올라오면 메뉴를 fadeOut(기본 125ms)으로 닫고 자기 기억을 '닫힘'으로 바꾼다. 닫히는 동안에도 :visible 은 참이라
    // 그 사이에 "아직 열려 있네" 하고 버튼을 다시 누르면 실리는 '닫힘'이라 fadeIn 으로 다시 연다 → 그 확장의 팝업 위에 메뉴가 사라졌다 다시 뜨는
    // 엎치락뒤치락(2026-10-25 원고지 테마에서 발견. "움직임 줄이기"가 꺼진 테마에서만 보이고, 켜진 테마는 애니메이션 0ms 라 그 전에 이미 닫혀 있었음).
    // → 실리의 열림/닫힘 애니메이션이 끝나 상태가 확정된 뒤에만 판단한다(숨겨졌거나, 보이는데 움직이지 않을 때).
    async function closeMenuWeOpened(menu, opener) {
        await waitFor(() => !$(menu).is(':visible') || !$(menu).is(':animated'), 1500, 25);
        if ($(menu).is(':visible')) {
            // 애니메이션이 끝났는데도 열려 있다 = 그 확장이 클릭 전파를 막아 실리가 닫지 않았다 → 실리 기억도 '열림'이므로 실리 버튼으로 닫는다
            $(opener).trigger('click');
            await waitFor(() => !$(menu).is(':visible'), 1500, 25);
            if ($(menu).is(':visible')) $(menu).stop(true, true).hide();
        }
    }

    // ----------------------------------------------------------------
    // 설명 (슬롯 표시·버튼 라벨·아이콘) — 고유값으로 "지금 이름"을 다시 읽는다
    // ----------------------------------------------------------------
    function findProfile(id) {
        const list = ctx()?.extensionSettings?.connectionManager?.profiles;
        return Array.isArray(list) ? (list.find(p => p && p.id === id) || null) : null;
    }
    function findCharacter(avatar) {
        const list = ctx()?.characters;
        return Array.isArray(list) ? (list.find(c => c && c.avatar === avatar) || null) : null;
    }
    function findGroup(id) {
        const list = ctx()?.groups;
        return Array.isArray(list) ? (list.find(g => g && g.id === id) || null) : null;
    }
    function personaName(avatar) {
        const personas = ctx()?.powerUserSettings?.personas;
        return personas && Object.prototype.hasOwnProperty.call(personas, avatar) ? String(personas[avatar] || '') : null;
    }
    // 이 페르소나가 이미 그 방식으로 고정돼 있는가 (실리 isPersonaLocked 과 같은 판정을 읽기만으로)
    function isPersonaLockedAs(how, avatar) {
        const c = ctx(); const pu = c?.powerUserSettings || {};
        if (how === 'default') return pu.default_persona === avatar;
        if (how === 'chat') return (c?.chatMetadata?.persona || null) === avatar;
        if (how === 'character') {
            const conns = pu.persona_descriptions?.[avatar]?.connections;
            if (!Array.isArray(conns)) return false;
            if (c?.groupId) return conns.some(x => x && x.type === 'group' && x.id === c.groupId);
            const ch = c?.characters?.[c.characterId];
            return !!ch && conns.some(x => x && x.type === 'character' && x.id === ch.avatar);
        }
        return false;
    }

    function describe(action, link) {
        link = normalizeLink(link) || {};
        if (action === 'qr_set') {
            const set = link.set || '', label = link.label || '';
            if (set && label) {
                let icon = 'fa-reply';
                try { const q = qrApi()?.getSetByName(set)?.qrList?.find(x => x && x.label === label); if (q && q.icon) icon = String(q.icon); } catch (e) { /* 무시 */ }
                return { label: `QR: ${label}`, icon, configured: true, detail: `QR 세트 "${set}" 의 "${label}" 을(를) 바로 실행합니다`, hint: '버튼을 누르면 그 QR 하나를 바로 실행합니다. 세트에서 없어지면 안내만 하고 멈춥니다.' };
            }
            return { label: set ? `QR: ${set}` : 'QR(빠른 답장)', icon: 'fa-reply', configured: !!set,
                detail: set ? `QR 세트 "${set}" — 버튼 위 팝업에서 하나를 골라 실행합니다` : 'QR 세트를 아직 고르지 않았습니다',
                hint: '버튼을 누르면 그 세트의 QR 목록이 버튼 위에 떠서 하나를 골라 실행합니다. 바에서 숨긴 QR 은 목록에 안 나옵니다.' };
        }
        if (action !== 'st_menu') return null;
        const menu = MENUS[link.menu];
        if (!menu) return { label: '실리 메뉴', icon: 'fa-bars', configured: false, detail: '실리 메뉴를 아직 고르지 않았습니다' };
        const HINT = '유저가 직접 눌렀을 때와 같은 일만 하며, 대상을 못 찾으면 안내만 하고 멈춥니다.';
        if (link.mode !== 'select') return { label: menu.label, icon: menu.icon, configured: true, detail: `실리 "${menu.label}" 메뉴를 엽니다 (열려 있으면 닫음)`, hint: HINT };
        const t = link.target || {};
        const withHint = (d) => Object.assign(d, { hint: d.hint || HINT });
        return withHint(describeSelect(menu, link.menu, t));
    }
    function describeSelect(menu, key, t) {
        switch (key) {
            case 'preset':
                return { label: `프리셋: ${t.name || ''}`, icon: menu.icon, configured: !!t.name, detail: t.name ? `프리셋 "${t.name}" 으로 바꿉니다` : '프리셋을 아직 고르지 않았습니다' };
            case 'api': {
                const live = t.id ? findProfile(t.id) : null;
                const name = live ? live.name : (t.name || '');
                return { label: `프로필: ${name}`, icon: menu.icon, configured: !!t.id, detail: t.id ? `프로필 "${name}" 로 바꿉니다${live ? '' : ' (지금은 찾을 수 없음)'}` : '프로필을 아직 고르지 않았습니다' };
            }
            case 'wi':
                return { label: `월드: ${t.name || ''}`, icon: menu.icon, configured: !!t.name, detail: t.name ? `월드 인포 편집창에 "${t.name}" 을(를) 엽니다` : '책을 아직 고르지 않았습니다' };
            case 'user':
                return { label: `테마: ${t.name || ''}`, icon: menu.action.icon, configured: !!t.name, detail: t.name ? `사용자 설정 › 테마 "${t.name}" 으로 바꿉니다` : '테마를 아직 고르지 않았습니다' };
            case 'ext': {
                const e = t.entry || {}, x = t.ext || {};
                const zone = ZONES[e.zone]?.label || '';
                return { label: e.label || x.display || '확장', icon: e.icon || 'fa-puzzle-piece', configured: !!(e.zone && e.label),
                    detail: e.label ? `${x.display || ''} › ${zone} "${e.label}"` : '진입 화면을 아직 고르지 않았습니다',
                    hint: '그 확장의 버튼을 유저가 직접 누른 것처럼 눌러 줍니다. 확장을 끄거나 화면이 바뀌어 못 찾으면 안내만 하고 멈춥니다.' };
            }
            case 'persona': {
                const live = t.avatar ? personaName(t.avatar) : null;
                const name = live !== null ? live : (t.name || '');
                const how = HOW[t.how]?.label || HOW.simple.label;
                return { label: `페르소나: ${name}`, icon: menu.icon, configured: !!t.avatar, detail: t.avatar ? `페르소나 "${name}" — ${how}${live === null ? ' (지금은 찾을 수 없음)' : ''}` : '페르소나를 아직 고르지 않았습니다' };
            }
            case 'char': {
                if (t.group) {
                    const g = findGroup(t.group); const name = g ? g.name : (t.name || '');
                    return { label: `그룹: ${name}`, icon: 'fa-users', configured: true, detail: `그룹 "${name}" 채팅을 엽니다${g ? '' : ' (지금은 찾을 수 없음)'}` };
                }
                const c = t.avatar ? findCharacter(t.avatar) : null; const name = c ? c.name : (t.name || '');
                return { label: `봇: ${name}`, icon: menu.icon, configured: !!t.avatar, detail: t.avatar ? `봇 "${name}" 과의 채팅을 엽니다${c ? '' : ' (지금은 찾을 수 없음)'}` : '봇을 아직 고르지 않았습니다' };
            }
        }
        return { label: menu.label, icon: menu.icon, configured: false, detail: '' };
    }
    // 커스텀 버튼 드롭다운 맨 위 묶음
    function menuOptionsHtml() {
        const esc = (s) => window.CopyBotUtils?.escapeHtml ? window.CopyBotUtils.escapeHtml(s) : String(s);
        const opts = MENU_ORDER.map(k => `<option value="st_menu:${k}">${esc(MENUS[k].label)}${MENUS[k].action ? '…' : ''}</option>`).join('');
        return `<optgroup label="실리 메뉴">${opts}</optgroup><option value="qr_set">QR(빠른 답장)…</option>`;
    }
    function canReconfigure(action, link) {
        if (action === 'qr_set') return true;
        if (action !== 'st_menu') return false;
        return !!MENUS[normalizeLink(link)?.menu]?.action;
    }

    // ----------------------------------------------------------------
    // 고르기 팝업 (실리 Popup — 구조는 실리 기본, 배색은 유저 테마)
    // ----------------------------------------------------------------
    // items: [{ key, label, sub, icon, img, badge, current, desc(미리보기), detail(본문 전체), search }] / groups: [{ title, items, collapsed }]
    // detail=true: 줄을 누르면 바로 확정하지 않고 아래 박스에 본문 전체를 보여주며(박스 안 스크롤), [confirmLabel] 버튼으로 확정
    // backButton=true: 제목 오른쪽 ← 아이콘 → BACK 을 돌려줌 / it.children: 검색어가 자식(예: 세트 안 QR)에 걸릴 때만 부모 아래 "ㄴ" 줄로 보여줌
    const BACK = '__copybot_back__';
    async function pickFromList({ title, hint, items = [], groups = null, filter = true, large = true, emptyText = '고를 항목이 없습니다.', detail = false, confirmLabel = '선택', detailPlaceholder = '항목을 누르면 본문 전체가 여기에 보입니다.', backButton = false }) {
        const c = ctx();
        const Popup = c?.Popup, PT = c?.POPUP_TYPE, PR = c?.POPUP_RESULT;
        if (typeof Popup !== 'function' || !PT || !PR) { fail('실리 팝업 API 를 찾지 못했습니다. 실리태번 1.12 이상이 필요합니다.'); return null; }

        const root = el('div', 'copybot_sc_picker' + (detail ? ' copybot_sc_picker_detail' : ''));
        const h = el('div', 'copybot_sc_title'); h.textContent = title;
        if (hint) { const s = el('small'); s.textContent = hint; h.appendChild(s); }
        let backEl = null;
        if (backButton) { backEl = el('div', 'copybot_sc_back fa-solid fa-arrow-left'); backEl.title = '목록으로'; backEl.setAttribute('role', 'button'); backEl.tabIndex = 0; h.appendChild(backEl); }
        root.appendChild(h);
        let input = null;
        if (filter) {
            input = el('input', 'text_pole copybot_sc_filter');
            input.type = 'search'; input.placeholder = '검색 (누르면 입력)';
            // 유저가 직접 누르기 전엔 inputmode=none → 실리 팝업이 어떤 이유로든 이 칸에 포커스를 줘도 폰 키보드가 뜨지 않는다 (키보드가 걸려 화면이 반으로 줄어드는 사고 방지)
            input.setAttribute('inputmode', 'none'); input.setAttribute('enterkeyhint', 'search'); input.setAttribute('autocomplete', 'off');
            const arm = () => { input.setAttribute('inputmode', 'search'); };
            input.addEventListener('pointerdown', arm, { once: true }); input.addEventListener('touchstart', arm, { once: true, passive: true });
            root.appendChild(input);
        }
        const list = el('div', 'copybot_sc_list'); root.appendChild(list);

        let chosen = null, popup = null, selectedKey = null;
        const rows = [];
        let detailTitle = null, detailBox = null, confirmBtn = null;
        const selectRow = (it, row) => {
            selectedKey = it.key;
            rows.forEach(r => r.row.classList.toggle('copybot_sc_selected', r.row === row));
            if (detailTitle) detailTitle.textContent = it.label + (it.sub ? ` · ${it.sub}` : '');
            if (detailBox) {
                detailBox.textContent = it.detail || it.desc || '(설명이 없습니다)';
                try { detailBox.scrollTo({ top: 0, behavior: 'instant' }); } catch (e) { detailBox.scrollTop = 0; }   // 테마의 부드러운 스크롤과 무관하게 즉시 맨 위로
            }
            if (confirmBtn) confirmBtn.disabled = false;
        };
        const addRow = (parent, it, parentRow = null) => {
            const row = el('div', 'copybot_sc_item interactable' + (it.current ? ' copybot_sc_current' : '') + (it.ghost ? ' copybot_sc_item_ghost' : '') + (parentRow ? ' copybot_sc_child' : ''));
            row.tabIndex = 0; row.setAttribute('role', 'button');
            if (parentRow) { const m = el('span', 'copybot_sc_child_mark'); m.textContent = 'ㄴ'; row.appendChild(m); row.style.display = 'none'; }   // 자식 줄은 검색에 걸릴 때만
            if (it.img) {
                const img = el('img', 'copybot_sc_thumb'); img.src = it.img; img.loading = 'lazy'; img.alt = '';
                // 구버전 실리 등에서 썸네일을 못 받으면 아이콘으로 대체
                img.addEventListener('error', () => { const i = el('i', `fa-solid ${it.icon || 'fa-user'}`); img.replaceWith(i); }, { once: true });
                row.appendChild(img);
            } else { const i = el('i', `fa-solid ${it.icon || 'fa-circle'}`); row.appendChild(i); }
            const label = el('span', 'copybot_sc_label'); label.textContent = it.label; row.appendChild(label);
            if (it.sub) { const sub = el('small', 'copybot_sc_sub'); sub.textContent = it.sub; row.appendChild(sub); }
            if (it.badge) { const b = el('span', 'copybot_sc_badge'); b.textContent = it.badge; row.appendChild(b); }
            if (it.current) { const b = el('span', 'copybot_sc_badge copybot_sc_badge_current'); b.textContent = '현재'; row.appendChild(b); }
            if (it.desc) { const d = el('div', 'copybot_sc_desc'); d.textContent = it.desc; row.appendChild(d); }     // 본문 미리보기 (CSS 로 3줄까지)
            const choose = (e) => {
                e.preventDefault(); e.stopPropagation();
                if (detail && !it.ghost) { selectRow(it, row); return; }          // 본문 보기 모드: 먼저 고르고 아래 버튼으로 확정
                chosen = it.key; if (popup) popup.complete(PR.AFFIRMATIVE);
            };
            row.addEventListener('click', choose);
            row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') choose(e); });
            parent.appendChild(row);
            rows.push({ row, it, parentRow, text: String(it.search || `${it.label} ${it.sub || ''} ${it.desc || ''}`).toLowerCase() });
            if (Array.isArray(it.children)) it.children.forEach(ch => addRow(parent, ch, row));
        };
        const groupList = groups || [{ items }];
        for (const g of groupList) {
            if (!g.items || !g.items.length) continue;
            let container = list;
            if (g.collapsed) {
                const det = el('details', 'copybot_sc_details');
                const sum = el('summary'); sum.textContent = `${g.title} (${g.items.length})`;
                det.appendChild(sum); list.appendChild(det); container = det;
            } else if (g.title) {
                const gt = el('div', 'copybot_sc_group_title'); gt.textContent = `${g.title} (${g.items.length})`; list.appendChild(gt);
            }
            g.items.forEach(it => addRow(container, it));
        }
        if (!rows.length) { const e = el('div', 'copybot_sc_empty'); e.textContent = emptyText; list.appendChild(e); }
        if (detail) {
            detailTitle = el('div', 'copybot_sc_detail_title'); detailTitle.textContent = '본문';
            detailBox = el('div', 'copybot_sc_detail'); detailBox.textContent = detailPlaceholder;
            // copybot_plain_button: 실리 menu_button 이 세로 flex 안에서 좁아져 글자가 세로로 쪼개지는 것 방지 (inline-flex·nowrap·max-content)
            confirmBtn = el('button', 'menu_button copybot_plain_button copybot_sc_confirm'); confirmBtn.type = 'button'; confirmBtn.textContent = confirmLabel; confirmBtn.disabled = true;
            confirmBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (selectedKey === null) return; chosen = selectedKey; if (popup) popup.complete(PR.AFFIRMATIVE); });
            root.appendChild(detailTitle); root.appendChild(detailBox); root.appendChild(confirmBtn);
            const cur = rows.find(r => r.it.current);                                    // 지금 쓰는 항목이 있으면 미리 골라 본문을 보여줌
            if (cur) selectRow(cur.it, cur.row);
        }
        if (input) {
            input.addEventListener('input', () => {
                const q = input.value.trim().toLowerCase();
                // 자식 줄(세트 안 QR 등)은 검색어가 있고 자기에게 걸릴 때만, 부모 줄은 자기나 자식 중 하나라도 걸리면
                rows.forEach(r => { if (r.parentRow) r.row.style.display = (q && r.text.includes(q)) ? '' : 'none'; });
                rows.forEach(r => {
                    if (r.parentRow) return;
                    const kidShown = !!q && rows.some(k => k.parentRow === r.row && k.row.style.display !== 'none');
                    r.row.style.display = (!q || r.text.includes(q) || kidShown) ? '' : 'none';
                });
                if (q) list.querySelectorAll('details').forEach(d => { d.open = true; });
            });
        }
        if (backEl) {
            const goBack = (e) => { e.preventDefault(); e.stopPropagation(); chosen = BACK; if (popup) popup.complete(PR.AFFIRMATIVE); };
            backEl.addEventListener('click', goBack);
            backEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') goBack(e); });
        }
        try {
            popup = new Popup(root, PT.TEXT, '', {
                okButton: false, cancelButton: '닫기', large: !!large, wide: !!large, allowVerticalScrolling: true, leftAlign: true,
                // 검색칸이 자동으로 포커스돼 폰 키보드가 뜨는 일이 없게 (키보드는 유저가 직접 누를 때만)
                onOpen: () => { requestAnimationFrame(() => { const ae = document.activeElement; if (ae && ae !== document.body && typeof ae.matches === 'function' && ae.matches('input, textarea')) ae.blur(); }); },
            });
            const result = await popup.show();
            return (result === PR.AFFIRMATIVE && chosen !== null) ? chosen : null;
        } catch (e) {
            console.error('깡갤 복사기: 고르기 팝업 실패', e);
            fail('팝업을 열지 못했습니다.');
            return null;
        }
    }

    // ----------------------------------------------------------------
    // 목록 읽기 (전부 읽기 전용)
    // ----------------------------------------------------------------
    function listPresets() {
        const c = ctx();
        const pm = typeof c?.getPresetManager === 'function' ? c.getPresetManager() : null;
        if (!pm || typeof pm.getAllPresets !== 'function') return null;
        const names = (pm.getAllPresets() || []).map(n => String(n)).filter(n => n.trim());
        const current = typeof pm.getSelectedPresetName === 'function' ? pm.getSelectedPresetName() : null;
        return { api: String(c.mainApi || pm.apiId || ''), names, current };
    }
    function listProfiles() {
        const cm = ctx()?.extensionSettings?.connectionManager;
        if (!cm || !Array.isArray(cm.profiles)) return null;
        return { current: cm.selectedProfile, list: cm.profiles.filter(p => p && p.id).map(p => ({ id: p.id, name: String(p.name || ''), api: String(p.api || p.mode || ''), model: String(p.model || '') })) };
    }
    function listWorlds() {
        const sel = document.getElementById('world_editor_select');
        if (!sel) return null;
        return { current: sel.value, list: Array.from(sel.options).filter(o => o.value !== '' && normText(o.text)).map(o => ({ value: o.value, name: normText(o.text) })) };
    }
    function listThemes() {
        const sel = document.getElementById('themes');
        if (!sel) return null;
        const current = String(ctx()?.powerUserSettings?.theme ?? sel.value ?? '');
        return { current, list: Array.from(sel.options).map(o => String(o.value)).filter(v => v.trim()) };
    }
    function listPersonas() {
        const c = ctx(); const pu = c?.powerUserSettings;
        if (!pu || !pu.personas) return null;
        // 패널의 .selected 표시는 패널을 다시 그릴 때만 갱신돼 뒤처질 수 있어, 현재 유저 이름(name1)과도 대조한다
        const selected = document.querySelector('#user_avatar_block .avatar-container.selected')?.getAttribute('data-avatar-id') || null;
        const name1 = String(c.name1 || '');
        const descs = pu.persona_descriptions || {};
        const list = Object.keys(pu.personas).map(avatar => ({
            avatar, name: String(pu.personas[avatar] || ''),
            title: normText(descs[avatar]?.title), desc: normText(descs[avatar]?.description),      // 같은 이름 페르소나를 본문으로 구분할 수 있게 (미리보기·검색용, 공백 접음)
            descFull: String(descs[avatar]?.description || '').trim(),                               // 본문 전체 (줄바꿈 그대로)
            img: typeof c.getThumbnailUrl === 'function' ? c.getThumbnailUrl('persona', avatar) : '',
        }));
        list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        const byName = list.filter(p => p.name === name1);
        const current = (selected && byName.some(p => p.avatar === selected)) ? selected : (byName.length === 1 ? byName[0].avatar : selected);
        return { current, defaultPersona: pu.default_persona || null, list };
    }
    function listCharacters() {
        const c = ctx();
        if (!c || !Array.isArray(c.characters)) return null;
        const curAvatar = (c.characterId !== undefined && c.characters[c.characterId]) ? c.characters[c.characterId].avatar : null;
        const chars = c.characters.filter(x => x && x.avatar).map(x => ({
            avatar: x.avatar, name: String(x.name || ''), fav: !!x.fav,
            desc: normText(x.description), descFull: String(x.description || '').trim(),            // 같은 이름 봇을 카드 본문으로 구분
            creator: normText(x.data?.creator_notes || x.creatorcomment),
            img: typeof c.getThumbnailUrl === 'function' ? c.getThumbnailUrl('avatar', x.avatar) : '',
        }));
        chars.sort((a, b) => (b.fav - a.fav) || a.name.localeCompare(b.name, 'ko'));
        const groups = Array.isArray(c.groups) ? c.groups.filter(g => g && g.id).map(g => ({ group: g.id, name: String(g.name || '') })) : [];
        return { current: curAvatar, currentGroup: c.groupId || null, chars, groups };
    }
    function qrApi() {
        const api = window.quickReplyApi;
        return (api && typeof api.getSetByName === 'function' && typeof api.executeQuickReply === 'function') ? api : null;
    }
    function listQrSets() {
        const api = qrApi();
        if (!api || typeof api.listSets !== 'function') return null;
        const globals = new Set(typeof api.listGlobalSets === 'function' ? (api.listGlobalSets() || []) : []);
        return api.listSets().map(name => {
            let count = 0;
            try { const set = api.getSetByName(name); count = Array.isArray(set?.qrList) ? set.qrList.filter(q => q && !q.isHidden).length : 0; } catch (e) { count = 0; }
            return { name: String(name), count, inBar: globals.has(name) };
        });
    }
    async function listEnabledExtensions() {
        const c = ctx();
        if (!c) return null;
        const headers = typeof c.getRequestHeaders === 'function' ? c.getRequestHeaders() : {};
        let data;
        try {
            const res = await fetch('/api/extensions/discover', { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            data = await res.json();
        } catch (e) { debugLog('discover 실패', e); fail('확장 목록을 읽지 못했습니다.'); return null; }
        if (!Array.isArray(data)) return null;
        const disabled = new Set(Array.isArray(c.extensionSettings?.disabledExtensions) ? c.extensionSettings.disabledExtensions : []);
        const self = `third-party/${window.copybot_extension_folder || 'ggang-copy'}`;
        const out = [];
        for (const d of data) {
            const name = typeof d === 'string' ? d : d?.name;
            if (!name || disabled.has(name) || name === self) continue;
            const type = typeof d === 'string' ? (name.startsWith('third-party/') ? 'local' : 'system') : String(d.type || 'local');
            let manifest = null;
            try { manifest = typeof c.getExtensionManifest === 'function' ? c.getExtensionManifest(name) : null; } catch (e) { manifest = null; }
            if (!manifest || typeof manifest !== 'object') {
                try { const r = await fetch(`/scripts/extensions/${name}/manifest.json`); if (r.ok) manifest = await r.json(); } catch (e) { manifest = null; }
            }
            const folder = name.replace(/^third-party\//, '');
            out.push({ name, type, folder, display: normText(manifest?.display_name) || folder });
        }
        out.sort((a, b) => ((a.type === 'system') - (b.type === 'system')) || a.display.localeCompare(b.display, 'ko'));
        return out;
    }

    // ----------------------------------------------------------------
    // 확장 진입 버튼 스캔 (읽기 전용) — 우리 자신의 요소는 제외 (무한 루프 방지)
    // ----------------------------------------------------------------
    function entryOf(zone, node, label, id, extra = {}) {
        label = normText(label);
        if (!label) return null;
        return Object.assign({ zone, id: id || '', label, icon: faClasses(node), el: node, key: `${zone}|${id || ''}|${label}` }, extra);
    }
    function scanDrawers() {
        const out = [];
        for (const d of document.querySelectorAll('#extensions_settings .inline-drawer, #extensions_settings2 .inline-drawer')) {
            if (d.parentElement && d.parentElement.closest('.inline-drawer-content')) continue;   // 다른 서랍 안의 하위 서랍은 제외
            if (isOurs(d) || (d.parentElement && isOurs(d.parentElement))) continue;
            const head = d.querySelector(':scope > .inline-drawer-toggle, :scope > .inline-drawer-header');
            if (!head) continue;
            const parentId = d.parentElement?.id || '';
            const holderId = d.id || (parentId && parentId !== 'extensions_settings' && parentId !== 'extensions_settings2' ? parentId : '');
            const e = entryOf('drawer', head, head.textContent, holderId, { drawer: d });
            if (e) out.push(e);
        }
        return out;
    }
    function scanWand() {
        const out = [];
        for (const item of document.querySelectorAll('#extensionsMenu .list-group-item')) {
            if (isOurs(item) || (item.parentElement && isOurs(item.parentElement))) continue;
            const e = entryOf('wand', item, item.textContent || item.title, item.id);
            if (e) out.push(e);
        }
        return out;
    }
    function scanOptions() {
        const out = [];
        for (const item of document.querySelectorAll('#options .options-content > *')) {
            if (item.tagName === 'HR' || isOurs(item)) continue;
            if (/^option_/.test(item.id || '')) continue;     // 실리 기본 항목
            const e = entryOf('options', item, item.textContent || item.title, item.id);
            if (e) out.push(e);
        }
        return out;
    }
    function scanInput() {
        const out = [];
        const form = document.getElementById('send_form');
        if (!form) return out;
        for (const node of form.querySelectorAll('.interactable, .menu_button, button, [role="button"]')) {
            if (NATIVE_INPUT.has(node.id) || isOurs(node)) continue;
            if (node.closest('#qr--bar, #file_form')) continue;
            if (node.closest('[class*="copybot"]')) continue;
            const text = normText(node.textContent);
            const label = node.title || node.getAttribute('aria-label') || (text.length <= 24 ? text : '') || (faClasses(node) ? `아이콘 ${faClasses(node)}` : '');
            const e = entryOf('input', node, label, node.id, { hiddenNow: !$(node).is(':visible') });
            if (e) out.push(e);
        }
        return out;
    }
    function scanTopbar() {
        const out = [];
        const holder = document.getElementById('top-settings-holder');
        if (!holder) return out;
        for (const node of holder.children) {
            if (NATIVE_TOPBAR.has(node.id) || isOurs(node)) continue;
            const toggle = node.querySelector('.drawer-toggle') || node;
            const label = toggle.title || node.title || node.getAttribute('aria-label') || normText(toggle.textContent) || (faClasses(toggle) ? `아이콘 ${faClasses(toggle)}` : '');
            const e = entryOf('topbar', toggle, label, node.id || toggle.id);
            if (e) out.push(e);
        }
        return out;
    }
    // only: 그 자리 하나만 훑는다 (버튼을 누를 때는 저장된 자리만 보면 되므로 — 나머지 네 자리의 DOM 조회를 건너뜀)
    function scanZones(only = null) {
        const all = [];
        const seen = new Set();
        for (const [zone, fn] of [['drawer', scanDrawers], ['wand', scanWand], ['options', scanOptions], ['input', scanInput], ['topbar', scanTopbar]]) {
            if (only && zone !== only) continue;
            let list = [];
            try { list = fn(); } catch (e) { debugLog(`스캔 실패 ${zone}`, e); }
            for (const e of list) { if (seen.has(e.key)) continue; seen.add(e.key); all.push(e); }
        }
        return all;
    }
    function scanAllZones() { return scanZones(null); }
    // 확장 ↔ 진입 버튼 추정 — 특정 확장 이름을 적어 두지 않는 일반 규칙 (실리는 출처를 기록하지 않아 이름·id 유사도로만 추정, 최종 선택은 유저):
    //   확실(2): 라벨 == 표시 이름 / 라벨이 표시 이름(3자 이상)을 포함 / id·라벨이 폴더명(4자 이상)을 통째로 포함 / 확실히 잡힌 설정 서랍의 id 접두어를 공유
    //   비슷(1): 폴더명·표시 이름을 쪼갠 단어(영문 4자·한글 2자 이상, 흔한 단어 제외)가 id·라벨에 들어감
    const STOP_TOKENS = new Set(['sillytavern', 'silly', 'tavern', 'extension', 'extensions', 'third', 'party', 'plugin', 'plugins', 'manager', 'settings', 'setting', 'button', 'buttons', 'menu', 'panel', 'tools', 'tool', 'helper', 'system', 'simple', 'custom', 'quick', 'reply', 'toggle', 'container', 'block', 'index', 'script', 'scripts', 'main', 'lite', 'pro', 'plus', 'mobile', 'auto', 'chat', 'character', 'characters', 'message', 'messages', 'image', 'images', 'text',
        '설정', '관리', '메뉴', '열기', '닫기', '보기', '확장', '버튼', '목록', '기능', '모드', '도구', '패널', '매니저', '관리자', '뷰어', '실행', '추가', '삭제', '저장', '불러오기', '이미지', '메시지', '캐릭터', '채팅', '생성', '번역', '한글화', '한국어']);
    function tokensOf(s) {
        return String(s || '').toLowerCase().split(/[^a-z0-9가-힣]+/)
            .filter(t => t && !STOP_TOKENS.has(t) && (/[가-힣]/.test(t) ? t.length >= 2 : t.length >= 4))
            .flatMap(t => (/^[a-z]+s$/.test(t) && t.length >= 5) ? [t, t.slice(0, -1)] : [t]);     // 영문 복수형(timelines → timeline)도 대조
    }
    // id 에서 흔한 꼬리말(_settings, -container, _wand …)을 떼어 "확장 고유 접두어"를 얻는다 (예: voice_cast_settings → voice_cast)
    function baseKey(id) {
        let s = String(id || '').toLowerCase();
        for (let i = 0; i < 4; i++) {
            const n = s.replace(/[-_]?(settings|setting|container|drawer|block|panel|ui|wand|menu|item|button|btn|open|list|root|holder|wrapper|box|popup|modal|dialog)$/, '');
            if (n === s) break;
            s = n;
        }
        return s.length >= 4 ? s : '';
    }
    function matchLevel(ext, entry) {
        const label = normKey(entry.label), id = normKey(entry.id), display = normKey(ext.display), folder = normKey(ext.folder);
        const sep = (s) => String(s || '').toLowerCase().replace(/[\s_.:]+/g, '-');          // 단어 경계를 '-' 로 통일한 꼴
        const labelSep = sep(entry.label), displaySep = sep(ext.display), rawId = sep(entry.id), rawFolder = sep(ext.folder);
        const wordIn = (hay, word) => !!word && (hay === word || hay.startsWith(word + '-') || hay.endsWith('-' + word) || hay.includes('-' + word + '-'));
        if (display && label === display) return 2;                                           // 2글자 이름("깡폰")도 정확히 같으면 확실
        if (wordIn(labelSep, displaySep)) return 2;                                           // 라벨 안에 표시 이름이 "단어"로 들어감 (Memo 가 Memoria 에 잡히지 않게)
        if (display.length >= 6 && label.includes(display)) return 2;                        // 긴(독특한) 표시 이름은 붙어 있어도 확실
        if (folder.length >= 4 && (wordIn(labelSep, rawFolder) || (folder.length >= 8 && label.includes(folder)))) return 2;
        if (folder.length >= 8 && id.includes(folder)) return 2;                               // 긴(독특한) 폴더명은 id 어디에 있어도 확실
        if (folder.length >= 4) {                                                             // 짧은 폴더명(assets·memory 등 흔한 단어)은 id 맨 앞 "단어"일 때만 (character_assets·memoria 가 assets·memo 로 잡히지 않게)
            const idCore = rawId.replace(/^(sillytavern|st)-/, '');
            if ([rawId, idCore].some(x => x === rawFolder || x.startsWith(rawFolder + '-'))) return 2;
        }
        const toks = tokensOf(ext.folder).concat(tokensOf(ext.display));
        if (toks.some(t => id.includes(t) || label.includes(t))) return 1;
        return 0;
    }
    // 전체 항목을 확실/비슷으로 나눈다. 확실한 설정 서랍이 있으면 그 id 접두어를 공유하는 항목도 확실로 올린다
    function classifyEntries(ext, all) {
        const level = new Map(all.map(e => [e.key, matchLevel(ext, e)]));
        const bases = new Set();
        for (const e of all) if (level.get(e.key) === 2 && e.zone === 'drawer') { const b = baseKey(e.id); if (b) bases.add(b); }
        if (bases.size) {
            for (const e of all) {
                if (level.get(e.key) === 2 || !e.id) continue;
                const id = String(e.id).toLowerCase();
                for (const b of bases) { if (id === b || id.startsWith(b + '_') || id.startsWith(b + '-')) { level.set(e.key, 2); break; } }
            }
        }
        return { strong: all.filter(e => level.get(e.key) === 2), likely: all.filter(e => level.get(e.key) === 1) };
    }
    function resolveEntry(entry) {
        if (!entry || !ZONES[entry.zone]) return null;
        const list = scanZones(entry.zone);                         // 대부분 저장된 자리에서 바로 찾는다
        if (entry.id) {
            const byId = list.find(e => e.id === entry.id);
            if (byId) return byId;
            const moved = scanAllZones().find(e => e.id === entry.id);   // 확장이 항목을 다른 자리로 옮겼어도 id 가 정확히 같으면 그 항목 (못 찾았을 때만 전체를 훑음)
            if (moved) return moved;
        }
        const byLabel = list.filter(e => e.label === entry.label);
        return byLabel.length === 1 ? byLabel[0] : null;      // 라벨이 여럿이면 엉뚱한 걸 누르지 않도록 포기
    }

    // ----------------------------------------------------------------
    // 설정 흐름 (모달들)
    // ----------------------------------------------------------------
    async function pickMode(menu, link) {
        const cur = link?.mode === 'select' ? 'select' : (link?.mode === 'open' ? 'open' : null);
        return await pickFromList({
            title: `${menu.label} — 버튼을 누르면`, filter: false, large: false,
            items: [
                { key: 'open', label: `"${menu.label}" 메뉴 열기`, icon: menu.icon, sub: '열려 있으면 닫습니다', current: cur === 'open' },
                { key: 'select', label: `${menu.action.label}…`, icon: menu.action.icon || menu.icon, sub: menu.action.sub, current: cur === 'select' },
            ],
        });
    }
    async function pickPreset(prev) {
        const data = listPresets();
        if (!data) { fail('프리셋 목록을 읽지 못했습니다.'); return null; }
        const key = await pickFromList({ title: '프리셋 고르기', hint: `현재 API: ${data.api}`, items: data.names.map(n => ({ key: n, label: n, icon: MENUS.preset.icon, current: n === data.current })) });
        return key ? { name: key, api: data.api } : null;
    }
    async function pickProfile(prev) {
        const data = listProfiles();
        if (!data) { fail('연결 프로필 목록을 읽지 못했습니다. (실리 연결 프로필 기능이 꺼져 있을 수 있습니다)'); return null; }
        const key = await pickFromList({ title: '프로필 고르기', items: data.list.map(p => ({ key: p.id, label: p.name || '(이름 없음)', sub: [p.api, p.model].filter(Boolean).join(' · '), icon: MENUS.api.icon, current: p.id === data.current })) });
        const p = key ? data.list.find(x => x.id === key) : null;
        return p ? { id: p.id, name: p.name } : null;
    }
    async function pickWorld(prev) {
        const data = listWorlds();
        if (!data) { fail('월드 인포 목록을 읽지 못했습니다.'); return null; }
        const key = await pickFromList({ title: '월드 인포 책 고르기', items: data.list.map(w => ({ key: w.name, label: w.name, icon: MENUS.wi.icon, current: w.value === data.current && data.current !== '' })) });
        return key ? { name: key } : null;
    }
    async function pickTheme(prev) {
        const data = listThemes();
        if (!data) { fail('테마 목록을 읽지 못했습니다.'); return null; }
        const name = await pickFromList({ title: '테마 고르기', hint: '사용자 설정 › UI 테마', items: data.list.map(n => ({ key: n, label: n, icon: MENUS.user.action.icon, current: n === data.current })) });
        return name ? { name } : null;
    }
    async function pickPersona(prev) {
        const data = listPersonas();
        if (!data) { fail('페르소나 목록을 읽지 못했습니다.'); return null; }
        const key = await pickFromList({
            title: '페르소나 고르기', hint: '줄을 누르면 아래에 본문 전체 · 본문으로도 검색됩니다',
            detail: true, confirmLabel: '이 페르소나로 선택', detailPlaceholder: '페르소나를 누르면 본문 전체가 여기에 보입니다. 박스 안에서 스크롤해 끝까지 볼 수 있습니다.',
            items: data.list.map(p => ({ key: p.avatar, label: p.name || '(이름 없음)', sub: p.title, img: p.img, badge: p.avatar === data.defaultPersona ? '기본' : '', current: p.avatar === data.current,
                desc: p.desc.slice(0, 160), detail: p.descFull, search: `${p.name} ${p.title} ${p.desc}` })),
        });
        const p = key ? data.list.find(x => x.avatar === key) : null;
        return p ? { avatar: p.avatar, name: p.name } : null;
    }
    async function pickHow(persona, prevHow) {
        return await pickFromList({
            title: `"${persona.name}" — 어떻게 바꿀지`, filter: false, large: false,
            items: Object.keys(HOW).map(k => ({ key: k, label: HOW[k].label, sub: HOW[k].sub, icon: k === 'simple' ? 'fa-right-left' : (k === 'default' ? 'fa-star' : 'fa-lock'), current: prevHow === k })),
        });
    }
    async function pickCharacter(prev) {
        const data = listCharacters();
        if (!data) { fail('봇 목록을 읽지 못했습니다.'); return null; }
        const groups = [
            { title: '봇', items: data.chars.map(c => ({ key: `c|${c.avatar}`, label: c.name || '(이름 없음)', img: c.img, badge: c.fav ? '★' : '', current: c.avatar === data.current,
                desc: c.desc.slice(0, 160), detail: c.descFull + (c.creator ? `\n\n[제작자 메모]\n${c.creator}` : ''), search: `${c.name} ${c.desc} ${c.creator}` })) },
            { title: '그룹', items: data.groups.map(g => ({ key: `g|${g.group}`, label: g.name || '(이름 없음)', icon: 'fa-users', current: g.group === data.currentGroup, detail: '(그룹 채팅)' })) },
        ];
        const key = await pickFromList({
            title: '봇 고르기', hint: '줄을 누르면 아래에 카드 본문 전체 · 본문으로도 검색됩니다', groups,
            detail: true, confirmLabel: '이 봇으로 선택', detailPlaceholder: '봇을 누르면 카드 본문 전체가 여기에 보입니다. 박스 안에서 스크롤해 끝까지 볼 수 있습니다.',
        });
        if (!key) return null;
        if (key.startsWith('g|')) { const g = data.groups.find(x => `g|${x.group}` === key); return g ? { group: g.group, name: g.name } : null; }
        const c = data.chars.find(x => `c|${x.avatar}` === key);
        return c ? { avatar: c.avatar, name: c.name } : null;
    }
    async function pickQrMode(prev) {
        const cur = prev?.label ? 'single' : (prev?.set ? 'set' : null);
        return await pickFromList({
            title: 'QR(빠른 답장) — 버튼을 누르면', filter: false, large: false,
            items: [
                { key: 'set', label: '세트 팝업', sub: '버튼 위에 그 세트의 QR 목록이 떠서 하나를 골라 실행합니다', icon: 'fa-list', current: cur === 'set' },
                { key: 'single', label: '단일 QR 바로 실행', sub: '고른 QR 하나를 바로 실행합니다 (바에서 숨긴 QR 도 가능)', icon: 'fa-bolt', current: cur === 'single' },
            ],
        });
    }
    // 세트 고르기. withQrs=true(단일 QR 모드)면 QR 이름·제목으로도 검색돼 "세트 / ㄴ QR" 로 보여주고, QR 줄을 바로 고를 수 있다 → {set} 또는 {set, label}
    async function pickQrSet(prevSet, withQrs = false) {
        const sets = listQrSets();
        if (!sets) { fail('빠른 답장(QR) 확장을 찾지 못했습니다. QR 확장이 켜져 있어야 합니다.'); return null; }
        const api = qrApi();
        const byKey = new Map();
        const items = sets.map((s, i) => {
            const key = `set|${i}`; byKey.set(key, { set: s.name });
            const it = { key, label: s.name, sub: `QR ${s.count}개`, badge: s.inBar ? 'QR 바' : '', icon: 'fa-reply', current: s.name === prevSet, search: s.name };
            if (withQrs) {
                let list = []; try { list = api.getSetByName(s.name)?.qrList || []; } catch (e) { list = []; }
                it.children = list.filter(q => q && q.label).map((q, j) => { const k = `qr|${i}|${j}`; byKey.set(k, { set: s.name, label: q.label }); return { key: k, label: q.label, sub: normText(q.title), icon: q.icon ? String(q.icon) : 'fa-reply', badge: q.isHidden ? '숨김' : '', search: `${q.label} ${q.title || ''}` }; });
            }
            return it;
        });
        const key = await pickFromList({ title: 'QR 세트 고르기', hint: withQrs ? '세트 이름이나 QR 이름으로 검색 — QR 이 걸리면 세트 아래에 ㄴ 로 보입니다' : '', items });
        return key ? (byKey.get(key) || null) : null;
    }
    // 세트 안 QR 고르기 (← 로 세트 목록 복귀 = BACK). 검색은 이름·제목만
    async function pickQr(setName, prevLabel) {
        const api = qrApi();
        let set = null;
        try { set = api && api.getSetByName(setName); } catch (e) { set = null; }
        const list = Array.isArray(set?.qrList) ? set.qrList.filter(q => q && q.label) : [];
        if (!list.length) { fail(`QR 세트 "${setName}" 에 QR 이 없습니다.`); return BACK; }
        return await pickFromList({
            title: `"${setName}" — QR 고르기`, hint: '숨김 = QR 바에는 안 보이는 QR', backButton: true,
            items: list.map(q => ({ key: q.label, label: q.label, sub: normText(q.title), icon: q.icon ? String(q.icon) : 'fa-reply', badge: q.isHidden ? '숨김' : '', current: q.label === prevLabel, search: `${q.label} ${q.title || ''}` })),
        });
    }
    // 진입 화면 고르기: 기본은 "그 확장의 항목"만. 전체 목록은 유저가 "다른 자리에서 직접 고르기…"를 눌렀을 때만 자리별로 보여준다
    async function pickEntry(ext, strong, likely, all) {
        const byKey = new Map(all.map(e => [e.key, e]));
        const toItem = (e) => ({ key: e.key, label: e.label, sub: ZONES[e.zone].label, icon: e.icon || ZONES[e.zone].icon, badge: e.hiddenNow ? '지금 안 보임' : '' });
        const groups = [];
        if (strong.length) groups.push({ title: '이 확장의 항목', items: strong.map(toItem) });
        if (likely.length) groups.push({ title: '이름이 비슷한 항목 (이 확장 것이 아닐 수 있음)', items: likely.map(toItem), collapsed: strong.length > 0 });
        groups.push({ title: '', items: [{ key: '__all__', label: '다른 자리에서 직접 고르기…', sub: '확장 목록·마법봉·옵션·입력창·상단바 전체', icon: 'fa-list', ghost: true }] });
        const key = await pickFromList({
            title: `"${ext.display}" — 버튼이 열 화면`, groups, filter: strong.length + likely.length > 6,
            hint: (strong.length || likely.length) ? '' : '이 확장의 진입 버튼을 자동으로 찾지 못했습니다.',
        });
        if (!key) return null;
        if (key === '__all__') return await pickEntryFromAll(ext, all, byKey, toItem);
        return byKey.get(key) || null;
    }
    async function pickEntryFromAll(ext, all, byKey, toItem) {
        const groups = Object.keys(ZONES).map(z => ({ title: ZONES[z].label, items: all.filter(e => e.zone === z).map(toItem) }));
        const key = await pickFromList({ title: `"${ext.display}" — 다른 자리에서 고르기`, hint: '이 확장 것이 맞는지 확인하고 고르십시오', groups, emptyText: '화면에서 진입 버튼을 찾지 못했습니다.' });
        return key ? byKey.get(key) || null : null;
    }
    async function configureExt(prev, opts = {}) {
        const exts = await listEnabledExtensions();
        if (!exts) return null;
        const groups = [
            { title: '설치한 확장', items: exts.filter(e => e.type !== 'system').map(e => ({ key: e.name, label: e.display, sub: e.folder !== e.display ? e.folder : '', badge: e.type === 'global' ? '전역' : '', icon: 'fa-puzzle-piece', current: e.name === prev?.ext?.name })) },
            { title: '실리 기본 확장', items: exts.filter(e => e.type === 'system').map(e => ({ key: e.name, label: e.display, sub: e.folder, icon: 'fa-cube', current: e.name === prev?.ext?.name })) },
        ];
        const extName = await pickFromList({ title: '연결할 확장 고르기', hint: '지금 켜져 있는 확장만 보입니다', groups });
        if (!extName) return null;
        const ext = exts.find(e => e.name === extName);
        const all = scanAllZones();
        const { strong, likely } = classifyEntries(ext, all);
        let entry = null;
        if (strong.length === 1 && likely.length === 0 && !opts.forcePick) entry = strong[0];     // 후보가 하나뿐이면 바로 연결 ([바꾸기]로 언제든 변경)
        else entry = await pickEntry(ext, strong, likely, all);
        if (!entry) return null;
        return { ext: { name: ext.name, display: ext.display, type: ext.type }, entry: { zone: entry.zone, id: entry.id, label: entry.label, icon: entry.icon || '' } };
    }
    async function pickTarget(menuKey, prev, opts) {
        switch (menuKey) {
            case 'preset': return await pickPreset(prev);
            case 'api': return await pickProfile(prev);
            case 'wi': return await pickWorld(prev);
            case 'user': return await pickTheme(prev);
            case 'ext': return await configureExt(prev, opts);
            case 'persona': {
                const p = await pickPersona(prev); if (!p) return null;
                const how = await pickHow(p, prev?.how); if (!how) return null;
                return { avatar: p.avatar, name: p.name, how };
            }
            case 'char': return await pickCharacter(prev);
        }
        return null;
    }
    // 슬롯 설정 흐름의 진입점. 새 link 를 돌려주고, 취소하면 null
    async function configure(action, link, opts = {}) {
        try {
            if (action === 'qr_set') {
                const mode = await pickQrMode(link); if (!mode) return null;
                if (mode === 'set') { const r = await pickQrSet(link?.set, false); return r ? { set: r.set } : null; }
                let prevSet = link?.set || null;
                for (;;) {                                                      // 세트 → QR, ← 를 누르면 세트 목록으로
                    const r = await pickQrSet(prevSet, true); if (!r) return null;
                    if (r.label) return { set: r.set, label: r.label };           // 검색 결과의 "ㄴ QR" 줄을 바로 고른 경우
                    const label = await pickQr(r.set, link?.set === r.set ? link?.label : null);
                    if (label === BACK) { prevSet = r.set; continue; }
                    if (!label) return null;
                    return { set: r.set, label };
                }
            }
            if (action !== 'st_menu') return null;
            link = normalizeLink(link);
            const key = link?.menu;
            const menu = MENUS[key];
            if (!menu) { fail('알 수 없는 실리 메뉴입니다.'); return null; }
            if (!menu.action) return { menu: key, mode: 'open' };
            if (!menu.selectOnly) {
                const mode = await pickMode(menu, link);
                if (!mode) return null;
                if (mode === 'open') return { menu: key, mode: 'open' };
            }
            const target = await pickTarget(key, link?.target || null, opts);
            if (!target) return null;
            return { menu: key, mode: 'select', target };
        } catch (e) {
            console.error('깡갤 복사기: 바로가기 설정 실패', e);
            fail('바로가기 설정 중 오류가 났습니다.');
            return null;
        }
    }
    // 토스트의 "다시 고르기" 등에서: 설정 패널의 그 슬롯을 다시 고르게 하고 저장
    async function reconfigureSlot(index) {
        const $slot = $(`#copybot_custom_slots .copybot_custom_slot[data-slot="${index}"]`);
        if (!$slot.length) return fail('설정 패널의 커스텀 버튼 칸을 찾지 못했습니다.');
        const raw = $slot.find('.copybot_custom_action').val() || '';
        const action = normalizeAction(raw);
        if (action !== 'st_menu' && action !== 'qr_set') return false;
        const link = normalizeLink($slot.data('link')) || (action === 'st_menu' ? { menu: raw.split(':')[1] } : {});
        const next = await configure(action, link, { forcePick: true });
        if (next && window.CopyBotUI?.commitSlotLink) { window.CopyBotUI.commitSlotLink($slot, next); return true; }
        return false;
    }

    // ----------------------------------------------------------------
    // 실행
    // ----------------------------------------------------------------
    function drawerParts(menu) {
        const d = document.getElementById(menu.buttonId);
        return { toggle: d ? d.querySelector('.drawer-toggle') : null, content: d ? d.querySelector('.drawer-content') : null };
    }
    function openDrawer(menu) {
        const { toggle } = drawerParts(menu);
        if (!toggle) return fail(`실리 "${menu.label}" 메뉴 버튼을 찾지 못했습니다.`);
        $(toggle).trigger('click');      // 실리 기본 상단바 토글 (열려 있으면 닫힘)
        return true;
    }
    async function ensureDrawerOpen(menu) {
        const { toggle, content } = drawerParts(menu);
        if (!toggle) return fail(`실리 "${menu.label}" 메뉴 버튼을 찾지 못했습니다.`);
        if (content && $(content).is(':visible')) return true;
        $(toggle).trigger('click');
        if (content) { await waitFor(() => $(content).is(':visible'), 1500); await wait(120); }   // 실리의 열림 애니메이션이 끝날 때까지
        else await wait(350);
        return true;
    }
    async function runPreset(t, env) {
        if (!t?.name) return fail('프리셋이 설정되지 않았습니다.');
        const data = listPresets();
        if (!data) return fail('프리셋 목록을 읽지 못했습니다.');
        if (!data.names.includes(t.name)) {
            if (t.api && t.api !== data.api) return notFound(`프리셋 "${t.name}" 은(는) ${t.api} 용인데 지금 API 는 ${data.api} 입니다.`, env);
            return notFound(`프리셋 "${t.name}" 을(를) 찾지 못했습니다. 이름이 바뀌었거나 삭제됐습니다.`, env);
        }
        if (data.current === t.name) { toastr.info(`이미 "${t.name}" 프리셋입니다.`, '', { timeOut: 1500 }); return true; }
        const r = await cmd(`/preset ${quoteArg(t.name)}`);
        if (!r || r.isError) return false;
        toastr.success(`프리셋: ${t.name}`, '', { timeOut: 1500 });
        return true;
    }
    async function runProfile(t, env) {
        if (!t?.id) return fail('프로필이 설정되지 않았습니다.');
        const data = listProfiles();
        if (!data) return fail('연결 프로필 기능을 찾지 못했습니다.');
        const p = data.list.find(x => x.id === t.id);
        if (!p) return notFound(`프로필 "${t.name || ''}" 을(를) 찾지 못했습니다. 삭제됐을 수 있습니다.`, env);
        if (data.current === p.id) { toastr.info(`이미 "${p.name}" 프로필입니다.`, '', { timeOut: 1500 }); return true; }
        if (isGenerating()) return fail('응답 생성 중에는 프로필을 바꿀 수 없습니다. 끝난 뒤 다시 눌러 주십시오.');
        const r = await cmd(`/profile ${quoteArg(p.name)}`);
        if (!r || r.isError) return false;
        // 실리 /profile 은 이름으로만 찾는다(같은 이름이 둘이면 앞의 것, 없으면 비슷한 이름, 빈 이름이면 아무것도 안 함) → 정말 고른 그 프로필(id)이 됐는지 확인
        if (ctx()?.extensionSettings?.connectionManager?.selectedProfile !== p.id) {
            return fail(`프로필 "${p.name}" 을(를) 정확히 고르지 못했습니다. 이름이 같은 프로필이 여럿이거나 이름이 비어 있으면 실리 명령이 구분하지 못합니다.`);
        }
        toastr.success(`프로필: ${p.name}`, '', { timeOut: 1500 });
        return true;
    }
    async function runWorld(t, env) {
        if (!t?.name) return fail('월드 인포 책이 설정되지 않았습니다.');
        const data = listWorlds();
        if (!data) return fail('월드 인포 목록을 읽지 못했습니다.');
        const w = data.list.find(x => x.name === t.name);
        if (!w) return notFound(`월드 인포 책 "${t.name}" 을(를) 찾지 못했습니다. 이름이 바뀌었거나 삭제됐습니다.`, env);
        if (!(await ensureDrawerOpen(MENUS.wi))) return false;
        const sel = document.getElementById('world_editor_select');
        if (!sel) return fail('월드 인포 편집창 선택칸을 찾지 못했습니다.');
        if (sel.value !== w.value) {
            sel.value = w.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));      // 실리 자체 선택칸을 바꾼 것 = 유저가 드롭다운에서 고른 것
        }
        return true;
    }
    async function runTheme(t, env) {
        if (!t?.name) return fail('테마가 설정되지 않았습니다.');
        const data = listThemes();
        if (!data) return fail('테마 목록을 읽지 못했습니다.');
        if (!data.list.includes(t.name)) return notFound(`테마 "${t.name}" 을(를) 찾지 못했습니다. 이름이 바뀌었거나 삭제됐습니다.`, env);
        if (data.current === t.name) { toastr.info(`이미 "${t.name}" 테마입니다.`, '', { timeOut: 1500 }); return true; }
        // 실리의 /theme 명령은 비슷한 이름을 퍼지 검색해 엉뚱한 테마로 갈 수 있다 → 실리 자체 테마 드롭다운을 "정확히 그 이름"으로 바꾼다
        // (= 유저가 사용자 설정에서 고른 것과 동일: 실리가 applyTheme + 저장을 수행)
        const sel = document.getElementById('themes');
        if (!sel) return fail('테마 선택칸을 찾지 못했습니다.');
        sel.value = t.name;
        if (sel.value !== t.name) return fail(`테마 "${t.name}" 을(를) 고르지 못했습니다.`);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        toastr.success(`테마: ${t.name}`, '', { timeOut: 1500 });
        return true;
    }
    async function runCharacter(t, env) {
        const c = ctx();
        if (!c) return false;
        if (isGenerating()) return fail('응답 생성 중에는 봇을 바꿀 수 없습니다. 끝난 뒤 다시 눌러 주십시오.');
        if (t?.group) {
            const g = findGroup(t.group);
            if (!g) return notFound(`그룹 "${t.name || ''}" 을(를) 찾지 못했습니다.`, env);
            if (c.groupId === g.id) { toastr.info(`이미 "${g.name}" 그룹 채팅입니다.`, '', { timeOut: 1500 }); return true; }
            if (typeof c.openGroupChat !== 'function') return fail('그룹 채팅 열기 API 를 찾지 못했습니다.');
            await flushChatMetadata();      // 떠나기 전에 지금 채팅의 지연 저장분(잠금 등)을 먼저 저장
            await c.openGroupChat(g.id);
            return true;
        }
        if (!t?.avatar) return fail('봇이 설정되지 않았습니다.');
        const ch = findCharacter(t.avatar);
        if (!ch) return notFound(`봇 "${t.name || ''}" 을(를) 찾지 못했습니다. 삭제됐을 수 있습니다.`, env);
        const cur = (c.characterId !== undefined && c.characters[c.characterId]) ? c.characters[c.characterId].avatar : null;
        if (cur === ch.avatar && !c.groupId) { toastr.info(`이미 "${ch.name}" 과의 채팅입니다.`, '', { timeOut: 1500 }); return true; }
        const index = c.characters.findIndex(x => x && x.avatar === ch.avatar);
        if (index < 0) return notFound(`봇 "${t.name || ''}" 을(를) 찾지 못했습니다.`, env);
        await flushChatMetadata();          // 떠나기 전에 지금 채팅의 지연 저장분(잠금 등)을 먼저 저장
        // 봇 목록에서 카드를 눌렀을 때 실리가 부르는 바로 그 함수(selectCharacterById) → 채팅까지 그대로 바뀜 (/go 는 카드만 바뀌고 채팅이 안 따라오는 경우가 있었음)
        if (typeof c.selectCharacterById === 'function') await c.selectCharacterById(index);
        else { const r = await cmd(`/go ${quoteArg(ch.avatar)}`); if (!r || r.isError) return false; }
        const after = ctx()?.characters?.[ctx()?.characterId]?.avatar || null;
        if (after !== ch.avatar) return fail(`"${ch.name}" 으로 바꾸지 못했습니다. 채팅 저장 중이거나 응답 생성 중일 수 있습니다.`);
        return true;
    }
    async function runPersona(t, env) {
        if (!t?.avatar) return fail('페르소나가 설정되지 않았습니다.');
        const name = personaName(t.avatar);
        if (name === null) return notFound(`페르소나 "${t.name || ''}" 을(를) 찾지 못했습니다. 삭제됐을 수 있습니다.`, env);
        if (isGenerating()) return fail('응답 생성 중에는 페르소나를 바꿀 수 없습니다. 끝난 뒤 다시 눌러 주십시오.');
        const how = HOW[t.how] ? t.how : 'simple';
        const lockedTo = ctx()?.chatMetadata?.persona || null;
        let r = await cmd(`/persona mode=lookup ${quoteArg(t.avatar)}`);     // 아바타 파일명으로 정확히 그 페르소나
        if (!r || r.isError) return false;
        if (how === 'simple' && lockedTo && lockedTo !== t.avatar) {
            toastr.info('이 채팅엔 다른 페르소나가 고정돼 있어, 채팅을 다시 열면 그쪽으로 돌아갑니다. 계속 쓰려면 "이 채팅에 고정"으로 만드십시오.', '', { timeOut: 5000 });
        }
        if (how !== 'simple') {
            // 이미 그렇게 고정돼 있으면 명령을 다시 보내지 않는다 — 실리의 '기본' 지정은 토글이라 또 누르면 풀리고, 봇 고정은 중복 연결이 생길 수 있음
            if (isPersonaLockedAs(how, t.avatar)) {
                toastr.info(`페르소나: ${name} — 이미 ${HOW[how].label} 상태입니다.`, '', { timeOut: 1500 });
                return true;
            }
            r = await cmd(`/persona-lock type=${how} on`);
            if (!r || r.isError) { toastr.warning(`페르소나는 바꿨지만 고정(${HOW[how].label})은 실패했습니다.`); return false; }
            // 실리는 채팅 잠금을 지연 저장하므로 바로 다음에 봇을 바꾸면 잠금이 저장되기 전에 넘어갈 수 있음 → 실리 공식 API 로 지금 저장
            if (how === 'chat') await flushChatMetadata();
        }
        toastr.success(`페르소나: ${name}${how !== 'simple' ? ` (${HOW[how].label})` : ''}`, '', { timeOut: 1500 });
        return true;
    }
    async function runExtEntry(t, env) {
        const entry = t?.entry;
        if (!entry || !entry.zone) return fail('연결할 확장 화면이 설정되지 않았습니다.');
        const found = resolveEntry(entry);
        if (!found) return notFound(`"${entry.label}" 항목을 찾지 못했습니다. 확장이 꺼져 있거나 화면이 바뀌었을 수 있습니다.`, env);
        if (found.zone === 'drawer') {
            const d = found.drawer;
            const content = d.querySelector(':scope > .inline-drawer-content');
            const head = d.querySelector(':scope > .inline-drawer-toggle, :scope > .inline-drawer-header');
            const { content: block } = drawerParts(MENUS.ext);
            const blockOpen = block && $(block).is(':visible');
            if (blockOpen && content && $(content).is(':visible')) { openDrawer(MENUS.ext); return true; }   // 이미 보이면 닫기 (복사기 열기와 같은 겉동작)
            if (!(await ensureDrawerOpen(MENUS.ext))) return false;
            if (content && !$(content).is(':visible') && head) { $(head).trigger('click'); await waitFor(() => $(content).is(':visible'), 1000); await wait(120); }
            const scroller = document.getElementById('rm_extensions_block') || d.closest('.drawer-content');
            if (scroller) { const delta = d.getBoundingClientRect().top - scroller.getBoundingClientRect().top; scroller.scrollTop += delta - 8; }
            return true;
        }
        try {
            // 유저가 그 버튼을 탭한 것과 동일. 그 확장 코드는 우리가 직접 부르지 않는다
            if (found.zone === 'wand' || found.zone === 'options') await tapMenuItem(found);
            else tapElement(found.el);
        } catch (e) { console.error('깡갤 복사기: 확장 버튼 누르기 실패', e); return fail(`"${entry.label}" 을(를) 누르지 못했습니다.`); }
        return true;
    }

    // --- QR 세트 팝업 (버튼 위에 그 세트의 QR 목록, 하나 고르면 실행) ---
    let qrPopupEl = null, qrOutsideHandler = null, qrKeyHandler = null;
    const runningQr = new Set();      // 지금 실행 중인 단일 QR ("세트\n이름")
    function hideQrPopup() {
        if (qrPopupEl) { qrPopupEl.remove(); qrPopupEl = null; }      // 닫으면 화면(DOM)에 아무것도 남기지 않는다
        if (qrOutsideHandler) { document.removeEventListener('pointerdown', qrOutsideHandler, true); qrOutsideHandler = null; }
        if (qrKeyHandler) { document.removeEventListener('keydown', qrKeyHandler, true); qrKeyHandler = null; }
    }
    function positionNear(node, anchor) {
        const vw = window.innerWidth, vh = window.innerHeight;
        node.style.visibility = 'hidden'; node.style.display = 'block';
        node.style.maxHeight = `${Math.max(120, Math.min(vh - 16, Math.floor(vh * 0.6)))}px`;   // 긴 세트는 팝업 안에서 스크롤, 버튼 위에 자리하도록 60vh 까지만
        const mw = node.offsetWidth || 240, mh = node.offsetHeight || 200;
        let top, left;
        if (anchor && typeof anchor.getBoundingClientRect === 'function' && anchor.isConnected) {
            const r = anchor.getBoundingClientRect();
            top = r.top - mh - 8;
            if (top < 8) top = Math.min(r.bottom + 8, vh - mh - 8);
            left = r.left + r.width / 2 - mw / 2;
        } else { top = vh - mh - 72; left = vw / 2 - mw / 2; }
        left = Math.max(8, Math.min(left, vw - mw - 8));
        top = Math.max(8, Math.min(top, vh - mh - 8));
        node.style.top = `${top}px`; node.style.left = `${left}px`; node.style.right = 'auto'; node.style.bottom = 'auto';
        node.style.visibility = '';
    }
    async function executeQr(setName, qr) {
        const api = qrApi();
        if (!api) return fail('빠른 답장(QR) 확장을 찾지 못했습니다.');
        try { await api.executeQuickReply(setName, qr.label); return true; }
        catch (e) { console.error('깡갤 복사기: QR 실행 실패', e); return fail(`QR 실행 실패: ${qr.label}`); }
    }
    function showQrPopup(set, items, anchor) {
        hideQrPopup();
        if (!qrPopupEl) { qrPopupEl = el('div'); qrPopupEl.id = 'copybot_qr_popup'; document.body.appendChild(qrPopupEl); }
        qrPopupEl.replaceChildren();
        const title = el('div', 'copybot_qr_title');
        const name = el('span'); name.textContent = set.name; title.appendChild(name);
        const close = el('div', 'copybot_qr_close fa-solid fa-xmark'); close.title = '닫기'; close.setAttribute('role', 'button');
        close.addEventListener('click', (e) => { e.stopPropagation(); hideQrPopup(); });
        title.appendChild(close);
        qrPopupEl.appendChild(title);
        const list = el('div', 'copybot_qr_list');
        for (const qr of items) {
            const btn = el('button', 'copybot_qr_item'); btn.type = 'button';
            btn.title = normText(qr.title) || qr.label;
            if (qr.icon) { const i = el('i', `fa-solid ${qr.icon}`); btn.appendChild(i); }
            const span = el('span'); span.textContent = qr.label; btn.appendChild(span);
            btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); hideQrPopup(); executeQr(set.name, qr); });
            list.appendChild(btn);
        }
        qrPopupEl.appendChild(list);
        positionNear(qrPopupEl, anchor);
        qrOutsideHandler = (e) => { if (!qrPopupEl || !qrPopupEl.contains(e.target)) hideQrPopup(); };
        document.addEventListener('pointerdown', qrOutsideHandler, true);
        qrKeyHandler = (e) => { if (e.key === 'Escape') { e.stopPropagation(); hideQrPopup(); } };
        document.addEventListener('keydown', qrKeyHandler, true);
    }
    async function runQrSet(link, env) {
        const api = qrApi();
        if (!api) return fail('빠른 답장(QR) 확장을 찾지 못했습니다. QR 확장이 켜져 있어야 합니다.');
        if (!link?.set) return fail('QR 세트가 설정되지 않았습니다.');
        let set = null;
        try { set = api.getSetByName(link.set); } catch (e) { set = null; }
        if (!set) return notFound(`QR 세트 "${link.set}" 을(를) 찾지 못했습니다. 이름이 바뀌었거나 삭제됐습니다.`, env);
        if (link.label) {                                                     // 단일 QR: 팝업 없이 바로 실행
            const qr = (Array.isArray(set.qrList) ? set.qrList : []).find(q => q && q.label === link.label);
            if (!qr) return notFound(`QR 세트 "${link.set}" 에 "${link.label}" 이(가) 없습니다. 이름이 바뀌었거나 삭제됐습니다.`, env);
            // 끝날 때까지 기다리지 않는다 — 오래 도는 QR(응답 생성 등)이 끝날 때까지 다른 바로가기 버튼이 전부 조용히 먹통이 되던 것 방지.
            // 같은 QR 을 연달아 눌러 두 번 도는 것만 막는다.
            const key = `${set.name}\n${qr.label}`;
            if (runningQr.has(key)) { toastr.info('그 QR 은 아직 실행 중입니다.', '', { timeOut: 1500 }); return false; }
            runningQr.add(key);
            executeQr(set.name, qr).finally(() => runningQr.delete(key));
            return true;
        }
        const items = (Array.isArray(set.qrList) ? set.qrList : []).filter(q => q && !q.isHidden && q.label);
        if (!items.length) return fail(`QR 세트 "${link.set}" 에 보이는 QR 이 없습니다.`);
        showQrPopup(set, items, env?.anchor);
        return true;
    }

    let busy = false;
    async function run(action, env) {
        const link = normalizeLink(env?.slot?.link);
        if (!link) return fail('이 버튼의 바로가기 설정을 찾지 못했습니다. 설정에서 다시 골라 주십시오.');
        if (busy) return false;
        busy = true;
        try {
            if (action === 'qr_set') return await runQrSet(link, env);
            if (action !== 'st_menu') return false;
            const menu = MENUS[link.menu];
            if (!menu) return fail('실리 메뉴가 설정되지 않았습니다.');
            if (link.mode !== 'select') return openDrawer(menu);
            const t = link.target || {};
            switch (link.menu) {
                case 'preset': return await runPreset(t, env);
                case 'api': return await runProfile(t, env);
                case 'wi': return await runWorld(t, env);
                case 'user': return await runTheme(t, env);
                case 'ext': return await runExtEntry(t, env);
                case 'persona': return await runPersona(t, env);
                case 'char': return await runCharacter(t, env);
            }
            return fail('이 메뉴에는 동작이 없습니다.');
        } catch (e) {
            console.error('깡갤 복사기: 바로가기 실행 실패', e);
            return fail('바로가기 실행 중 오류가 났습니다.');
        } finally {
            busy = false;
        }
    }

    window.CopyBotShortcut = {
        MENUS, ZONES, HOW,
        describe, menuOptionsHtml, canReconfigure, normalizeAction, normalizeLink,
        configure, reconfigureSlot,
        run, hideQrPopup,
        setDebugMode: (v) => { isDebugMode = !!v; },
        // 테스트 노출용 (읽기 전용 스캔)
        _scanAllZones: scanAllZones, _matchLevel: matchLevel, _classifyEntries: classifyEntries, _baseKey: baseKey, _resolveEntry: resolveEntry, _listEnabledExtensions: listEnabledExtensions, _quoteArg: quoteArg,
        _tapMenuItem: tapMenuItem,
    };

    if (window.copybot_debug_mode) {
        console.log('깡갤 복사기: shortcut.js 모듈 로드 완료');
    }
})();
