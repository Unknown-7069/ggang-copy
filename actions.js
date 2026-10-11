// ===================================================================
// 깡갤 복사기 확장프로그램 - actions.js 모듈
// ===================================================================
// 커스텀 버튼 / 퀵메뉴 / 플로팅 메뉴 / 입력필드 아이콘이 공유하는 "동작 레지스트리"
//
// === 🎯 모듈 역할 ===
// • 모든 접근 경로(소메뉴·입력필드·퀵메뉴·플로팅)에서 같은 실 기능을 호출하도록 단일 창구 제공
// • 커스텀 버튼 슬롯에 넣을 수 있는 동작 목록(label, 기본 아이콘, 실행 함수) 정의
//
// === 🔗 의존성 ===
// • 실행 시점에 commands.js, generation.js, messageOperations.js 사용 (로드 순서 무관)
// ===================================================================

(function() {
    'use strict';

    function ctx() {
        return window.SillyTavern?.getContext?.() || null;
    }

    function lastIndex() {
        return window.CopyBotUtils ? window.CopyBotUtils.getLastMessageIndex() : 0;
    }

    // 동작 정의 (id 는 설정에 저장되므로 변경 금지)
    const ACTIONS = [
        // 바로가기 2종 (shortcut.js): 드롭다운에는 ui.js 가 "실리 메뉴" 묶음·QR 항목으로 따로 넣으므로 hidden. 슬롯의 link 가 대상을 담는다
        {
            id: 'st_menu', label: '실리 메뉴', icon: 'fa-bars', hidden: true,
            desc: '실리 상단 메뉴 열기, 또는 프리셋·프로필·월드 인포·페르소나·봇 바로 바꾸기·확장 연결',
            run: (env) => window.CopyBotShortcut ? window.CopyBotShortcut.run('st_menu', env) : (toastr.warning('바로가기 모듈을 불러오지 못했습니다.'), false),
        },
        {
            id: 'qr_set', label: 'QR(빠른 답장)', icon: 'fa-reply', hidden: true,
            desc: '고른 QR 세트를 버튼 위 팝업으로 열어 하나를 골라 실행, 또는 고른 QR 하나를 바로 실행',
            run: (env) => window.CopyBotShortcut ? window.CopyBotShortcut.run('qr_set', env) : (toastr.warning('바로가기 모듈을 불러오지 못했습니다.'), false),
        },
        {
            id: 'send_no_reply', label: '응답 없이 보내기', icon: 'fa-paper-plane',
            desc: '입력창 내용을 유저 메시지로만 추가하고 AI 응답은 요청하지 않음 (/send)',
            run: () => window.CopyBotGeneration?.sendWithoutReply(),
        },
        {
            id: 'delete_last_user', label: '마지막 유저 메시지 삭제', icon: 'fa-user-minus',
            desc: '가장 최근의 내 메시지 1개 삭제',
            run: () => window.CopyBotGeneration?.deleteLastUserMessage(),
        },
        {
            id: 'open_copier', label: '복사기 열기', icon: 'fa-clipboard-list',
            desc: '확장 패널을 열고 깡갤 복사기 설정 화면으로 바로 이동 (이미 열려 있으면 닫음)',
            run: async () => {
                const wait = (ms) => new Promise(r => setTimeout(r, ms));
                const $block = $('#rm_extensions_block');
                const $toggle = $('#extensions-settings-button .drawer-toggle');
                if (!$toggle.length) { toastr.warning('확장 패널 버튼을 찾지 못했습니다.'); return false; }
                const copierOpen = $('#copybot_settings .inline-drawer-content').is(':visible');
                if ($block.is(':visible') && copierOpen) { $toggle.trigger('click'); return true; }   // 이미 보이면 닫기 (토글)
                if (!$block.is(':visible')) { $toggle.trigger('click'); await wait(350); }
                if (!$('#copybot_settings .inline-drawer-content').is(':visible')) { $('#copybot_settings .inline-drawer-toggle').trigger('click'); await wait(300); }
                // 확장 패널 스크롤 컨테이너 안에서 복사기 위치로 (scrollIntoView 는 문서를 밀어 상단바가 사라지는 사고가 있어 금지)
                const target = document.getElementById('copybot_settings');
                const scroller = document.getElementById('rm_extensions_block') || (target && target.closest('.drawer-content'));
                if (target && scroller) {
                    const delta = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
                    scroller.scrollTop += delta - 8;
                }
                return true;
            },
        },
        // 아래 셋은 편의기능 3종으로 이미 지원 → 커스텀 버튼 목록에는 숨김 (내부 호출용으로만 유지)
        {
            id: 'delete_last', label: '마지막 메시지 삭제', icon: 'fa-trash', hidden: true,
            desc: '가장 마지막 메시지 1개 삭제 (봇/유저 무관)',
            run: () => window.CopyBotGeneration?.deleteLastMessage(),
        },
        {
            id: 'delete_regen', label: '삭제 후 재생성', icon: 'fa-redo', hidden: true,
            desc: '마지막 메시지를 지우고 다시 생성 (편의기능-재생성 옵션 적용)',
            run: () => window.CopyBotGeneration?.deleteAndRegenerate(),
        },
        {
            id: 'jump_last_top', label: '마지막 메시지 최상단으로', icon: 'fa-arrow-down-short-wide',
            desc: '마지막 메시지의 첫 줄이 화면 맨 위에 오도록 이동',
            run: () => window.CopyBotCommands?.jumpToMessage('last', '마지막 메시지로 이동했습니다.'),
        },
        {
            id: 'jump_first', label: '첫 메시지로', icon: 'fa-angles-up',
            desc: '채팅 맨 처음으로 이동 (긴 채팅은 로딩 시간 소요)',
            // 확인창은 필수(2026-10-11 유저 확정). 여기 한 곳에만 둔다 → 설정 패널·퀵메뉴·플로팅·커스텀 버튼 어느 창구로 눌러도 똑같이 묻는다
            run: () => {
                if (!confirm('첫 메시지로 이동합니다.\n\n채팅이 많을 경우 렉이 발생할 수 있습니다.\n정말 이동하시겠습니까?')) {
                    toastr.info('이동이 취소되었습니다.');
                    return false;
                }
                return window.CopyBotCommands?.jumpToMessage(0, '첫 메시지로 이동했습니다.');
            },
        },
        {
            id: 'jump_bottom', label: '맨 아래로', icon: 'fa-angles-down',
            desc: '채팅 맨 아래(가장 최근 글 끝)로 스크롤',
            run: () => {
                // 커스텀 테마는 스크롤 컨테이너가 #chat 이 아닐 수 있다 → #chat 과 그 조상 중 실제로 스크롤되는(overflow-y auto/scroll) 첫 요소를 내린다
                const chat = document.querySelector('#chat');
                if (!chat) return;
                let scroller = null;
                for (let el = chat; el && el.nodeType === 1 && el !== document.body && el !== document.documentElement; el = el.parentElement) {   // 문서(body/html)는 건드리지 않음
                    const overflowY = getComputedStyle(el).overflowY;
                    if (overflowY === 'auto' || overflowY === 'scroll') { scroller = el; break; }
                }
                (scroller || chat).scrollTop = (scroller || chat).scrollHeight;
            },
        },
        {
            id: 'remove_tags', label: '입력창 태그 제거', icon: 'fa-tags', hidden: true,
            desc: '입력창에 쓴 글에서 HTML 태그·상태창 등 제거',
            run: () => window.CopyBotCommands?.removeTagsFromElement('#send_textarea'),
        },
        {
            id: 'clear_input', label: '입력창 비우기', icon: 'fa-eraser',
            desc: '채팅 입력창 내용을 모두 지움',
            run: () => {
                const $input = $('#send_textarea');
                if (!String($input.val() || '').trim()) { toastr.info('입력창이 이미 비어 있습니다.'); return; }
                $input.val('');
                $input[0]?.dispatchEvent(new Event('input', { bubbles: true }));
            },
        },
        {
            id: 'stop_generation', label: '생성 중단', icon: 'fa-stop',
            desc: '진행 중인 응답 생성을 즉시 중단',
            run: () => {
                const context = ctx();
                if (window.CopyBotGeneration?.isPipelineRunning()) { window.CopyBotGeneration.abort('버튼'); return; }
                if (context && typeof context.stopGeneration === 'function') {
                    const stopped = context.stopGeneration();
                    toastr.info(stopped ? '생성을 중단했습니다.' : '진행 중인 생성이 없습니다.', '', { timeOut: 1500 });
                }
            },
        },
        {
            id: 'continue_last', label: '이어쓰기', icon: 'fa-forward',
            desc: '마지막 메시지 번호 안에서 그 뒤를 더 길게 이어 쓰게 함 — 새 메시지가 생기지 않음 (/continue)',
            run: () => {
                if (window.CopyBotGeneration?.isBusy?.()) {
                    toastr.info('응답 생성 중입니다. 끝난 뒤 다시 눌러 주십시오.', '', { timeOut: 1500 });
                    return false;
                }
                return window.CopyBotCommands?.executeSilentCommand('/continue', null);
            },
        },
        {
            id: 'hide_last', label: '마지막 메시지 숨기기', icon: 'fa-eye-slash',
            desc: '마지막 메시지를 AI 가 못 보게 숨김 (/hide)',
            run: () => {
                if (!ctx()?.chat?.length) { toastr.warning('숨길 메시지가 없습니다.'); return; }
                const idx = lastIndex();
                return window.CopyBotMessageOperations?.executeHideCommand(idx, idx);
            },
        },
        {
            id: 'capture_last_bot', label: '마지막 봇 메시지 캡처(이미지)', icon: 'fa-camera',
            desc: '마지막 봇 메시지를 보이는 그대로 이미지로 만들어 큰 미리보기로 띄움 — 거기서 클립보드 복사/PNG 저장 (캡처 옵션의 익명화·숨김 적용)',
            run: () => window.CopyBotCapture?.captureLastBot(),
        },
        {
            id: 'copy_last_bot', label: '마지막 봇 메시지 복사', icon: 'fa-copy',
            desc: '가장 최근 봇 메시지 본문을 클립보드에 복사',
            run: async () => {
                const chat = ctx()?.chat || [];
                for (let i = chat.length - 1; i >= 0; i--) {
                    if (!chat[i].is_user && !chat[i].is_system) {
                        const ok = await window.CopyBotCommands?.writeToClipboard(chat[i].mes || '');
                        toastr[ok ? 'success' : 'error'](ok ? `#${i} 봇 메시지를 복사했습니다.` : '클립보드 복사에 실패했습니다.', '', { timeOut: 1500 });
                        return ok;
                    }
                }
                toastr.warning('복사할 봇 메시지가 없습니다.');
            },
        },
    ];

    const BY_ID = Object.fromEntries(ACTIONS.map(a => [a.id, a]));

    window.CopyBotActions = {
        // 커스텀 버튼 드롭다운에 보여줄 목록 (hidden 제외)
        list: () => ACTIONS.filter(a => !a.hidden),
        get: (id) => BY_ID[id] || null,
        defaultIcon: (id) => BY_ID[id]?.icon || 'fa-circle',
        label: (id) => BY_ID[id]?.label || id,

        // 동작 실행 (모든 접근 경로가 이 함수를 통함)
        // slotIndex/anchor 는 커스텀 버튼에서만 넘어온다 — 바로가기 동작(st_menu/qr_set)이 슬롯의 link 와 누른 버튼(팝업 기준점)을 쓴다
        run: async function(id, slotIndex, anchor) {
            const action = BY_ID[id];
            if (!action) {
                toastr.warning(`알 수 없는 동작입니다: ${id}`);
                return false;
            }
            try {
                const slot = Number.isInteger(slotIndex) ? (window.CopyBotActions.getEnabledSlots().find(s => s.index === slotIndex) || null) : null;
                return await action.run({ slot, anchor: anchor || null });
            } catch (error) {
                console.error(`깡갤 복사기: 동작 실행 실패 (${id})`, error);
                toastr.error(`동작 실행 중 오류가 났습니다: ${action.label}`);
                return false;
            }
        },

        // 설정에서 활성 커스텀 슬롯 읽기 (ui/icons/wandMenu 공용)
        getEnabledSlots: function() {
            const enabled = $('#copybot_custom_buttons_toggle').attr('data-enabled') === 'true';
            if (!enabled) return [];
            const slots = [];
            $('#copybot_custom_slots .copybot_custom_slot').each(function() {
                const $slot = $(this);
                const raw = String($slot.find('.copybot_custom_action').val() || '');
                const actionId = raw.startsWith('st_menu:') ? 'st_menu' : raw;      // 드롭다운 값 "st_menu:<메뉴>" → 동작 id 는 st_menu
                if (!actionId || !BY_ID[actionId]) return;
                const isShortcut = actionId === 'st_menu' || actionId === 'qr_set';
                const link = isShortcut ? ($slot.data('link') || null) : null;
                if (isShortcut && !link) return;                                     // 고르기를 끝내지 않은 바로가기는 버튼을 만들지 않음
                const d = isShortcut ? (window.CopyBotShortcut?.describe(actionId, link) || null) : null;
                slots.push({
                    index: Number($slot.attr('data-slot')),
                    action: actionId,
                    link,
                    label: d ? d.label : BY_ID[actionId].label,
                    iconClass: $slot.find('.copybot_icon_picker').data('icon') || (d ? d.icon : BY_ID[actionId].icon),
                    submenu: $slot.find('.copybot_custom_submenu').is(':checked'),
                    inputfield: $slot.find('.copybot_custom_inputfield').is(':checked'),
                    position: $slot.find('.copybot_custom_position').val() || 'bottom_left',
                });
            });
            return slots;
        },
    };

    if (window.copybot_debug_mode) {
        console.log('깡갤 복사기: actions.js 모듈 로드 완료');
    }
})();
