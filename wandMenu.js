// ===================================================================
// 📦 wandMenu.js - 퀵메뉴 / 플로팅 메뉴 모듈
// ===================================================================
// 역할:
//  • 퀵메뉴 팝업(마법봉 Extensions 메뉴·입력필드 아이콘으로 열림)
//  • 플로팅 메뉴(화면 위에 떠 있는 드래그 가능한 둥근 버튼으로 열림)
//  두 메뉴는 같은 HTML/동작을 공유하고 "어디서 여는가"만 다름 (instance: 'quick' | 'float')
//  • 커스텀 버튼 섹션 (actions.js 레지스트리 기반, 편의기능 슬롯 설정과 자동 연동)
// 의존성: utils.js, (실행 시) commands.js, generation.js, actions.js, messageOperations.js
// ===================================================================

(function() {
    'use strict';

    // 모듈 상태
    let isInitialized = false;
    let isDebugMode = false;
    let callbacks = {};

    // 인스턴스별 상태 (고정/미니)
    const INSTANCES = ['quick', 'float'];
    const state = {
        quick: { pinned: false, mini: false, temporarilyHidden: false },
        float: { pinned: false, mini: false, temporarilyHidden: false },
    };
    const POPUP_ID = { quick: 'copybot_quick_menu', float: 'copybot_float_menu' };
    const SECTION_PREFIX = { quick: 'copybot_qm_section_', float: 'copybot_fm_section_' };
    const SECTION_IDS = ['jump', 'write', 'copy', 'hide', 'multi_delete', 'custom'];

    // localStorage 키 (quick 은 구버전 키 유지)
    const STORAGE_KEYS = {
        quick: { pinned: 'copybot_quick_menu_pinned', mini: 'copybot_quick_menu_mini' },
        float: { pinned: 'copybot_float_menu_pinned', mini: 'copybot_float_menu_mini' },
    };
    const STORAGE_KEY_FLOAT_POS = 'copybot_float_button_pos';

    // 디버그 로그
    function debugLog(...args) {
        if (isDebugMode && window.CopyBotUtils) {
            window.CopyBotUtils.debugLog(isDebugMode, ...args);
        }
    }

    // 저장된 아이콘 클래스 가져오기
    function getIconClass(pickerId, defaultIcon) {
        const $picker = $(`#${pickerId}`);
        return $picker.length > 0 ? ($picker.data('icon') || defaultIcon) : defaultIcon;
    }

    function $popup(instance) {
        return $(`#${POPUP_ID[instance]}`);
    }

    function instanceOf(el) {
        return $(el).closest('.copybot_quick_menu_popup').attr('data-instance') || 'quick';
    }

    // ===================================================================
    // 💾 설정 저장/로드 (고정/미니 상태)
    // ===================================================================

    function loadSettings() {
        try {
            INSTANCES.forEach(instance => {
                state[instance].pinned = localStorage.getItem(STORAGE_KEYS[instance].pinned) === 'true';
                state[instance].mini = localStorage.getItem(STORAGE_KEYS[instance].mini) === 'true';
            });
            debugLog('설정 로드:', state);
        } catch (e) {
            debugLog('설정 로드 실패:', e);
        }
    }

    function saveSettings(instance) {
        try {
            localStorage.setItem(STORAGE_KEYS[instance].pinned, state[instance].pinned);
            localStorage.setItem(STORAGE_KEYS[instance].mini, state[instance].mini);
        } catch (e) {
            debugLog('설정 저장 실패:', e);
        }
    }

    // ===================================================================
    // 🪄 마법봉 메뉴 등록
    // ===================================================================

    // 설정(퀵메뉴 ON + 마법봉 접근)에 맞춰 마법봉 항목과 "Extensions 메뉴 열릴 때 재등록" 리스너를 켜고 끈다 — settings/ui 에서 호출
    let wandRegisterBound = false;
    function refreshWandRegistration() {
        const settings = callbacks.getQuickMenuSettings ? callbacks.getQuickMenuSettings() : null;
        const want = !!(settings && settings.enabled && settings.accessWand);
        if (want && !wandRegisterBound) {
            wandRegisterBound = true;
            $(document).off('click.copybot_wand_register').on('click.copybot_wand_register', '#extensionsMenuButton', function() {
                setTimeout(registerWandMenu, 100);
            });
        } else if (!want && wandRegisterBound) {
            wandRegisterBound = false;
            $(document).off('click.copybot_wand_register');
        }
        return registerWandMenu();
    }

    function registerWandMenu() {
        const settings = callbacks.getQuickMenuSettings ? callbacks.getQuickMenuSettings() : null;
        if (settings && (!settings.enabled || !settings.accessWand)) {
            $('#copybot_wand_container').remove();
            debugLog('마법봉 메뉴 미등록 (설정: 퀵메뉴 OFF 또는 마법봉 미선택)');
            return false;
        }
        if ($('#copybot_wand_container').length > 0) {
            return true;
        }
        const $extensionsMenu = $('#extensionsMenu');
        if ($extensionsMenu.length === 0) {
            debugLog('Extensions 메뉴를 찾을 수 없음');
            return false;
        }

        const wandIconClass = getIconClass('copybot_quickmenu_wand_icon_picker', 'fa-scroll');   // 기본: 두루마리(로어 느낌). 구버전 기본 fa-clipboard 는 로드 시 이관
        $extensionsMenu.append(`
            <div id="copybot_wand_container" class="extension_container interactable" tabindex="0">
                <div id="copybot_wand_button" class="list-group-item flex-container flexGap5 interactable" tabindex="0" role="listitem" title="깡갤 복사기 퀵메뉴">
                    <div class="fa-solid ${wandIconClass} extensionsMenuExtensionButton"></div>
                    <span>깡갤 복사기</span>
                </div>
            </div>
        `);
        debugLog('✅ 마법봉 메뉴 항목 등록 완료');
        createMenuPopup('quick');
        return true;
    }

    // ===================================================================
    // 🧱 메뉴 팝업 HTML (quick/float 공용)
    // ===================================================================

    function createMenuPopup(instance) {
        if ($popup(instance).length > 0) return;
        setupEvents();   // 팝업이 처음 생길 때 비로소 전역 리스너 등록 (미사용 시 무영향)

        const tagRemoveIcon = getIconClass('copybot_tag_remove_icon_picker', 'fa-tags');
        const deleteIcon = getIconClass('copybot_delete_icon_picker', 'fa-trash');
        const deleteRegenIcon = getIconClass('copybot_delete_regenerate_icon_picker', 'fa-redo');

        const html = `
            <div id="${POPUP_ID[instance]}" class="copybot_quick_menu_popup" data-instance="${instance}">
                <div class="copybot_quick_menu_content">
                    <!-- 📍 이동 -->
                    <div class="copybot_quick_menu_section" data-section="jump">
                        <div class="copybot_quick_menu_section_title">이동</div>
                        <div class="copybot_quick_row">
                            <button class="copybot_quick_btn_small" data-action="jump_first" title="첫 메시지로">
                                <i class="fa-solid fa-angles-up"></i><span class="copybot_btn_text">처음</span>
                            </button>
                            <button class="copybot_quick_btn_small" data-action="jump_last" title="마지막 메시지로">
                                <i class="fa-solid fa-angles-down"></i><span class="copybot_btn_text">끝</span>
                            </button>
                            <span class="copybot_quick_spacer"></span>
                            <input type="number" class="copybot_quick_input copybot_qm_jump_num" placeholder="" min="0">
                            <button class="copybot_quick_btn_mini" data-action="jump_to" title="해당 번호로 이동">
                                <i class="fa-solid fa-arrow-right"></i><span class="copybot_btn_text">이동</span>
                            </button>
                        </div>
                    </div>

                    <!-- ✏️ 작성 -->
                    <div class="copybot_quick_menu_section" data-section="write">
                        <div class="copybot_quick_menu_section_title">작성</div>
                        <div class="copybot_quick_row">
                            <button class="copybot_quick_btn_third" data-action="remove_tags" title="입력창 태그 제거">
                                <i class="fa-solid ${tagRemoveIcon}" data-icon-type="tag_remove"></i><span class="copybot_btn_text">태그제거</span>
                            </button>
                            <button class="copybot_quick_btn_third" data-action="delete_last" title="마지막 메시지 삭제">
                                <i class="fa-solid ${deleteIcon}" data-icon-type="delete"></i><span class="copybot_btn_text">삭제</span>
                            </button>
                            <button class="copybot_quick_btn_third" data-action="delete_regen" title="마지막 삭제 후 재생성">
                                <i class="fa-solid ${deleteRegenIcon}" data-icon-type="delete_regen"></i><span class="copybot_btn_text">재생성</span>
                            </button>
                        </div>
                    </div>

                    <!-- 📝 복사 -->
                    <div class="copybot_quick_menu_section" data-section="copy">
                        <div class="copybot_quick_menu_section_title">복사</div>
                        <div class="copybot_quick_row">
                            <input type="number" class="copybot_quick_input copybot_qm_copy_start" placeholder="" min="0">
                            <span class="copybot_quick_separator">~</span>
                            <input type="number" class="copybot_quick_input copybot_qm_copy_end" placeholder="" min="0">
                            <button class="copybot_quick_btn_small" data-action="copy_range" title="범위 복사">
                                <i class="fa-solid fa-copy"></i><span class="copybot_btn_text">복사</span>
                            </button>
                        </div>
                        <div class="copybot_quick_copy_hint copybot_qm_copy_hint" style="font-size:10px; color:var(--SmartThemeQuoteColor); margin-top:4px; display:none;">
                            ※ 범위 미지정 시 전체 복사
                        </div>
                    </div>

                    <!-- 👁️ 숨기기/보이기 -->
                    <div class="copybot_quick_menu_section" data-section="hide">
                        <div class="copybot_quick_menu_section_title">숨기기/보이기</div>
                        <div class="copybot_quick_row copybot_quick_row_nowrap">
                            <input type="number" class="copybot_quick_input copybot_qm_hide_start" placeholder="" min="0">
                            <span class="copybot_quick_separator">~</span>
                            <input type="number" class="copybot_quick_input copybot_qm_hide_end" placeholder="" min="0">
                            <button class="copybot_quick_btn_small" data-action="hide_messages" title="메시지 숨기기">
                                <i class="fa-solid fa-eye-slash"></i><span class="copybot_btn_text">숨김</span>
                            </button>
                            <button class="copybot_quick_btn_small" data-action="unhide_messages" title="메시지 보이기">
                                <i class="fa-solid fa-eye"></i><span class="copybot_btn_text">보임</span>
                            </button>
                        </div>
                    </div>

                    <!-- 🗑️ 다중 삭제 -->
                    <div class="copybot_quick_menu_section" data-section="multi_delete">
                        <div class="copybot_quick_menu_section_title">메시지 다중 삭제</div>
                        <div class="copybot_quick_row">
                            <input type="number" class="copybot_quick_input copybot_qm_del_start" placeholder="" min="0">
                            <span class="copybot_quick_separator">~</span>
                            <input type="number" class="copybot_quick_input copybot_qm_del_end" placeholder="" min="0">
                            <button class="copybot_quick_btn_small copybot_quick_btn_multi_delete" data-action="multi_delete" title="선택 범위 삭제">
                                <i class="fa-solid fa-trash"></i><span class="copybot_btn_text">삭제</span>
                            </button>
                        </div>
                    </div>

                    <!-- ⭐ 커스텀 버튼 (actions.js) -->
                    <div class="copybot_quick_menu_section copybot_quick_menu_section_last" data-section="custom">
                        <div class="copybot_quick_menu_section_title">커스텀</div>
                        <div class="copybot_quick_custom_grid"></div>
                    </div>
                </div>

                <!-- 하단 바 -->
                <div class="copybot_quick_menu_footer">
                    <div class="copybot_quick_footer_left">
                        <button class="copybot_quick_toggle copybot_qm_pin" data-active="false" title="창 고정">고정</button>
                        <button class="copybot_quick_toggle copybot_qm_mini" data-active="false" title="미니 모드">미니</button>
                    </div>
                    <div class="copybot_quick_footer_right">
                        <button class="copybot_quick_icon_btn" data-action="open_settings" title="설정 열기">
                            <i class="fa-solid fa-gear"></i>
                        </button>
                        <button class="copybot_quick_icon_btn" data-action="close_menu" title="닫기">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        $('body').append(html);
        refreshCustomSections();
        applySectionVisibility();
        debugLog(`✅ 메뉴 팝업 생성 완료 (${instance})`);
    }

    // 커스텀 섹션 채우기 (슬롯 설정 변경 시 ui.js 가 호출)
    function refreshCustomSections() {
        const slots = (callbacks.getCustomSlots ? callbacks.getCustomSlots() : (window.CopyBotActions?.getEnabledSlots?.() || []));
        INSTANCES.forEach(instance => {
            const $grid = $popup(instance).find('[data-section="custom"] .copybot_quick_custom_grid');
            if ($grid.length === 0) return;
            $grid.empty();
            slots.forEach(slot => {
                $grid.append(`
                    <button class="copybot_quick_btn_third" data-action="custom" data-custom-action="${slot.action}" title="${slot.label}">
                        <i class="fa-solid ${slot.iconClass}"></i><span class="copybot_btn_text">${slot.label}</span>
                    </button>
                `);
            });
        });
        applySectionVisibility();
    }

    // ===================================================================
    // 🎮 이벤트 핸들러
    // ===================================================================

    let eventsBound = false;
    function setupEvents() {
        if (eventsBound) return;
        eventsBound = true;
        // 화면 회전/크기 변경 시 열린 메뉴 재배치
        $(window).off('resize.copybot_menu_reposition orientationchange.copybot_menu_reposition')
            .on('resize.copybot_menu_reposition orientationchange.copybot_menu_reposition', () => { ['quick', 'float'].forEach(i => { try { repositionMenu(i); } catch (e) { /* 무시 */ } }); });

        // 마법봉 내 복사기 버튼 클릭 (Extensions 메뉴는 닫고, 그 자리 근처에 팝업)
        $(document).off('click.copybot_wand').on('click.copybot_wand', '#copybot_wand_button', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const anchor = document.getElementById('extensionsMenuButton') || this;
            $('#extensionsMenu').hide();
            toggleMenu('quick', anchor);
        });

        // 메뉴 안의 동작 버튼
        $(document).off('click.copybot_quick_btn').on('click.copybot_quick_btn',
            '.copybot_quick_menu_popup .copybot_quick_btn_small, .copybot_quick_menu_popup .copybot_quick_btn_mini, .copybot_quick_menu_popup .copybot_quick_btn_third',
            function(e) {
                e.stopPropagation();
                const $btn = $(this);
                const instance = instanceOf(this);
                const action = $btn.data('action');
                if (action === 'custom') {
                    const customAction = $btn.attr('data-custom-action');
                    if (callbacks.runAction && customAction) callbacks.runAction(customAction);
                    if (!state[instance].pinned) hideMenu(instance);
                    return;
                }
                handleQuickAction(action, instance);
            });

        // 외부 클릭 시 닫기 (고정 모드 제외)
        $(document).off('mousedown.copybot_quick_outside').on('mousedown.copybot_quick_outside', function(e) {
            INSTANCES.forEach(instance => {
                const $menu = $popup(instance);
                if (!$menu.is(':visible') || state[instance].pinned) return;
                const $t = $(e.target);
                if ($t.closest(`#${POPUP_ID[instance]}`).length) return;
                if ($t.closest('#copybot_wand_container, #extensionsMenu, #copybot_float_button, #copybot_quickmenu_input_icon_btn').length) return;
                hideMenu(instance);
            });
        });

        // 고정/미니 토글
        $(document).off('click.copybot_quick_toggle').on('click.copybot_quick_toggle', '.copybot_quick_menu_popup .copybot_quick_toggle', function(e) {
            e.stopPropagation();
            const $btn = $(this);
            const instance = instanceOf(this);
            const isActive = $btn.attr('data-active') === 'true';
            $btn.attr('data-active', !isActive);
            if ($btn.hasClass('copybot_qm_pin')) {
                state[instance].pinned = !isActive;
            } else if ($btn.hasClass('copybot_qm_mini')) {
                state[instance].mini = !isActive;
                $popup(instance).toggleClass('copybot_quick_menu_mini', state[instance].mini);
                // 크기가 바뀌었으니 누른 버튼 기준으로 다시 배치 (미니 해제 때 화면 밖으로 나가 닫지도 못하던 문제)
                repositionMenu(instance);
            }
            saveSettings(instance);
        });

        // 아이콘 버튼 (설정, 닫기)
        $(document).off('click.copybot_quick_icon').on('click.copybot_quick_icon', '.copybot_quick_menu_popup .copybot_quick_icon_btn', function(e) {
            e.stopPropagation();
            const instance = instanceOf(this);
            const action = $(this).data('action');
            if (action === 'close_menu') {
                hideMenu(instance);
            } else {
                handleQuickAction(action, instance);
            }
        });

        // ESC 로 닫기
        $(document).off('keydown.copybot_quick_esc').on('keydown.copybot_quick_esc', function(e) {
            if (e.key !== 'Escape') return;
            INSTANCES.forEach(instance => { if ($popup(instance).is(':visible')) hideMenu(instance); });
        });

        // 복사 범위 입력 변경 시 "전체 복사" 모드 해제
        $(document).off('input.copybot_copy_range').on('input.copybot_copy_range', '.copybot_qm_copy_start, .copybot_qm_copy_end', function() {
            const $menu = $(this).closest('.copybot_quick_menu_popup');
            $menu.find('[data-action="copy_range"]').html('<i class="fa-solid fa-copy"></i><span class="copybot_btn_text">복사</span>').removeAttr('data-mode');
            $menu.find('.copybot_qm_copy_hint').hide();
        });

        // 실리 drawer 열림/닫힘 감지 (고정 모드 복원)
        setupSillyTavernMenuObserver();

        debugLog('✅ 퀵/플로팅 메뉴 이벤트 핸들러 설정 완료');
    }

    // ===================================================================
    // 👁️ 실리 drawer 감지 (고정 모드일 때 임시 숨김/복원)
    // ===================================================================

    function setupSillyTavernMenuObserver() {
        function getOpenDrawerCount() {
            let count = 0;
            $('.drawer-content').each(function() {
                const $this = $(this);
                if (!$this.closest('.copybot_quick_menu_popup').length &&
                    !$this.closest('#extensionsMenu').length &&
                    $this.is(':visible')) {
                    count++;
                }
            });
            return count;
        }

        function checkAndRestoreIfNeeded() {
            if (getOpenDrawerCount() !== 0) return;
            INSTANCES.forEach(instance => {
                if (state[instance].pinned && state[instance].temporarilyHidden) {
                    showMenu(instance);
                    state[instance].temporarilyHidden = false;
                }
            });
        }

        function hideTemporarily() {
            INSTANCES.forEach(instance => {
                if (!state[instance].pinned) return;
                const $menu = $popup(instance);
                if ($menu.is(':visible')) {
                    state[instance].temporarilyHidden = true;
                    $menu.hide();
                }
            });
        }

        $(document).off('click.copybot_drawer_detect').on('click.copybot_drawer_detect', '.drawer-toggle', function() {
            const anyVisible = INSTANCES.some(i => $popup(i).is(':visible'));
            const anyHidden = INSTANCES.some(i => state[i].temporarilyHidden);
            if (anyVisible) {
                setTimeout(() => { if (getOpenDrawerCount() > 0) hideTemporarily(); }, 150);
            } else if (anyHidden) {
                setTimeout(checkAndRestoreIfNeeded, 300);
            }
        });

        $(document).off('click.copybot_restore_check').on('click.copybot_restore_check', function(e) {
            if (!INSTANCES.some(i => state[i].pinned && state[i].temporarilyHidden)) return;
            if (!$(e.target).closest('.drawer-toggle').length && !$(e.target).closest('.drawer-content').length) {
                setTimeout(checkAndRestoreIfNeeded, 300);
            }
        });
    }

    // ===================================================================
    // 🔧 메뉴 열기/닫기
    // ===================================================================

    function toggleMenu(instance, triggerElement) {
        if ($popup(instance).is(':visible')) {
            hideMenu(instance);
        } else {
            showMenu(instance, triggerElement);
        }
    }

    function showMenu(instance, triggerElement) {
        createMenuPopup(instance);
        const $menu = $popup(instance);

        // UI 상태와 변수 동기화
        $menu.find('.copybot_qm_pin').attr('data-active', state[instance].pinned);
        $menu.find('.copybot_qm_mini').attr('data-active', state[instance].mini);
        $menu.toggleClass('copybot_quick_menu_mini', state[instance].mini);

        // 퀵메뉴는 "누른 아이콘 바로 위에 잠시 뜨는 팝업" 느낌으로 — 트리거 요소 기준 배치 (없으면 좌상단)
        const anchor = instance === 'float'
            ? document.getElementById('copybot_float_button')
            : (triggerElement || document.getElementById('copybot_quickmenu_input_icon_btn') || document.getElementById('copybot_wand_button'));
        state[instance].anchor = (anchor && anchor.getBoundingClientRect().width > 0) ? anchor : null;
        if (state[instance].anchor) {
            positionMenuNear($menu, state[instance].anchor);
        } else {
            $menu.css({ position: 'fixed', top: 5, left: 5, right: 'auto', bottom: 'auto', transform: 'none', zIndex: 10001 });
        }
        $menu.fadeIn(150);
        debugLog(`메뉴 열림 (${instance})`);
    }

    // 기준 요소 위쪽(안 되면 아래쪽)에, 화면 안에 들어오도록 배치. keepVisible: 열린 채로 다시 배치할 때
    function positionMenuNear($menu, anchorEl, keepVisible = false) {
        const vw = window.innerWidth, vh = window.innerHeight;
        if (!keepVisible) $menu.css({ position: 'fixed', transform: 'none', zIndex: 10001, visibility: 'hidden', display: 'block' });
        else $menu.css({ position: 'fixed', transform: 'none', zIndex: 10001 });
        $menu.css({ maxHeight: Math.max(120, vh - 16), overflowY: 'auto' });   // 화면보다 길면 메뉴 안에서 스크롤
        const mw = $menu.outerWidth() || 260;
        const mh = $menu.outerHeight() || 300;
        const r = anchorEl.getBoundingClientRect();
        let top = r.top - mh - 8;                                        // 기본: 버튼 위
        if (top < 8) top = Math.min(r.bottom + 8, vh - mh - 8);          // 위에 자리가 없으면 아래(그래도 화면 안)
        let left = r.left + r.width / 2 - mw / 2;
        if (left < 8) left = 8;
        if (left + mw > vw - 8) left = vw - mw - 8;
        top = Math.max(8, Math.min(top, vh - mh - 8));
        if (!keepVisible) $menu.css({ top, left, right: 'auto', bottom: 'auto', visibility: '', display: 'none' });
        else $menu.css({ top, left, right: 'auto', bottom: 'auto' });
    }

    // 열린 메뉴를 같은 기준점으로 다시 배치 (미니/일반 전환, 화면 회전 등)
    function repositionMenu(instance) {
        const $menu = $popup(instance);
        if (!$menu.length || !$menu.is(':visible')) return;
        let anchor = state[instance].anchor;
        if (instance === 'float') anchor = document.getElementById('copybot_float_button') || anchor;
        if (!anchor || !anchor.isConnected || anchor.getBoundingClientRect().width === 0) {
            const vw = window.innerWidth, vh = window.innerHeight;
            const mw = $menu.outerWidth() || 260, mh = $menu.outerHeight() || 300;
            $menu.css({ top: Math.max(8, Math.min(parseFloat($menu.css('top')) || 8, vh - mh - 8)), left: Math.max(8, Math.min(parseFloat($menu.css('left')) || 8, vw - mw - 8)) });
            return;
        }
        positionMenuNear($menu, anchor, true);
    }
    function hideMenu(instance) {
        $popup(instance).fadeOut(100);
    }

    // 하위 호환 API
    function toggleQuickMenu(el) { toggleMenu('quick', el); }
    function showQuickMenu(el) { showMenu('quick', el); }
    function hideQuickMenu() { hideMenu('quick'); }
    function isQuickMenuVisible() { return $popup('quick').is(':visible'); }

    // ===================================================================
    // 🟣 플로팅 버튼 (드래그 가능)
    // ===================================================================

    function loadFloatPosition() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_FLOAT_POS);
            if (!raw) return null;
            const pos = JSON.parse(raw);
            if (typeof pos?.x === 'number' && typeof pos?.y === 'number') return pos;
        } catch (e) { /* 무시 */ }
        return null;
    }

    function saveFloatPosition(x, y) {
        try { localStorage.setItem(STORAGE_KEY_FLOAT_POS, JSON.stringify({ x, y })); } catch (e) { /* 무시 */ }
    }

    function clampFloatPosition(x, y) {
        const btn = document.getElementById('copybot_float_button');
        const size = btn ? btn.offsetWidth || 44 : 44;
        const maxX = Math.max(0, window.innerWidth - size - 4);
        const maxY = Math.max(0, window.innerHeight - size - 4);
        return { x: Math.min(Math.max(4, x), maxX), y: Math.min(Math.max(4, y), maxY) };
    }

    function defaultFloatPosition() {
        return clampFloatPosition(window.innerWidth - 64, window.innerHeight - 200);
    }

    function applyFloatPosition(pos) {
        const p = clampFloatPosition(pos.x, pos.y);
        $('#copybot_float_button').css({ left: p.x, top: p.y, right: 'auto', bottom: 'auto' });
        return p;
    }

    function ensureFloatButton() {
        if ($('#copybot_float_button').length) return;
        $('body').append('<div id="copybot_float_button" title="깡갤 복사기 플로팅 메뉴 (끌어서 이동)"><i class="fa-solid fa-bolt"></i></div>');
        applyFloatPosition(loadFloatPosition() || defaultFloatPosition());
    }

    // 설정(사용 여부·아이콘)에 맞춰 버튼 표시 갱신 — ui/settings 에서 호출
    function refreshFloatButton() {
        const settings = callbacks.getFloatMenuSettings ? callbacks.getFloatMenuSettings() : { enabled: false, iconClass: 'fa-bolt' };
        if (!settings.enabled) {
            // OFF: 버튼을 만들지 않는다. 이미 있으면(켰다 끈 경우) 숨김
            const $existing = $('#copybot_float_button');
            if ($existing.length) { $existing.hide(); hideMenu('float'); }
            return;
        }
        setupFloatButton();   // 버튼 생성 + 드래그 리스너 (1회)
        const $btn = $('#copybot_float_button');
        $btn.find('i').attr('class', `fa-solid ${settings.iconClass || 'fa-bolt'}`);
        createMenuPopup('float');
        $btn.css('display', 'flex');
        applyFloatPosition(loadFloatPosition() || defaultFloatPosition());
    }

    function resetFloatPosition() {
        try { localStorage.removeItem(STORAGE_KEY_FLOAT_POS); } catch (e) { /* 무시 */ }
        ensureFloatButton();
        applyFloatPosition(defaultFloatPosition());
    }

    function setupFloatButton() {
        ensureFloatButton();
        const btn = document.getElementById('copybot_float_button');
        if (!btn || btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';

        let dragging = false, moved = false, startX = 0, startY = 0, originX = 0, originY = 0;
        const DRAG_THRESHOLD = 6;

        btn.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            dragging = true; moved = false;
            startX = e.clientX; startY = e.clientY;
            const rect = btn.getBoundingClientRect();
            originX = rect.left; originY = rect.top;
            btn.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        btn.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX, dy = e.clientY - startY;
            if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            moved = true;
            btn.classList.add('copybot_float_dragging');
            applyFloatPosition({ x: originX + dx, y: originY + dy });
            // 드래그 중엔 열린 플로팅 메뉴를 따라 옮기지 않고 닫음
            if ($popup('float').is(':visible')) hideMenu('float');
        });
        const finish = (e) => {
            if (!dragging) return;
            dragging = false;
            btn.classList.remove('copybot_float_dragging');
            try { btn.releasePointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
            if (moved) {
                const rect = btn.getBoundingClientRect();
                const p = clampFloatPosition(rect.left, rect.top);
                saveFloatPosition(p.x, p.y);
            } else {
                toggleMenu('float', btn);
            }
        };
        btn.addEventListener('pointerup', finish);
        btn.addEventListener('pointercancel', finish);

        // 화면 회전/크기 변경 시 화면 밖으로 나가지 않게
        window.addEventListener('resize', () => {
            if ($('#copybot_float_button').is(':visible')) {
                const rect = btn.getBoundingClientRect();
                applyFloatPosition({ x: rect.left, y: rect.top });
            }
        });
    }

    // ===================================================================
    // ⚡ 퀵액션 처리 (quick/float 공용)
    // ===================================================================

    function handleQuickAction(action, instance = 'quick') {
        debugLog('퀵액션 실행:', action, instance);
        const $menu = $popup(instance);
        const msgRange = callbacks.getMessageRange ? callbacks.getMessageRange() : { lastIndex: 0 };
        const val = (cls) => $menu.find(`.${cls}`).val();
        const clear = (...classes) => classes.forEach(cls => $menu.find(`.${cls}`).val(''));

        switch (action) {
            // === 📍 이동 ===
            case 'jump_first':
                if (confirm('첫 메시지로 이동합니다.\n\n채팅이 많을 경우 렉이 발생할 수 있습니다.\n정말 이동하시겠습니까?')) {
                    if (callbacks.jumpToMessage) callbacks.jumpToMessage(0, '첫 메시지로 이동!');
                } else {
                    return;
                }
                break;

            case 'jump_last':
                if (callbacks.jumpToMessage) callbacks.jumpToMessage('last', '마지막 메시지로 이동!');
                break;

            case 'jump_to': {
                const jumpNum = val('copybot_qm_jump_num');
                if (!jumpNum) {
                    toastr.warning('이동할 메시지 번호를 입력해야 합니다');
                    return;
                }
                if (callbacks.jumpToMessage) callbacks.jumpToMessage(jumpNum, `메시지 #${jumpNum}로 이동!`);
                clear('copybot_qm_jump_num');
                break;
            }

            // === ✏️ 작성 ===
            case 'remove_tags':
                if (callbacks.removeTagsFromElement) callbacks.removeTagsFromElement('#send_textarea');
                break;

            case 'delete_last':
                if (callbacks.deleteLastMessage) callbacks.deleteLastMessage();
                else if (callbacks.executeSimpleCommand) callbacks.executeSimpleCommand('/del 1', '마지막 메시지 삭제');
                break;

            case 'delete_regen':
                if (callbacks.deleteAndRegenerate) callbacks.deleteAndRegenerate();
                else if (callbacks.smartDeleteAndRegenerate) callbacks.smartDeleteAndRegenerate();
                break;

            // === 📝 복사 ===
            case 'copy_range': {
                const copyStart = val('copybot_qm_copy_start');
                const copyEnd = val('copybot_qm_copy_end');
                const $copyHint = $menu.find('.copybot_qm_copy_hint');
                const $copyBtn = $menu.find('[data-action="copy_range"]');

                // 범위 미지정 상태의 첫 클릭 → 전체 범위 자동 설정
                if (!copyStart && !copyEnd && $copyBtn.attr('data-mode') !== 'all') {
                    $menu.find('.copybot_qm_copy_start').val('0');
                    $menu.find('.copybot_qm_copy_end').val(msgRange.lastIndex);
                    $copyHint.text('전체 범위 설정됨 - 다시 누르면 복사 실행').show();
                    $copyBtn.attr('data-mode', 'all');
                    return;
                }
                const actualStart = val('copybot_qm_copy_start') || '0';
                const actualEnd = val('copybot_qm_copy_end') || msgRange.lastIndex;
                if (callbacks.executeCopyCommand) callbacks.executeCopyCommand(actualStart, actualEnd);

                $copyHint.hide();
                $copyBtn.html('<i class="fa-solid fa-copy"></i><span class="copybot_btn_text">복사</span>').removeAttr('data-mode');
                clear('copybot_qm_copy_start', 'copybot_qm_copy_end');
                break;
            }

            // === 👁️ 숨기기/보이기 ===
            case 'hide_messages':
            case 'unhide_messages': {
                const s = val('copybot_qm_hide_start');
                const e = val('copybot_qm_hide_end');
                if (!s && !e) {
                    toastr.warning(action === 'hide_messages' ? '숨길 메시지 범위를 입력해야 합니다' : '보일 메시지 범위를 입력해야 합니다');
                    return;
                }
                const sNum = parseInt(s) || 0;
                const eNum = parseInt(e) || msgRange.lastIndex;
                const fn = action === 'hide_messages' ? callbacks.executeHideCommand : callbacks.executeUnhideCommand;
                if (fn) fn(sNum, eNum);
                clear('copybot_qm_hide_start', 'copybot_qm_hide_end');
                break;
            }

            // === 🗑️ 다중 삭제 ===
            case 'multi_delete': {
                const delStart = val('copybot_qm_del_start');
                const delEnd = val('copybot_qm_del_end');
                if (!delStart || !delEnd) {
                    toastr.warning('삭제할 메시지 범위를 입력해야 합니다');
                    return;
                }
                const ds = parseInt(delStart, 10), de = parseInt(delEnd, 10);
                if (isNaN(ds) || isNaN(de)) {
                    toastr.error('올바른 범위를 숫자로 입력해야 합니다');
                    return;
                }
                // 범위 검증(마지막 메시지 초과 포함)·경고창·/cut 실행은 messageOperations.executeMultiDelete 한 곳에서만 (중복 구현 금지, 2026-10-09)
                if (!callbacks.executeMultiDelete) {
                    toastr.error('다중 삭제 기능을 사용할 수 없습니다.');
                    return;
                }
                const r = callbacks.executeMultiDelete(ds, de);
                if (r === false) return;   // 검증 실패·취소 → 입력값과 메뉴 유지
                clear('copybot_qm_del_start', 'copybot_qm_del_end');
                break;
            }

            // === ⚙️ 설정 ===
            case 'open_settings':
                openCopybotSettings(instance);
                break;

            default:
                debugLog('알 수 없는 퀵액션:', action);
        }

        if (!state[instance].pinned) {
            hideMenu(instance);
        }
    }

    // ===================================================================
    // 👀 섹션 표시/숨김
    // ===================================================================

    function applySectionVisibility() {
        const hasCustom = (callbacks.getCustomSlots ? callbacks.getCustomSlots() : (window.CopyBotActions?.getEnabledSlots?.() || [])).length > 0;
        INSTANCES.forEach(instance => {
            const $menu = $popup(instance);
            if ($menu.length === 0) return;
            SECTION_IDS.forEach(sectionId => {
                const $checkbox = $(`#${SECTION_PREFIX[instance]}${sectionId}`);
                let visible = $checkbox.length ? $checkbox.is(':checked') : true;
                if (sectionId === 'custom' && !hasCustom) visible = false;
                $menu.find(`[data-section="${sectionId}"]`).toggle(visible);
            });
            // 마지막 보이는 섹션에 _last 클래스
            $menu.find('.copybot_quick_menu_section').removeClass('copybot_quick_menu_section_last');
            $menu.find('.copybot_quick_menu_section:visible').last().addClass('copybot_quick_menu_section_last');
        });
    }

    // 편의기능 아이콘 변경 시 두 메뉴의 아이콘 갱신
    function updateQuickMenuIcons() {
        const map = {
            tag_remove: getIconClass('copybot_tag_remove_icon_picker', 'fa-tags'),
            delete: getIconClass('copybot_delete_icon_picker', 'fa-trash'),
            delete_regen: getIconClass('copybot_delete_regenerate_icon_picker', 'fa-redo'),
        };
        Object.entries(map).forEach(([type, icon]) => {
            $(`.copybot_quick_menu_popup [data-icon-type="${type}"]`)
                .removeClass()
                .addClass(`fa-solid ${icon}`)
                .attr('data-icon-type', type);
        });
    }

    // ===================================================================
    // ⚙️ 설정 패널 열기
    // ===================================================================

    function openCopybotSettings(instance = 'quick') {
        $('#extensionsMenu').hide();

        if (state[instance].pinned && $popup(instance).is(':visible')) {
            state[instance].temporarilyHidden = true;
            $popup(instance).hide();
        }

        const $extensionsDrawer = $('#extensions_settings2').closest('.drawer-content');
        const $drawerToggle = $extensionsDrawer.siblings('.drawer-toggle');
        if ($drawerToggle.length) {
            $drawerToggle.trigger('click');
        }

        setTimeout(() => {
            const $copybotSettings = $('#copybot_settings');
            if (!$copybotSettings.length) return;
            const $inlineDrawer = $copybotSettings.find('.inline-drawer-content');
            if (!$inlineDrawer.is(':visible')) {
                $copybotSettings.find('.inline-drawer-header').trigger('click');
            }
            // 주의: scrollIntoView 는 문서(window)까지 스크롤해 상단바가 밀려 사라질 수 있음 → drawer 내부만 스크롤
            setTimeout(() => {
                const target = $copybotSettings[0];
                const scroller = target.closest('.drawer-content') || target.parentElement;
                if (scroller) {
                    const delta = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
                    scroller.scrollTop += delta - 8;
                }
            }, 100);
        }, 300);
    }

    // ===================================================================
    // 🚀 모듈 초기화
    // ===================================================================

    function init(options = {}) {
        if (isInitialized) return;

        isDebugMode = options.isDebugMode || false;
        callbacks = options.callbacks || {};

        loadSettings();
        // 팝업·플로팅 버튼·전역 리스너는 설정이 켜져 있거나 메뉴를 처음 열 때 만든다 (미사용 시 DOM 추가·리스너 0)

        // 설정 패널의 퀵메뉴 옵션이 바뀌면 마법봉 등록 상태 갱신
        $(document).off('change.copybot_wand_settings').on('change.copybot_wand_settings', '#copybot_quickmenu_wand', function() {
            setTimeout(refreshWandRegistration, 100);
        });
        $(document).off('click.copybot_wand_toggle').on('click.copybot_wand_toggle', '#copybot_quickmenu_toggle', function() {
            setTimeout(refreshWandRegistration, 200);
        });

        isInitialized = true;
        debugLog('✅ WandMenu 모듈 초기화 완료');
    }

    function updateCallbacks(newCallbacks) {
        callbacks = { ...callbacks, ...newCallbacks };
    }

    function setDebugMode(enabled) { isDebugMode = !!enabled; }

    // ===================================================================
    // 🌐 전역 공개
    // ===================================================================

    window.CopyBotWandMenu = {
        init,
        registerWandMenu,
        refreshWandRegistration,
        setupEvents,
        toggleQuickMenu,
        showQuickMenu,
        hideQuickMenu,
        isQuickMenuVisible,
        toggleMenu,
        showMenu,
        hideMenu,
        handleQuickAction,
        openCopybotSettings,
        updateCallbacks,
        setDebugMode,
        updateQuickMenuIcons,
        applySectionVisibility,
        refreshCustomSections,
        refreshFloatButton,
        resetFloatPosition,
    };

    if (window.copybot_debug_mode) {
        console.log('📦 CopyBotWandMenu 모듈 로드됨');
    }

})();
