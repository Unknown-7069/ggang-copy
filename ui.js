// 깡갤 복사기 UI 이벤트 및 상호작용 관리 모듈
// 모든 UI 이벤트 핸들링, 동적 버튼 관리, 사용자 상호작용 제어
(function() {
    'use strict';

    // 모듈 내부 변수
    let isDebugMode = false;
    
    // 콜백 함수들 (index.js 가 init 에서 주입). 여기 적힌 키 = ui.js 가 실제로 쓰는 것 전부
    let callbacks = {
        // utils
        debugLog: null,
        escapeHtml: null,
        getLastMessageIndex: null,

        // settings
        saveSettings: null,
        removeResizeHandle: null,
        restoreResizeHandle: null,
        hidePlaceholder: null,
        restorePlaceholder: null,
        safeApplyPlaceholderSetting: null,

        // presets
        loadPreset: null,
        addNewPreset: null,
        deletePreset: null,
        renamePreset: null,
        copyCurrentPreset: null,
        setActivePreset: null,
        updatePresetDropdown: null,
        enterPresetEditMode: null,
        exitPresetEditMode: null,
        updatePresetEditButtonState: null,
        openReorderModal: null,
        closeReorderModal: null,
        reorderPresets: null,
        isEditMode: null,

        // commands / generation / actions
        jumpToMessage: null,
        runAction: null,
        executeCopyCommand: null,
        removeTagsFromElement: null,
        copyTextboxContent: null,

        // icons
        safeUpdateInputFieldIcons: null,
        updateInputFieldIcons: null,

        // profiles
        enableHighQualityProfiles: null,
        disableHighQualityProfiles: null,
        loadGhostwriteProfiles: null,

        // ghostwrite
        addTempPromptField: null,
        scheduleDebounceAutoSave: null,
        scheduleImmediateAutoSave: null,
        showStatusIcon: null,

        // messageOperations
        executeHideCommand: null,
        executeUnhideCommand: null,
        executeMultiDelete: null,

        // 기타
        setDebugMode: null
    };

    // 전역 네임스페이스 생성
    window.CopyBotUI = {
        
        // === 모듈 초기화 ===
        init: function(deps) {
            try {
                deps = deps || {};
                isDebugMode = deps.isDebugMode || false;
                
                // 의존성 주입 - 각 모듈에서 필요한 함수들을 받아옴
                if (deps.callbacks) {
                    Object.assign(callbacks, deps.callbacks);
                }
                
                // 필수 의존성 체크
                if (!callbacks.debugLog) {
                    console.error('CopyBotUI: debugLog 콜백이 필요합니다');
                    return false;
                }
                
                if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, 'CopyBotUI 모듈 초기화 완료');
                return true;
            } catch (error) {
                console.error('CopyBotUI: 초기화 실패', error);
                return false;
            }
        },

        // === 동적 버튼 관리 ===
        
        // 삭제 전 재확인 옵션 표시/숨김 관리 함수
        updateActionButtons: function() {
            try {
                // 삭제 전 재확인 옵션 표시/숨김 로직
                const isDeleteEnabled = $('#copybot_delete_toggle').attr('data-enabled') === 'true';
                const isRegenEnabled = $('#copybot_delete_regenerate_toggle').attr('data-enabled') === 'true';
                const isCustomEnabled = $('#copybot_custom_buttons_toggle').attr('data-enabled') === 'true';
                // 퀵메뉴·플로팅 메뉴에는 삭제/재생성 버튼이 항상 들어 있으므로 그 메뉴만 켜도 좆됨방지 옵션을 보여 준다
                const isQuickEnabled = $('#copybot_quickmenu_toggle').attr('data-enabled') === 'true';
                const isFloatEnabled = $('#copybot_float_toggle').attr('data-enabled') === 'true';

                const $confirmItem = $('#copybot_confirm_delete_item');
                const showConfirm = isDeleteEnabled || isRegenEnabled || isCustomEnabled || isQuickEnabled || isFloatEnabled;
                // 패널이 보일 때만 애니메이션 (닫힌 패널에서 설정 로드·체크 변경 때마다 애니메이션 타이머를 돌리지 않음)
                if ($('#copybot_settings .inline-drawer-content').is(':visible')) {
                    if (showConfirm) $confirmItem.slideDown(200); else $confirmItem.slideUp(200);
                } else {
                    if (showConfirm) $confirmItem.show(); else $confirmItem.hide();
                }
                
                // 소메뉴 아이콘 초기화 (설정 로드 후 복사기 체크 상태에 따라)
                this.updateSubmenuIcons();
            } catch (error) {
                console.error('CopyBotUI: updateActionButtons 실패', error);
            }
        },

        // 소메뉴 아이콘 업데이트 함수
        updateSubmenuIcons: function() {
            try {
                // 태그제거 소메뉴 아이콘
                const tagRemoveEnabled = $('#copybot_tag_remove_toggle').attr('data-enabled') === 'true';
                const tagRemoveSubmenu = $('#copybot_tag_remove_submenu').is(':checked');
                if (tagRemoveEnabled && tagRemoveSubmenu) {
                    const iconClass = $('#copybot_tag_remove_icon_picker').data('icon') || 'fa-tags';
                    $('#copybot_submenu_tag_remove')
                        .removeClass()
                        .addClass(`copybot_submenu_icon fa-solid ${iconClass}`)
                        .show();
                } else {
                    $('#copybot_submenu_tag_remove').hide();
                }
                
                // 삭제 소메뉴 아이콘
                const deleteEnabled = $('#copybot_delete_toggle').attr('data-enabled') === 'true';
                const deleteSubmenu = $('#copybot_delete_submenu').is(':checked');
                if (deleteEnabled && deleteSubmenu) {
                    const iconClass = $('#copybot_delete_icon_picker').data('icon') || 'fa-trash';
                    $('#copybot_submenu_delete')
                        .removeClass()
                        .addClass(`copybot_submenu_icon fa-solid ${iconClass}`)
                        .show();
                } else {
                    $('#copybot_submenu_delete').hide();
                }
                
                // 재생성 소메뉴 아이콘
                const regenEnabled = $('#copybot_delete_regenerate_toggle').attr('data-enabled') === 'true';
                const regenSubmenu = $('#copybot_delete_regenerate_submenu').is(':checked');
                if (regenEnabled && regenSubmenu) {
                    const iconClass = $('#copybot_delete_regenerate_icon_picker').data('icon') || 'fa-redo';
                    $('#copybot_submenu_regenerate')
                        .removeClass()
                        .addClass(`copybot_submenu_icon fa-solid ${iconClass}`)
                        .show();
                } else {
                    $('#copybot_submenu_regenerate').hide();
                }
                
                // 입력필드 체크 상태에 따라 드롭다운 비활성화
                $('#copybot_tag_remove_position').prop('disabled', !$('#copybot_tag_remove_inputfield').is(':checked'));
                $('#copybot_delete_position').prop('disabled', !$('#copybot_delete_inputfield').is(':checked'));
                $('#copybot_delete_regenerate_position').prop('disabled', !$('#copybot_delete_regenerate_inputfield').is(':checked'));

                // 커스텀 버튼 소메뉴 아이콘 (슬롯 설정 기반으로 매번 다시 그림)
                $('#copybot_submenu_icons .copybot_submenu_custom').remove();
                const customSlots = window.CopyBotActions?.getEnabledSlots?.() || [];
                customSlots.filter(slot => slot.submenu).forEach(slot => {
                    $('<span>')
                        .addClass(`copybot_submenu_icon copybot_submenu_custom fa-solid ${slot.iconClass}`)
                        .attr({ 'data-action': slot.action, 'data-slot': slot.index, title: slot.label })
                        .appendTo('#copybot_submenu_icons');
                });
                // 아이콘 줄: 보이는 아이콘이 하나라도 있을 때만 (메뉴줄 아래 별도 줄)
                const anyIcon = $('#copybot_submenu_icons .copybot_submenu_icon').filter(function() { return $(this).css('display') !== 'none'; }).length > 0;
                $('#copybot_submenu_icons').toggle(anyIcon);

            } catch (error) {
                console.error('CopyBotUI: updateSubmenuIcons 실패', error);
            }
        },

        // === 커스텀 버튼 슬롯 UI ===

        CUSTOM_SLOT_MAX: 8,

        _customSlotRowHtml: function(i) {
            const actions = window.CopyBotActions?.list?.() || [];
            // 맨 위 "실리 메뉴" 묶음 + QR 세트 (shortcut.js), 그 아래 복사기 동작
            const shortcutOptions = window.CopyBotShortcut?.menuOptionsHtml?.() || '';
            const options = ['<option value="">(사용 안 함)</option>', shortcutOptions, '<optgroup label="복사기 동작">']
                .concat(actions.map(a => `<option value="${a.id}">${a.label}</option>`)).concat(['</optgroup>']).join('');
            return `
                <div class="copybot_custom_slot" data-slot="${i}">
                    <div class="fa-solid fa-circle copybot_icon_picker copybot_inline_icon_picker" id="copybot_custom_icon_picker_${i}" data-default="fa-circle" data-icon="fa-circle" title="클릭하여 아이콘 변경"></div>
                    <select class="text_pole copybot_custom_action">${options}</select>
                    <button type="button" class="copybot_custom_slot_remove" title="이 버튼 지우기">&times;</button>
                    <div class="copybot_custom_slot_options">
                        <label class="copybot_check_label" style="gap: 6px;">
                            <input type="checkbox" class="copybot_checkbox copybot_custom_submenu">
                            <span class="copybot_convenience_label">확장 내부</span>
                        </label>
                        <label class="copybot_check_label" style="gap: 6px;">
                            <input type="checkbox" class="copybot_checkbox copybot_custom_inputfield">
                            <span class="copybot_convenience_label">입력필드:</span>
                        </label>
                        <select class="text_pole copybot_convenience_select copybot_custom_position" disabled>
                            <option value="left">좌측</option>
                            <option value="right">우측</option>
                            <option value="bottom_left" selected>좌하단</option>
                            <option value="bottom_right">우상단</option>
                        </select>
                    </div>
                    <div class="copybot_custom_slot_desc"></div>
                </div>`;
        },

        // 슬롯 행 그리기: 기본 1칸. 이미 그려져 있으면 유지 (count 를 주면 그 수만큼)
        renderCustomSlots: function(count = 1) {
            try {
                const $container = $('#copybot_custom_slots');
                if ($container.length === 0 || $container.children('.copybot_custom_slot').length > 0) return;
                const n = Math.max(1, Math.min(this.CUSTOM_SLOT_MAX, count));
                for (let i = 0; i < n; i++) $container.append(this._customSlotRowHtml(i));
                this._updateCustomSlotButtons();
            } catch (error) {
                console.error('CopyBotUI: renderCustomSlots 실패', error);
            }
        },

        // 슬롯 한 칸 추가 (최대 CUSTOM_SLOT_MAX)
        addCustomSlot: function() {
            const $container = $('#copybot_custom_slots');
            const n = $container.children('.copybot_custom_slot').length;
            if (n >= this.CUSTOM_SLOT_MAX) { toastr.info(`커스텀 버튼은 최대 ${this.CUSTOM_SLOT_MAX}개까지입니다.`); return false; }
            $container.append(this._customSlotRowHtml(n));
            this._updateCustomSlotButtons();
            return true;
        },

        // 슬롯 삭제 (마지막 한 칸은 비우기만)
        removeCustomSlot: function($slot) {
            const $container = $('#copybot_custom_slots');
            if ($container.children('.copybot_custom_slot').length <= 1) {
                // 마지막 한 칸은 "지우기" = 완전 초기화 (직접 고른 아이콘도 함께. "(사용 안 함)" 으로 바꾸는 것과는 다름)
                $slot.find('.copybot_icon_picker').removeClass().addClass('fa-solid fa-circle copybot_icon_picker copybot_inline_icon_picker')
                    .data('icon', 'fa-circle').attr('data-default', 'fa-circle').data('customized', false);
                $slot.data('link', null);
                $slot.find('.copybot_custom_submenu, .copybot_custom_inputfield').prop('checked', false);
                $slot.find('.copybot_custom_position').val('bottom_left').prop('disabled', true);
                $slot.find('.copybot_custom_action').val('').trigger('change');
                return;
            }
            $slot.remove();
            // 번호 다시 매기기 (data-slot / 아이콘 피커 id)
            $container.children('.copybot_custom_slot').each(function(i) {
                $(this).attr('data-slot', i).find('.copybot_icon_picker').attr('id', `copybot_custom_icon_picker_${i}`);
            });
            this._updateCustomSlotButtons();
        },

        _updateCustomSlotButtons: function() {
            const n = $('#copybot_custom_slots').children('.copybot_custom_slot').length;
            $('#copybot_custom_slot_add').prop('disabled', n >= this.CUSTOM_SLOT_MAX).toggle(n < this.CUSTOM_SLOT_MAX);
        },

        // 저장된 슬롯 설정을 UI 에 반영 (settings.js 에서 호출)
        applyCustomSlotSettings: function(slots) {
            try {
                // 뒤쪽의 빈 칸은 정보가 없으니 떼고(구버전 4칸 고정 → 쓰던 칸만), 최소 1칸. 단 직접 고른 아이콘이 있는 칸은 "꺼 둔 칸"이라 남긴다
                const list = Array.isArray(slots) ? slots.slice() : [];
                while (list.length && !(list[list.length - 1]?.action) && list[list.length - 1]?.iconCustom !== true) list.pop();
                $('#copybot_custom_slots').empty();
                this.renderCustomSlots(Math.max(1, list.length));
                list.forEach((slot, i) => {
                    const $slot = $(`#copybot_custom_slots .copybot_custom_slot[data-slot="${i}"]`);
                    if ($slot.length === 0) return;
                    const sc = window.CopyBotShortcut;
                    const isShortcut = slot.action === 'st_menu' || slot.action === 'qr_set';
                    let link = isShortcut && slot.link && typeof slot.link === 'object' ? slot.link : null;
                    if (link && sc?.normalizeLink) link = sc.normalizeLink(link);     // 예전 구조(별도 '테마' 메뉴 등) → 현재 구조
                    let actionId = slot.action && window.CopyBotActions?.get(slot.action) ? slot.action : '';
                    if (isShortcut && (!sc || !link)) actionId = '';                 // 모듈이 없거나 고르기를 못 끝낸 바로가기 → 사용 안 함
                    const $select = $slot.find('.copybot_custom_action');
                    $select.val(actionId === 'st_menu' ? `st_menu:${link?.menu || ''}` : actionId);
                    if (actionId && !$select.val()) { actionId = ''; $select.val(''); }   // 드롭다운에 없는 값(모르는 메뉴 키 등) → 사용 안 함
                    $slot.data('link', actionId && isShortcut ? link : null).data('prevAction', $select.val() || '');
                    const desc = actionId && isShortcut ? sc.describe(actionId, link) : null;
                    const defaultIcon = actionId ? (desc ? desc.icon : window.CopyBotActions.defaultIcon(actionId)) : 'fa-circle';
                    const icon = slot.iconClass || defaultIcon;
                    $slot.find('.copybot_icon_picker')
                        .removeClass().addClass(`fa-solid ${icon} copybot_icon_picker copybot_inline_icon_picker`)
                        .data('icon', icon).attr('data-default', defaultIcon)
                        // 유저가 직접 고른 아이콘(iconCustom)은 대상·동작이 바뀌어도 유지. 구버전 저장본은 기본 아이콘과 다르면 직접 고른 것으로 봄
                        .data('customized', slot.iconCustom === true || (!!slot.iconClass && slot.iconClass !== defaultIcon));
                    // 위치·표시 설정은 "(사용 안 함)"으로 꺼 둔 칸에서도 미리 정할 수 있다 (동작만 없을 뿐, 설정은 그대로)
                    $slot.find('.copybot_custom_submenu').prop('checked', slot.submenu === true).prop('disabled', false);
                    $slot.find('.copybot_custom_inputfield').prop('checked', slot.inputfield === true).prop('disabled', false);
                    $slot.find('.copybot_custom_position').val(slot.position || 'bottom_left').prop('disabled', slot.inputfield !== true);
                    this._renderSlotDesc($slot, actionId, link);
                });
            } catch (error) {
                console.error('CopyBotUI: applyCustomSlotSettings 실패', error);
            }
        },

        // 슬롯 설명 줄: 일반 동작은 설명, 바로가기는 "무엇을 여는지" + [바꾸기]
        _renderSlotDesc: function($slot, actionId, link) {
            const $desc = $slot.find('.copybot_custom_slot_desc').empty();
            if (!actionId) return;
            const sc = window.CopyBotShortcut;
            const isShortcut = actionId === 'st_menu' || actionId === 'qr_set';
            const d = isShortcut && sc ? sc.describe(actionId, link) : null;
            $desc.text(d ? d.detail : (window.CopyBotActions?.get(actionId)?.desc || ''));
            if (d && sc.canReconfigure(actionId, link)) {
                $('<button type="button" class="menu_button copybot_sc_change" title="다시 고르기">바꾸기</button>').appendTo($desc);
            }
            if (d && d.hint) $('<div class="copybot_sc_hint"></div>').text(d.hint).appendTo($desc);     // 그 동작을 골랐을 때만 보이는 안내 한 줄
        },

        // 바로가기 고르기가 끝난 뒤(또는 토스트의 다시 고르기 뒤) 슬롯에 반영하고 저장 (shortcut.js 에서도 호출)
        commitSlotLink: function($slot, link) {
            try {
                const raw = String($slot.find('.copybot_custom_action').val() || '');
                const actionId = raw.startsWith('st_menu:') ? 'st_menu' : raw;
                if (actionId !== 'st_menu' && actionId !== 'qr_set') return;
                $slot.data('link', link).data('prevAction', raw);
                const d = window.CopyBotShortcut?.describe(actionId, link);
                const $picker = $slot.find('.copybot_icon_picker');
                if (d) {
                    $picker.attr('data-default', d.icon);            // 피커의 "기본값" = 이 대상의 실리 메뉴/확장 항목 아이콘 (동그라미 아님)
                    if (!$picker.data('customized')) {               // 유저가 직접 고른 아이콘은 대상이 바뀌어도 그대로
                        $picker.removeClass().addClass(`fa-solid ${d.icon} copybot_icon_picker copybot_inline_icon_picker`).data('icon', d.icon);
                    }
                }
                if (actionId === 'st_menu' && link?.menu) {
                    const want = `st_menu:${link.menu}`;
                    const $sel = $slot.find('.copybot_custom_action');
                    if ($sel.val() !== want) { $sel.val(want); $slot.data('prevAction', want); }
                }
                this._renderSlotDesc($slot, actionId, link);
                $slot.find('.copybot_custom_submenu, .copybot_custom_inputfield').prop('disabled', false);
                $slot.find('.copybot_custom_position').prop('disabled', !$slot.find('.copybot_custom_inputfield').is(':checked'));
                this.refreshCustomButtonTargets();
                if (callbacks.saveSettings) callbacks.saveSettings();
            } catch (error) {
                console.error('CopyBotUI: commitSlotLink 실패', error);
            }
        },

        // 실리 아이콘 피커(showFontAwesomePicker)의 검색칸은 autofocus 라 dialog 가 열리는 순간 포커스 → 폰 키보드가 바로 뜸.
        // ① dialog.showModal 을 피커가 열리는 동안만 감싸서, 열리기 "전에" 검색칸의 autofocus 를 떼고 inputmode=none 으로(포커스돼도 키보드 안 뜸)
        // ② 열린 뒤 유저가 검색칸을 직접 누르면 inputmode 를 되돌리고 그 탭으로 자연스럽게 포커스·키보드
        // ③ 안전망: 1.5초 동안 유저 터치 없이 검색칸에 포커스가 가면 즉시 blur
        // 반환: 정리 함수 (피커가 닫히면 호출)
        _suppressPickerAutofocus: function() {
            const SEL = 'dialog.popup input.faQuery';
            let userTouched = false;
            let armed = new WeakSet();
            // 피커의 "아이콘 없음/No Icon" 확인 버튼은 우리 쪽에선 "기본값"(기본 아이콘으로 되돌림) 의미
            const relabel = (dlg) => { try { const ok = dlg && dlg.querySelector('.popup-button-ok'); if (ok && ok.textContent.trim() !== '기본값') ok.textContent = '기본값'; } catch (e) { /* 무시 */ } };
            const arm = (input) => {
                if (!input || armed.has(input)) return;
                armed.add(input);
                relabel(input.closest('dialog.popup'));
                input.removeAttribute('autofocus');
                input.setAttribute('inputmode', 'none');
                input.addEventListener('pointerdown', () => {
                    userTouched = true;
                    input.removeAttribute('inputmode');
                    // 이미(키보드 없이) 포커스돼 있으면 한 번 풀어서, 이 탭이 새로 포커스하며 키보드를 띄우게 함
                    if (document.activeElement === input) input.blur();
                }, { capture: true });
            };
            const proto = window.HTMLDialogElement && HTMLDialogElement.prototype;
            const origShowModal = proto && proto.showModal;
            let stopped = false;
            let inert = false;      // 원복 뒤에는(원복을 못 한 경우에도) 래퍼가 아무 일도 하지 않고 원래 함수만 부른다
            let wrapper = null;
            if (origShowModal) {
                wrapper = function(...args) {
                    if (inert) return origShowModal.apply(this, args);
                    try { if (this.classList && this.classList.contains('popup')) arm(this.querySelector('input.faQuery')); } catch (e) { /* 무시 */ }
                    const r = origShowModal.apply(this, args);
                    try { const inp = this.querySelector && this.querySelector('input.faQuery'); if (inp && !userTouched && document.activeElement === inp) inp.blur(); } catch (e) { /* 무시 */ }
                    return r;
                };
                proto.showModal = wrapper;
            }
            // 원복은 "지금 걸려 있는 것이 우리 래퍼일 때만": 그 사이 다른 코드가 showModal 을 감쌌으면 그쪽을 덮어쓰지 않고 우리 래퍼만 비활성으로 둔다
            const restoreProto = () => { inert = true; if (wrapper && proto.showModal === wrapper) proto.showModal = origShowModal; };
            const started = Date.now();
            let seenAt = 0;
            const tick = () => {
                if (stopped) return;
                const inp = document.querySelector(SEL);
                if (inp) { if (!seenAt) seenAt = Date.now(); arm(inp); relabel(inp.closest('dialog.popup')); if (!userTouched && document.activeElement === inp) inp.blur(); }
                // 피커가 뜬 뒤 1.5초 동안 지킨다. 아직 안 떴으면(느린 기기에서 아이콘 목록을 받아 오는 중) 최대 10초까지 기다린다 — 그 전에 풀면 뜨는 순간 키보드가 올라옴
                const now = Date.now();
                if (seenAt ? now - seenAt < 1500 : now - started < 10000) requestAnimationFrame(tick);
                else restoreProto();
            };
            requestAnimationFrame(tick);
            return () => { stopped = true; restoreProto(); };
        },

        // ESC 로 오버레이/전체화면 닫기 — 처음 필요할 때 1회만 등록
        _escBound: false,
        ensureEscHandler: function() {
            if (this._escBound) return;
            this._escBound = true;
            $(document).off('keydown.copybot_overlay').on('keydown.copybot_overlay', function(e) {
                if (e.key !== 'Escape') return;
                if ($('#copybot_textbox_overlay').length) window.CopyBotUI.closeTextboxOverlay();
                // 전체 화면(showModal)의 ESC·뒤로가기는 dialog 의 cancel 이벤트가 처리한다(_captureModalDialog). 여기서는 showModal 이 안 돼 open 속성으로만 띄운 경우만 맡는다
                const dlg = document.getElementById('copybot_capture_dialog');
                if (dlg?.open && !dlg.__cbModal) window.CopyBotUI.shrinkCapturePreview();
            });
        },

        // === 결과 텍스트박스 크게 보기 오버레이 ===
        openTextboxOverlay: function() {
            if ($('#copybot_textbox_overlay').length) return;
            this.ensureEscHandler();
            const current = $('#copybot_textbox').val() || '';
            const $overlay = $(`
                <div id="copybot_textbox_overlay">
                    <div class="copybot_overlay_bar">
                        <span class="copybot_overlay_title">복사된 내용 (여기서 고치면 바로 반영됩니다)</span>
                        <button type="button" class="copybot_overlay_copy">클립보드 복사</button>
                        <button type="button" class="copybot_overlay_close">닫기</button>
                    </div>
                    <textarea spellcheck="false"></textarea>
                </div>`);
            $overlay.find('textarea').val(current);
            $('body').append($overlay);
        },

        closeTextboxOverlay: function() {
            $('#copybot_textbox_overlay').remove();
        },

        // 시작/종료 번호 칸의 예시(placeholder)를 현재 채팅방의 첫 번호·마지막 번호로 (텍스트 복사·캡처 모두)
        updateRangePlaceholders: function() {
            try {
                // 복사기 패널이 닫혀 있으면 건너뜀 (메시지마다 불필요한 DOM 접근 방지; 패널을 열 때 다시 갱신됨)
                if (!$('#copybot_settings .inline-drawer-content').is(':visible')) return;
                const ctx = window.SillyTavern?.getContext?.();
                const n = ctx?.chat?.length || 0;
                const first = n > 0 ? '0' : '';
                const last = n > 0 ? String(n - 1) : '';
                $('#copybot_start, #copybot_capture_start').attr('placeholder', first);
                $('#copybot_end, #copybot_capture_end').attr('placeholder', last);
            } catch (e) { /* 무시 */ }
        },

        // === 메인 모드 (텍스트 복사 / 캡처) ===
        setMode: function(mode, { save = true } = {}) {
            const m = mode === 'capture' ? 'capture' : 'text';
            $('#copybot_mode_toggle button').removeClass('active').filter(`[data-mode="${m}"]`).addClass('active');
            $('#copybot_mode_text').toggle(m === 'text');
            $('#copybot_mode_capture').toggle(m === 'capture');
            if (save && callbacks.saveSettings) callbacks.saveSettings();
            this.updateRangePlaceholders();
            // 캡처 모드로 들어오면 기록이 있을 때 미리보기를 묻지 않고 띄움 (✕ 로 닫아둔 경우는 제외). 캡처 화면이 안 보이면(패널 닫힌 채 설정 로드) 타이머도 걸지 않는다 — 패널을 열 때 다시 시도함
            if (m === 'capture' && $('#copybot_mode_capture').is(':visible')) setTimeout(() => { try { window.CopyBotCapture?.autoOpenPreview?.(); } catch (e) { /* 무시 */ } }, 50);
        },

        // === 캡처: 패널의 결과 썸네일 (이미지를 만든 뒤) ===
        // 만든 이미지 썸네일 상자는 없앰(미리보기 = 결과물, 중복이었음). 호환용으로 상태줄 문구만 갱신
        renderCaptureThumbs: function(result) {
            const total = result?.images?.length || 0;
            if (total > 1) $('#copybot_capture_status').text(`이미지 ${total}장 준비됨 (#${result.start}~#${result.end})`).css('color', '#48bb78');
        },

        // 요소 목록 (미리보기 상자 안): 종류마다 한 줄. "무엇이 어디서 빠져 있는지 보여 주고 푸는 곳" (2026-10-12 유저 확정)
        //  체크 = 이번 캡처에 넣음. 끄면 이번 미리보기에서만 빠진다(저장 안 함). 켜면 그 종류를 빼던 설정을 전부 푼다.
        //  압정 = 이 봇에서 항상 빼기(저장). [모든 봇 ×] = ⚙ 캡처 옵션의 공통 설정으로 빠져 있음(누르면 풂). [N개 따로 ×] = 하나씩 뺀 것 되살리기.
        //  지금 캡처 범위에 없는 종류도 이 봇에서 감지된 적이 있으면 남아 있고, 맨 끝 × 로 기록을 지운다.
        renderCaptureKinds: function() {
            const C = window.CopyBotCapture;
            const $wrap = $('.copybot_capture_kinds_wrap');
            const states = C?.kindStates ? C.kindStates() : [];
            const $toggle = $('.copybot_capture_box .copybot_overlay_kinds_toggle');
            if (!states.length) { $wrap.hide(); $toggle.hide(); return; }
            const esc = (s) => (callbacks.escapeHtml ? callbacks.escapeHtml(String(s ?? '')) : String(s ?? ''));
            const key = C.currentCharKey();
            const $list = $('.copybot_capture_kinds').empty();
            $toggle.show();
            // 묶음은 요소의 성격: 공통(어느 봇에나 있는 종류) / 봇별(이 봇에만 있는 블록) — 익명화 섹션과 같은 뱃지·색
            const groups = [
                { badge: '공통', title: '어느 봇에나 있는 요소', cls: 'copybot_rule_group--global', items: states.filter(s => s.fixed) },
                { badge: '봇별', title: C.currentCharLabel(), cls: 'copybot_rule_group--char', items: states.filter(s => !s.fixed) },
            ];
            groups.forEach(g => {
                if (!g.items.length) return;
                const $group = $(`<div class="copybot_capture_kind_group ${g.cls}"><div class="copybot_capture_kind_group_title"><span class="copybot_rule_badge">${esc(g.badge)}</span>${esc(g.title)}</div><div class="copybot_capture_kinds_row"></div></div>`);
                const $row = $group.find('.copybot_capture_kinds_row');
                g.items.forEach(st => {
                    const k = esc(st.kind);
                    const absent = st.count === 0;
                    const marks = [];
                    if (st.solo) marks.push(`<button type="button" class="copybot_capture_kind_chip" data-act="solo" data-kind="${k}" title="하나씩 따로 뺀 것을 되살립니다">${st.solo}개 따로 ×</button>`);
                    if (st.global) marks.push(`<button type="button" class="copybot_capture_kind_chip" data-act="global" data-kind="${k}" title="모든 봇에서 항상 빼는 중입니다(캡처 옵션과 같은 설정). 누르면 풉니다">모든 봇 ×</button>`);
                    if (key) marks.push(`<button type="button" class="copybot_capture_kind_pin fa-solid fa-thumbtack${st.bot ? ' copybot_capture_kind_pin_on' : ''}" data-act="bot" data-kind="${k}" title="${st.bot ? '이 봇에서 항상 빼는 중입니다. 누르면 풉니다' : '이 봇에서 항상 빼기'}"></button>`);
                    if (key && absent) marks.push(`<button type="button" class="copybot_capture_kind_forget fa-solid fa-xmark" data-act="forget" data-kind="${k}" title="이 봇의 기록에서 지우기 (다시 감지되면 다시 생깁니다)"></button>`);
                    $row.append(`
                        <div class="copybot_capture_kind_line${absent ? ' copybot_capture_kind_line--absent' : ''}">
                            <label class="copybot_capture_kind" title="체크 = 이번 캡처에 넣음">
                                <input type="checkbox" class="copybot_checkbox" data-kind="${k}" ${st.hidden ? '' : 'checked'} ${absent ? 'disabled' : ''}>
                                <span>${esc(C.kindLabel(st.kind))}</span><small>${absent ? '(이번 캡처에 없음)' : `(${st.count})`}</small>
                            </label>
                            <span class="copybot_capture_kind_marks">${marks.join('')}</span>
                        </div>`);
                });
                $list.append($group.clone());
            });
            // 상자가 보이는 상태(요소 버튼으로 연 상태)는 유지, 닫혀 있으면 그대로
        },

        // 상단바 ↶ ↷ 활성/비활성 (요소 넣고 빼기 되돌리기 스택 상태)
        renderCaptureHistory: function() {
            const st = window.CopyBotCapture?.hideHistoryState ? window.CopyBotCapture.hideHistoryState() : { canUndo: false, canRedo: false };
            $('.copybot_capture_box .copybot_overlay_undo').toggleClass('copybot_overlay_icon_disabled', !st.canUndo);
            $('.copybot_capture_box .copybot_overlay_redo').toggleClass('copybot_overlay_icon_disabled', !st.canRedo);
        },

        clearCapturePreview: function() {
            window.CopyBotCapture?.clearResult();
            $('#copybot_capture_status').text('').css('color', '');
        },

        // === 입력필드 아이콘 순서 (유저 우선순위) ===
        ICON_ORDER_DEFAULT: ['quickmenu', 'ghostwrite', 'tag_remove', 'delete', 'custom', 'delete_regenerate'],
        ICON_ORDER_LABELS: { quickmenu: '퀵메뉴', ghostwrite: '대필', tag_remove: '태그 제거', delete: '삭제', custom: '커스텀 버튼', delete_regenerate: '삭제 후 재생성' },
        _normalizeIconOrder: function(order) {
            const def = this.ICON_ORDER_DEFAULT;
            const list = Array.isArray(order) ? order.filter(k => def.includes(k)) : [];
            def.forEach(k => { if (!list.includes(k)) list.push(k); });   // 빠진 키는 기본 순서로 뒤에
            return list;
        },
        renderIconOrderList: function(order) {
            const $list = $('#copybot_icon_order_list');
            if (!$list.length) return;
            const list = this._normalizeIconOrder(order);
            $list.empty();
            list.forEach((key, i) => {
                const up = i === 0 ? '' : '<button type="button" class="copybot_icon_move_up" title="위로">↑</button>';
                const down = i === list.length - 1 ? '' : '<button type="button" class="copybot_icon_move_down" title="아래로">↓</button>';
                $list.append(`<li class="copybot_reorder_item copybot_icon_order_row" data-key="${key}"><span class="copybot_reorder_name">${i + 1}. ${this.ICON_ORDER_LABELS[key] || key}</span><div class="copybot_reorder_buttons">${up}${down}</div></li>`);
            });
        },
        readIconOrder: function() {
            const keys = $('#copybot_icon_order_list .copybot_icon_order_row').map(function() { return $(this).attr('data-key'); }).get();
            return keys.length ? this._normalizeIconOrder(keys) : null;
        },
        // icons.js 가 쓰는 순서 (DOM 없으면 기본)
        getIconOrder: function() {
            return this.readIconOrder() || this.ICON_ORDER_DEFAULT.slice();
        },

        // 살아있는 미리보기 컨테이너 두 곳: 패널 안 상자(#copybot_capture_inline, 기본) / body 의 전체화면 <dialog>(크게 보기).
        // 둘 사이를 오갈 때는 미리보기를 현재 상태 그대로 다시 스냅샷해 옮긴다 (capture.js movePreview). holder 요소를 돌려줌
        _captureModalDialog: function() {
            let dlg = document.getElementById('copybot_capture_dialog');
            if (dlg) return dlg;
            this.ensureEscHandler();
            dlg = $(`
                <dialog id="copybot_capture_dialog" class="copybot_capture_box copybot_capture_modal">
                    <div class="copybot_overlay_bar copybot_overlay_bar_top">
                        <span class="copybot_overlay_title">캡처 미리보기 <small class="copybot_capture_range_label"></small></span>
                        <span class="copybot_overlay_history">
                            <div class="copybot_overlay_icon copybot_overlay_undo copybot_overlay_icon_disabled fa-solid fa-rotate-left" title="요소 넣고 빼기 되돌리기"></div>
                            <div class="copybot_overlay_icon copybot_overlay_redo copybot_overlay_icon_disabled fa-solid fa-rotate-right" title="다시 하기"></div>
                        </span>
                        <div class="copybot_overlay_icon copybot_overlay_gear fa-solid fa-gear" title="캡처 옵션 (상태창·선택지·이미지·표시 요소·익명화·품질)"></div>
                        <div class="copybot_overlay_icon copybot_overlay_shrink fa-solid fa-down-left-and-up-right-to-center" title="패널 안으로 작게 보기"></div>
                        <div class="copybot_overlay_icon copybot_overlay_clear copybot_overlay_icon_danger fa-solid fa-trash-can" title="비우기 (미리보기·기록·만든 이미지 전부)"></div>
                    </div>
                    <div class="copybot_overlay_bar">
                        <button type="button" class="copybot_overlay_kinds_toggle" title="캡처에 넣을 요소 고르기">요소</button>
                        <button type="button" class="copybot_overlay_copy" title="미리보기 그대로 이미지를 만들어 클립보드에 복사">클립보드 복사</button>
                        <button type="button" class="copybot_overlay_save" title="미리보기 그대로 이미지를 만들어 PNG 저장 (여러 장이면 폴더 zip)">PNG 저장</button>
                        <small class="copybot_capture_hint">요소를 꾹 누르면 빼기 메뉴</small>
                    </div>
                    <div class="copybot_capture_kinds_wrap" style="display: none;">
                        <div class="copybot_rule_group_title">캡처에 넣을 요소 <small>— 체크 = 넣음, 바로 반영</small></div>
                        <div class="copybot_capture_kinds"></div>
                        <div class="copybot_description" style="margin-top: 4px; font-size: 11px; line-height: 1.5; opacity: 0.8;">
                            체크를 끄면 이번 미리보기에서만 빠지고 설정은 바뀌지 않습니다. 압정을 켜면 이 봇에서 항상 빠집니다. 모든 봇에 적용되는 설정은 캡처 옵션에서 바꿉니다. 미리보기에서 요소를 꾹 누르면 하나만 빼거나 항상 빼도록 고정할 수 있고, 상단 ↶ ↷ 로 되돌릴 수 있습니다.
                        </div>
                    </div>
                    <div class="copybot_capture_overlay_body"><div class="copybot_capture_frame_holder"></div></div>
                </dialog>`)[0];
            document.body.appendChild(dlg);
            // ESC·폰 뒤로가기(네이티브 cancel): 그대로 닫히게 두면 미리보기가 닫힌 dialog 안에 갇힌다 → 닫기를 막고, 패널 안 상자로 옮긴 뒤 직접 닫는다.
            // cancel 은 버블링하지 않아 document 위임으로는 못 잡으므로 dialog 에 직접 건다.
            // 이미지 만드는 중이면 shrinkCapturePreview 가 안내 토스트만 한 번 띄우고 그대로 둔다(닫지 않음)
            dlg.addEventListener('cancel', (e) => {
                e.preventDefault();
                dlg.__cbCancelAt = Date.now();
                window.CopyBotUI.shrinkCapturePreview();
            });
            dlg.addEventListener('close', () => {
                const UI = window.CopyBotUI;
                UI._restoreCapturePanel(); UI.liftToasts();   // 어떤 경로로 닫혀도 옵션 패널·토스트는 제자리로
                // 안전망: 브라우저가 cancel 의 preventDefault 를 받아 주지 않고(연속 뒤로가기 등) 그대로 닫았는데 미리보기가 닫힌 dialog 안에 남아 있는 경우
                const byCancel = !!dlg.__cbCancelAt && Date.now() - dlg.__cbCancelAt < 1500;
                dlg.__cbCancelAt = 0;
                const C = window.CopyBotCapture;
                if (!byCancel || !C?.hasPreview?.() || !dlg.querySelector('.copybot_capture_frame_holder iframe')) return;
                if (C.isBusy?.()) { UI._showCaptureDialog(dlg); UI.liftToasts(); }   // 이미지 만드는 중: 미리보기를 떼면 렌더가 깨지므로 다시 연다
                else UI.shrinkCapturePreview();                                       // 그 밖: 패널 안 상자로 꺼낸다
            });
            return dlg;
        },

        // 전체 화면 dialog 열기. showModal 이 안 되는 환경이면 open 속성으로만 띄운다 (그때는 cancel 이벤트가 없어 ESC 를 ensureEscHandler 가 맡음)
        _showCaptureDialog: function(dlg) {
            if (!dlg || dlg.open) return;
            try { dlg.showModal(); dlg.__cbModal = true; } catch (e) { dlg.setAttribute('open', ''); dlg.__cbModal = false; }
        },

        // 크게보기 <dialog>(showModal → top layer)가 열려 있는 동안엔 body 의 토스트(#toast-container)가 그 뒤에 가려진다.
        // 열려 있으면 토스트 상자를 dialog 안으로 옮기고, 닫혔는데 아직 그 안에 있으면 body 로 되돌린다 (실리 fixToastrForDialogs 와 같은 방식).
        // 토스트를 띄운 직후·dialog 를 열고 닫은 직후에 부른다. 옵저버·타이머 없음.
        liftToasts: function() {
            try {
                const dlg = document.getElementById('copybot_capture_dialog');
                const tc = document.getElementById('toast-container');
                if (!dlg || !tc) return;
                if (dlg.open) {
                    // 이미 열린 dialog(우리 것이든, 그 위에 뜬 실리 팝업이든) 안에 있으면 그대로 둔다
                    if (!tc.closest('dialog[open]')) dlg.appendChild(tc);
                } else if (dlg.contains(tc)) {
                    document.body.appendChild(tc);
                }
            } catch (e) { /* 무시 */ }
        },

        // 크게 보기 헤더 톱니: 설정의 캡처 옵션 패널(#copybot_capture_panel)을 복제하지 않고 dialog 안으로 잠시 옮긴다 (id 중복 방지, 핸들러 그대로)
        toggleCaptureOptionsPopup: function(force) {
            const dlg = document.getElementById('copybot_capture_dialog');
            const panel = document.getElementById('copybot_capture_panel');
            if (!dlg || !panel) return;
            let pop = dlg.querySelector('.copybot_overlay_options');
            const isOpen = !!pop && $(pop).is(':visible');
            const open = force === undefined ? !isOpen : !!force;
            if (!open) { if (pop) $(pop).hide(); this._restoreCapturePanel(); return; }
            if (!pop) {
                pop = $(`
                    <div class="copybot_overlay_options">
                        <div class="copybot_overlay_options_head"><span>캡처 옵션 <small style="font-weight:400;opacity:.75">바꾸면 미리보기에 바로 반영</small></span><div class="copybot_overlay_icon copybot_overlay_options_close fa-solid fa-xmark" title="닫기"></div></div>
                        <div class="copybot_overlay_options_body"></div>
                    </div>`)[0];
                dlg.insertBefore(pop, dlg.querySelector('.copybot_capture_overlay_body'));
            }
            if (!panel.__cbHome) {
                panel.__cbHome = document.createComment('copybot_capture_panel_home');
                panel.parentNode.insertBefore(panel.__cbHome, panel);
                panel.__cbWasVisible = $(panel).is(':visible');
            }
            pop.querySelector('.copybot_overlay_options_body').appendChild(panel);
            $(panel).show();
            $(pop).show();
            $(dlg).find('.copybot_overlay_gear').addClass('active');
        },
        _restoreCapturePanel: function() {
            const panel = document.getElementById('copybot_capture_panel');
            const dlg = document.getElementById('copybot_capture_dialog');
            if (dlg) { $(dlg).find('.copybot_overlay_options').hide(); $(dlg).find('.copybot_overlay_gear').removeClass('active'); }
            if (!panel || !panel.__cbHome) return;
            const home = panel.__cbHome;
            if (!home.parentNode) return;   // 제자리 표식이 문서에서 떨어져 나간 경우: 돌려놓을 곳이 없으니 그대로 둔다 (예외로 닫기 흐름이 끊기지 않게)
            home.parentNode.insertBefore(panel, home);
            home.remove();
            panel.__cbHome = null;
            $(panel).toggle(!!panel.__cbWasVisible);
            $('#copybot_capture_settings_button').toggleClass('active', !!panel.__cbWasVisible);
        },

        // mode: 'inline'(패널 안) | 'modal'(전체 화면). 패널이 안 보이면(커스텀 버튼 등) 자동으로 modal
        openCaptureOverlay: function(mode) {
            // 전체 화면이 이미 열려 있으면 그 안에서 다시 그린다 (전체 화면의 ⚙ 에서 익명화 규칙을 바꾸면 패널 안 상자로 다시 그려지며 전체 화면이 닫히던 문제)
            if (!mode) mode = (document.getElementById('copybot_capture_dialog')?.open || !$('#copybot_mode_capture').is(':visible')) ? 'modal' : 'inline';
            if (mode === 'modal') {
                const dlg = this._captureModalDialog();
                $('#copybot_capture_inline').hide().find('.copybot_capture_frame_holder').empty();
                this._showCaptureDialog(dlg);
                this.liftToasts();   // 이미 떠 있는 토스트가 전체 화면 뒤에 가려지지 않게
                dlg.scrollTop = 0;
                $(dlg).find('.copybot_capture_kinds_wrap').hide();
                return dlg.querySelector('.copybot_capture_frame_holder');
            }
            const box = document.getElementById('copybot_capture_inline');
            if (!box) return null;
            $(box).show().removeClass('copybot_capture_box_collapsed');
            $(box).find('.copybot_capture_box_body').show();
            $(box).find('.copybot_overlay_collapse, .copybot_overlay_expand, .copybot_overlay_history').show();
            $(box).find('.copybot_overlay_reopen').hide();
            $(box).find('.copybot_capture_kinds_wrap').hide();
            this.updateCaptureRangeLabel();
            return box.querySelector('.copybot_capture_frame_holder');
        },

        // 접힌 상자: 헤더(제목·펼치기·비우기)만 남김
        collapseCaptureBox: function() {
            const dlg = document.getElementById('copybot_capture_dialog');
            if (dlg) { if (dlg.open) dlg.close(); dlg.querySelector('.copybot_capture_frame_holder').innerHTML = ''; this.liftToasts(); }
            const box = document.getElementById('copybot_capture_inline');
            if (!box) return;
            $(box).show().addClass('copybot_capture_box_collapsed');
            $(box).find('.copybot_capture_frame_holder').empty();
            $(box).find('.copybot_capture_box_body').hide();
            $(box).find('.copybot_overlay_collapse, .copybot_overlay_expand, .copybot_overlay_history').hide();
            $(box).find('.copybot_overlay_reopen').show();
            this.updateCaptureRangeLabel();
        },

        updateCaptureRangeLabel: function() {
            const r = window.CopyBotCapture?.lastRange;
            $('.copybot_capture_range_label').text(r ? `#${r.s}~#${r.e}` : '');
        },

        expandCapturePreview: async function() {
            const C = window.CopyBotCapture;
            if (!C?.hasPreview?.()) return;
            // 이미지 만드는 중엔 옮기지 않는다 (옮기기 = 재스냅샷이라 렌더가 쓰는 미리보기가 사라짐). 안내는 movePreview 와 같은 문구
            if (C.isBusy?.()) { toastr.warning('이미지 만드는 중입니다. 끝나거나 중단한 뒤 다시 눌러 주십시오.'); this.liftToasts(); return; }
            const dlg = this._captureModalDialog();
            this._showCaptureDialog(dlg);
            this.liftToasts();
            dlg.scrollTop = 0;
            $(dlg).find('.copybot_capture_kinds_wrap').hide();
            let moved = false;
            try { moved = await C.movePreview(dlg.querySelector('.copybot_capture_frame_holder')); }
            catch (error) {
                // 옮기다 실패: 미리보기가 사라졌으면 빈 전체 화면을 남기지 않고 닫는다 (기록은 남아 캡처 버튼으로 다시 열 수 있음)
                console.error('깡갤 복사기: 미리보기 옮기기 실패', error);
                toastr.error('미리보기를 옮기지 못했습니다. 캡처를 다시 눌러 주십시오.');
                if (!C.hasPreview?.()) { this.closeCaptureOverlay(); return; }
            }
            // 못 옮겼으면(채팅이 바뀌어 닫혔거나 그 사이 렌더 시작) 패널 안 미리보기를 비우지 않고 전체 화면만 닫는다
            if (!moved) { if (dlg.open && !dlg.querySelector('.copybot_capture_frame_holder iframe')) dlg.close(); return; }
            $('#copybot_capture_inline').hide().find('.copybot_capture_frame_holder').empty();
        },
        shrinkCapturePreview: async function() {
            // ESC keydown·네이티브 cancel·축소 버튼이 겹쳐 불려도 한 번만 (옮기는 도중 다시 들어오면 서로의 화면을 떼어냄)
            if (this._shrinking) return;
            this._shrinking = true;
            try {
                const C = window.CopyBotCapture;
                const dlg = document.getElementById('copybot_capture_dialog');
                if (!C?.hasPreview?.()) { if (dlg?.open) dlg.close(); return; }
                // 이미지 만드는 중엔 옮기지 않는다 (전체 화면의 미리보기를 떼어내면 렌더가 깨짐)
                if (C.isBusy?.()) { toastr.warning('이미지 만드는 중입니다. 끝나거나 중단한 뒤 다시 눌러 주십시오.'); this.liftToasts(); return; }
                const holder = this.openCaptureOverlay('inline');   // 상자 펼친 상태로 (접힘 해제 포함)
                if (!holder) { if (dlg?.open) dlg.close(); return; }   // 패널 안 상자가 없는 비정상 상태: 닫기를 막아 둔 채로 갇히지 않게 전체 화면만 닫는다
                let moved = false;
                try { moved = await C.movePreview(holder); }
                catch (error) {
                    console.error('깡갤 복사기: 미리보기 옮기기 실패', error);
                    toastr.error('미리보기를 옮기지 못했습니다. 캡처를 다시 눌러 주십시오.');
                }
                // 못 옮겼는데 미리보기가 아직 전체 화면에 살아 있으면 그대로 둔다 (떼어내지 않음)
                if (!moved && C.hasPreview?.() && dlg?.querySelector('.copybot_capture_frame_holder iframe')) { $('#copybot_capture_inline').hide(); this.liftToasts(); return; }
                if (dlg) { if (dlg.open) dlg.close(); dlg.querySelector('.copybot_capture_frame_holder').innerHTML = ''; this.liftToasts(); }
                // 옮기다 미리보기가 사라졌으면(실패·채팅 바뀜) 빈 상자를 남기지 않는다
                if (!moved && !C.hasPreview?.()) $('#copybot_capture_inline').hide().find('.copybot_capture_frame_holder').empty();
            } finally {
                this._shrinking = false;
            }
        },

        closeCaptureOverlay: function() {
            this._restoreCapturePanel();
            const dlg = document.getElementById('copybot_capture_dialog');
            if (dlg) { if (dlg.open) dlg.close(); dlg.querySelector('.copybot_capture_frame_holder').innerHTML = ''; this.liftToasts(); }
            $('#copybot_capture_inline').hide().find('.copybot_capture_frame_holder').empty();
            $('#copybot_capture_overlay').remove();   // 구버전 오버레이 잔재
        },

        // === 캡처 익명화 규칙 목록 UI ===

        _ruleRowHtml: function(from = '', to = '', scope = 'global') {
            const esc = (s) => (callbacks.escapeHtml ? callbacks.escapeHtml(String(s ?? '')) : String(s ?? ''));
            // 예시는 흐린 placeholder 로 딱 예시만 (모바일에서 안 잘리게 짧게)
            const ex = scope === 'char' ? { from: '홍길동', to: '🤖' } : { from: '김깡캐', to: 'ㅇㅇ' };
            return `
                <div class="copybot_rule_row">
                    <input type="text" class="text_pole copybot_rule_from" placeholder="${ex.from}" value="${esc(from)}">
                    <span class="copybot_rule_arrow">→</span>
                    <input type="text" class="text_pole copybot_rule_to" placeholder="${ex.to}" value="${esc(to)}">
                    <span class="copybot_rule_remove fa-solid fa-xmark" title="이 규칙 삭제"></span>
                </div>`;
        },

        // 규칙 목록 그리기 (항상 최소 1줄)
        renderCaptureRules: function(scope, rules) {
            const $list = $(`#copybot_capture_rules_${scope}`);
            if (!$list.length) return;
            $list.empty();
            // 봇별 목록에는 "어느 캐릭터의 규칙을 그렸는지" 표식 — settings.js(저장)·capture.js(읽기)가 지금 캐릭터와 다르면 이 목록을 믿지 않는다.
            // 캐릭터가 없을 때도 빈 값이 아니라 '(none)' 을 찍는다: 빈 값은 "표식 없음"으로 취급돼, 캐릭터 없이 그린 빈 목록이 다음 캐릭터의 규칙을 지울 수 있음
            if (scope === 'char') $list.attr('data-char-key', window.CopyBotCapture?.currentCharKey?.() || '(none)');
            const list = Array.isArray(rules) && rules.length ? rules : [{ from: '', to: '' }];
            list.forEach(r => $list.append(this._ruleRowHtml(r.from, r.to, scope)));
        },

        // 규칙 목록 읽기 (원문이 비어있는 줄은 제외)
        readCaptureRules: function(scope) {
            const rules = [];
            $(`#copybot_capture_rules_${scope} .copybot_rule_row`).each(function() {
                const from = String($(this).find('.copybot_rule_from').val() || '').trim();
                const to = String($(this).find('.copybot_rule_to').val() || '');
                if (from) rules.push({ from, to });
            });
            return rules;
        },

        // 현재 캐릭터(또는 그룹)에 맞는 캐릭터별 규칙 표시
        refreshCaptureCharScope: function() {
            const key = window.CopyBotCapture?.currentCharKey?.() || null;
            const label = window.CopyBotCapture?.currentCharLabel?.() || '(캐릭터 없음)';
            $('#copybot_capture_char_name').text(label);
            const rules = key && window.CopyBotSettings?.getCaptureCharRules ? window.CopyBotSettings.getCaptureCharRules(key) : [];
            this.renderCaptureRules('char', rules);
            $('#copybot_capture_rules_char, .copybot_rule_add[data-scope="char"]').toggle(!!key);
        },

        // 커스텀 슬롯 변경 → 소메뉴·입력필드·퀵/플로팅 메뉴 모두 갱신
        refreshCustomButtonTargets: function() {
            this.updateSubmenuIcons();
            if (window.CopyBotIcons?.updateInputFieldIcons) window.CopyBotIcons.updateInputFieldIcons();
            if (window.CopyBotWandMenu?.refreshCustomSections) window.CopyBotWandMenu.refreshCustomSections();
        },

        // === 이벤트 핸들링 ===
        
        // UI 이벤트 설정 함수 (리스너 중복 방지 강화)
        setupEventHandlers: function() {
            if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '깡갤 복사기: 이벤트 핸들러 설정 시작');

            // 소메뉴 버튼 active 상태 업데이트 함수
            function updateSubmenuButtonStates(activeButtonId) {
                // 모든 소메뉴 버튼에서 active 클래스 제거
                $('.copybot_settings_button').removeClass('active');
                
                // 클릭된 버튼에만 active 클래스 추가 (패널이 보이는 경우에만)
                if (activeButtonId) {
                    const activePanel = `#copybot_${activeButtonId.replace('copybot_open_', '').replace('_button', '')}_panel`;
                    if ($(activePanel).is(':visible')) {
                        $('#' + activeButtonId).addClass('active');
                    }
                }
                
                if (callbacks.debugLog && isDebugMode) {
                    callbacks.debugLog(true, '소메뉴 버튼 active 상태 업데이트:', activeButtonId);
                }
            }

            // ---------------------------------------------
            // --- 프리셋 관리 이벤트 핸들러 (신규/수정) ---
            // ---------------------------------------------

            // 편집 모드 시작 (⚙️ 아이콘)
            $(document).off('click', '#copybot_preset_edit').on('click', '#copybot_preset_edit', function() {
                // 비활성화된 상태면 클릭 무시
                if ($(this).hasClass('disabled')) {
                    return false;
                }
                
                // 기본 프리셋 편집 시도 시 추가 차단
                const selectedPreset = $('#copybot_preset_select').val();
                if (selectedPreset === '기본 프리셋') {
                    toastr.warning('기본 프리셋은 편집할 수 없습니다.');
                    return false;
                }
                
                if (callbacks.enterPresetEditMode) callbacks.enterPresetEditMode();
            });

            // 편집 취소 (❌ 아이콘)
            $(document).off('click', '#copybot_preset_cancel').on('click', '#copybot_preset_cancel', () => {
                if (callbacks.exitPresetEditMode) callbacks.exitPresetEditMode(true);
            });

            // 프리셋 선택 또는 관리 기능 실행 (드롭다운) - 즉시 활성화 기능 추가
            $(document).off('change', '#copybot_preset_select').on('change', '#copybot_preset_select', function() {
                const selectedValue = $(this).val();
                // 관리 메뉴 선택 전의 원래 선택된 값을 data 속성에서 가져오기
                const originalValue = $(this).data('previousValue') || '기본 프리셋';

                if (selectedValue === '__add__') {
                    if (callbacks.addNewPreset) callbacks.addNewPreset();
                } else if (selectedValue === '__reorder__') {
                    $(this).val(originalValue); // 드롭다운 값 원상복구
                    if (callbacks.openReorderModal) callbacks.openReorderModal();
                } else if (selectedValue === '__copy__') {
                    // 드롭다운 값을 원래대로 돌려놓고 복사 함수 실행
                    $(this).val(originalValue);
                    if (callbacks.copyCurrentPreset) callbacks.copyCurrentPreset();
                } else {
                    // 일반 프리셋 선택 - 현재 값을 data 속성에 저장
                    $(this).data('previousValue', selectedValue);
                    
                    // 프리셋 로드 전에 프로필 목록 최신 상태 확인
                    const profileSelect = $('#copybot_ghostwrite_profile_select');
                    if (profileSelect.find('option').length <= 1) {
                        if (callbacks.loadGhostwriteProfiles) callbacks.loadGhostwriteProfiles();
                    }
                    
                    // 프리셋 로드 (프로필 포함)
                    if (callbacks.loadPreset) callbacks.loadPreset(selectedValue);
                    
                    // 🔥 9단계 신규: 프리셋 선택 즉시 활성 프리셋으로 설정
                    if (callbacks.setActivePreset) callbacks.setActivePreset(selectedValue);
                    if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '프리셋 선택과 동시에 활성 프리셋으로 설정:', selectedValue);
                    
                    if (callbacks.updatePresetDropdown) callbacks.updatePresetDropdown();
                    if (callbacks.updatePresetEditButtonState) callbacks.updatePresetEditButtonState();
                    
                    // 편집 모드일 때 추가 처리 (presets 모듈에서 상태 확인)
                    if (callbacks.isEditMode && callbacks.isEditMode()) {
                        $('#copybot_preset_rename_input').val(selectedValue);
                        // 기본 프리셋이 아닐 때만 삭제 버튼 표시
                        if (selectedValue && selectedValue !== '기본 프리셋') {
                            $('#copybot_preset_delete').show();
                        } else {
                            $('#copybot_preset_delete').hide();
                        }
                    }
                    
                    if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '프리셋 선택 및 로드 완료:', selectedValue);
                }
            });

            // 이름 변경 저장 (✔️ 아이콘)
            $(document).off('click', '#copybot_preset_confirm').on('click', '#copybot_preset_confirm', () => {
                const oldName = $('#copybot_preset_select').val();
                const newName = $('#copybot_preset_rename_input').val().trim();
                
                if (!oldName) {
                    toastr.warning('이름을 변경할 프리셋이 선택되지 않았습니다.');
                    return;
                }
                if (!newName) {
                    toastr.error('프리셋 이름은 비워둘 수 없습니다.');
                    return;
                }
                
                // 기본 프리셋 이름 변경 방지
                if (oldName === '기본 프리셋') {
                    toastr.warning('기본 프리셋의 이름은 변경할 수 없습니다.');
                    return;
                }
                
                if (callbacks.renamePreset && callbacks.renamePreset(oldName, newName)) {
                    // 핵심 수정: 활성 프리셋 이름도 함께 업데이트
                    if (callbacks.setActivePreset) callbacks.setActivePreset(newName);
                    // 이름은 그대로 넘기고 이스케이프는 토스트에 맡긴다 (직접 이스케이프한 뒤 넘기면 실리 토스트가 한 번 더 해 &#039; 같은 글자가 그대로 보임)
                    toastr.success(`'${oldName}' -> '${newName}'(으)로 이름이 변경되었습니다.`, '', { escapeHtml: true });
                    if (callbacks.exitPresetEditMode) callbacks.exitPresetEditMode(true);
                    $('#copybot_preset_select').val(newName); // 변경된 이름으로 선택 유지
                }
            });

            // 프리셋 삭제 (🗑️ 아이콘)
            $(document).off('click', '#copybot_preset_delete').on('click', '#copybot_preset_delete', () => {
                const nameToDelete = $('#copybot_preset_select').val();
                if (!nameToDelete) {
                    toastr.warning('삭제할 프리셋이 선택되지 않았습니다.');
                    return;
                }
                
                if (confirm(`'${nameToDelete}' 프리셋을 정말 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
                    if (callbacks.deletePreset && callbacks.deletePreset(nameToDelete)) {
                        toastr.success(`'${nameToDelete}' 프리셋이 삭제되었습니다.`, '', { escapeHtml: true });
                        if (callbacks.exitPresetEditMode) callbacks.exitPresetEditMode(true);
                        $('#copybot_preset_select').val('기본 프리셋'); // 삭제 후 기본 프리셋으로 선택
                    }
                    // deletePreset 함수에서 false 반환 시 (기본 프리셋 삭제 시도) 에러 메시지가 이미 표시됨
                }
            });

            // 순서 변경 모달의 저장/취소 버튼
            $(document).off('click', '#copybot_reorder_save').on('click', '#copybot_reorder_save', () => {
                const newOrder = [];
                $('#copybot_reorder_list').find('li').each(function() {
                    newOrder.push($(this).data('presetName'));
                });
                
                if (callbacks.reorderPresets) callbacks.reorderPresets(newOrder);
                toastr.success('프리셋 순서가 저장되었습니다.');
                if (callbacks.updatePresetDropdown) callbacks.updatePresetDropdown();
                if (callbacks.closeReorderModal) callbacks.closeReorderModal();
            });
            $(document).off('click', '#copybot_reorder_cancel').on('click', '#copybot_reorder_cancel', () => {
                if (callbacks.closeReorderModal) callbacks.closeReorderModal();
            });

            // --- 순서 변경: 위/아래 버튼 방식으로 변경 ---
            $(document).off('click', '.copybot_move_up').on('click', '.copybot_move_up', function(e) {
                e.preventDefault();
                const item = $(this).closest('li');
                const prevItem = item.prev();
                if (prevItem.length > 0) {
                    item.insertBefore(prevItem);
                }
            });
            
            $(document).off('click', '.copybot_move_down').on('click', '.copybot_move_down', function(e) {
                e.preventDefault();
                const item = $(this).closest('li');
                const nextItem = item.next();
                if (nextItem.length > 0) {
                    item.insertAfter(nextItem);
                }
            });

            // 프리셋 이름 변경 입력창에서 Enter 키로 저장
            $(document).off('keydown', '#copybot_preset_rename_input').on('keydown', '#copybot_preset_rename_input', function(e) {
                // Enter 키가 눌렸는지 확인 (keyCode 13은 Enter)
                if (e.key === 'Enter' || e.which === 13) {
                    // Enter 키의 기본 동작(예: 폼 제출)을 막습니다.
                    e.preventDefault();
                    
                    // 이미 만들어진 저장(확인) 버튼을 프로그래밍 방식으로 클릭하여
                    // 기존의 저장 로직을 그대로 재사용합니다.
                    $('#copybot_preset_confirm').click();
                }
            });

            // (예전 여기 있던 '#send_but.generation_progress' 클릭 핸들러는 삭제: 그 클래스는 실리에도 복사기에도 없어 한 번도 실행되지 않았다.
            //  대필 중단은 실리 정지 버튼 → ghostwrite.js 의 'Clicked stop button' 예외 경로가 프로필 원복까지 처리한다)

            // 번호 칸 읽기: 빈 칸 = null, 0 이상의 정수 = 그 숫자, 그 밖(음수·소수·1e3·글자) = NaN.
            // parseInt 는 '1.5'→1, '1e3'→1 처럼 조용히 다른 번호로 바꾸므로 쓰지 않는다 (숨기기·삭제 범위가 입력과 달라질 수 있음)
            const readIndex = (selector) => {
                const raw = String($(selector).val() ?? '').trim();
                if (raw === '') return null;
                return /^[0-9]{1,9}$/.test(raw) ? Number(raw) : NaN;
            };
            const BAD_INDEX_MSG = '메시지 번호는 0 이상의 정수로 입력해 주십시오.';
            // 숨기기·보이기·다중 삭제 공통: 두 칸 모두 정수여야 한다. 통과하면 [시작, 끝], 아니면 안내 뒤 null
            const readRange = (startSelector, endSelector) => {
                const startPos = readIndex(startSelector);
                const endPos = readIndex(endSelector);
                if (startPos === null || endPos === null) { toastr.error('올바른 시작 위치와 종료 위치를 숫자로 입력해 주십시오.'); return null; }
                if (Number.isNaN(startPos) || Number.isNaN(endPos)) { toastr.error(BAD_INDEX_MSG); return null; }
                return [startPos, endPos];
            };

            const eventMap = {
                '#copybot_execute': () => {
                    const startPos = readIndex('#copybot_start');
                    let endPos = readIndex('#copybot_end');
                    if (Number.isNaN(startPos) || Number.isNaN(endPos)) { toastr.error(BAD_INDEX_MSG); return; }

                    if (startPos === null || endPos === null) {
                        if (startPos === null) $("#copybot_start").val(0);
                        if (endPos === null) $("#copybot_end").val(callbacks.getLastMessageIndex ? callbacks.getLastMessageIndex() : 0);
                        toastr.info(`범위가 지정되지 않아 자동으로 전체 범위로 설정되었습니다. 다시 복사 버튼을 눌러 주십시오.`);
                        return;
                    }

                    const actualLastIndex = callbacks.getLastMessageIndex ? callbacks.getLastMessageIndex() : 0;
                    if (endPos > actualLastIndex) {
                        endPos = actualLastIndex;
                        $("#copybot_end").val(endPos);
                        toastr.warning(`종료 위치가 마지막 메시지(${actualLastIndex}번)로 자동 조정되었습니다.`);
                    }

                    if (startPos > endPos) { toastr.error('시작 위치는 종료 위치보다 작아야 합니다.'); return; }
                    if (callbacks.executeCopyCommand) callbacks.executeCopyCommand(startPos, endPos);
                },
                '#copybot_hide_execute': () => {
                    const range = readRange('#copybot_hide_start', '#copybot_hide_end');
                    if (!range) return;
                    const [startPos, endPos] = range;
                    if (startPos > endPos) {
                        toastr.error('올바른 범위를 입력해 주십시오.');
                        return;
                    }

                    if (callbacks.executeHideCommand) {
                        callbacks.executeHideCommand(startPos, endPos);
                    } else {
                        toastr.error('메시지 숨기기 기능을 사용할 수 없습니다.');
                    }
                },
                '#copybot_unhide_execute': () => {
                    const range = readRange('#copybot_hide_start', '#copybot_hide_end');
                    if (!range) return;
                    const [startPos, endPos] = range;
                    if (startPos > endPos) {
                        toastr.error('올바른 범위를 입력해 주십시오.');
                        return;
                    }

                    if (callbacks.executeUnhideCommand) {
                        callbacks.executeUnhideCommand(startPos, endPos);
                    } else {
                        toastr.error('메시지 보이기 기능을 사용할 수 없습니다.');
                    }
                },
                '#copybot_check_hidden': () => {
                    const resultSpan = $('#copybot_hidden_result');
                    
                    // messageOperations 모듈에서 숨겨진 메시지 정보 가져오기
                    if (window.CopyBotMessageOperations && window.CopyBotMessageOperations.getHiddenMessageRanges) {
                        const result = window.CopyBotMessageOperations.getHiddenMessageRanges();
                        
                        if (result.success) {
                            if (result.hiddenIndices.length > 0) {
                                resultSpan.text(`${result.message}: ${result.rangeText}`).css('color', '#e8a838');
                            } else {
                                resultSpan.text(result.message).css('color', '#48bb78');
                            }
                        } else {
                            resultSpan.text(result.message).css('color', '#e53e3e');
                        }
                    } else {
                        resultSpan.text('기능을 사용할 수 없습니다.').css('color', '#e53e3e');
                    }
                },
                '#copybot_multi_delete_execute': () => {
                    // 여기서는 숫자 읽기만 한다. 범위 검증(마지막 메시지 초과 포함)·경고창·/cut 실행은 messageOperations.executeMultiDelete 한 곳에서만 (중복 구현 금지, 2026-10-09)
                    const range = readRange('#copybot_multi_delete_start', '#copybot_multi_delete_end');
                    if (!range) return;
                    if (callbacks.executeMultiDelete) callbacks.executeMultiDelete(range[0], range[1]);
                    else toastr.error('다중 삭제 기능을 사용할 수 없습니다.');
                },
                '#copybot_linebreak_fix': () => {
                    const textbox = $('#copybot_textbox');
                    const currentText = textbox.val();
                    if (!currentText.trim()) { toastr.warning('텍스트박스에 내용이 없습니다.'); return; }
                    const cleanedText = currentText.replace(/\n{3,}/g, '\n\n').trim();
                    textbox.val(cleanedText).trigger('input');
                    if (cleanedText.length !== currentText.length) toastr.success(`줄바꿈 정리 완료!`);
                    else toastr.info('정리할 내용이 없습니다.');
                },
                '#copybot_save_txt': () => {
                    const textboxContent = $('#copybot_textbox').val();
                    if (!textboxContent.trim()) { toastr.warning('저장할 내용이 없습니다.'); return; }
                    const blob = new Blob([textboxContent], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `깡갤복사기_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    toastr.success('txt 파일로 저장되었습니다!');
                },
                '#copybot_remove_tags': () => { if (callbacks.removeTagsFromElement) callbacks.removeTagsFromElement('#copybot_textbox'); },
                '#copybot_copy_content': () => { if (callbacks.copyTextboxContent) callbacks.copyTextboxContent(); },
                '#copybot_clear_content': () => {
                    $('#copybot_textbox').val('').trigger('input');
                    toastr.success('텍스트박스가 비워졌습니다.');
                },
                // 처음/끝 이동은 actions.js 레지스트리 한 곳으로 (확인창·안내 문구가 퀵메뉴·플로팅·커스텀 버튼과 똑같게 — 창구만 다르고 동작은 하나)
                '#copybot_jump_first': () => { if (callbacks.runAction) callbacks.runAction('jump_first'); },
                '#copybot_jump_last': () => { if (callbacks.runAction) callbacks.runAction('jump_last_top'); },
                '#copybot_jump_to': () => {
                    const jumpNumber = readIndex('#copybot_jump_number');
                    if (jumpNumber === null || Number.isNaN(jumpNumber)) { toastr.error('올바른 메시지 번호를 입력해 주십시오.'); return; }
                    if (callbacks.jumpToMessage) callbacks.jumpToMessage(jumpNumber, `메시지 #${jumpNumber}로 이동했습니다.`);
                },
                '#copybot_open_ghostwrite_button': (e) => { 
                    e.stopPropagation(); 
                    const isCurrentlyVisible = $('#copybot_ghostwrite_panel').is(':visible');
                    $('#copybot_settings_panel, #copybot_message_operations_panel, #copybot_misc_panel, #copybot_quickmenu_panel').slideUp(200);
                    $('#copybot_ghostwrite_panel').slideToggle(200, () => { 
                        if (callbacks.saveSettings) callbacks.saveSettings(); 
                    });
                    // active 상태 업데이트
                    if (!isCurrentlyVisible) {
                        updateSubmenuButtonStates('copybot_open_ghostwrite_button');
                    } else {
                        updateSubmenuButtonStates(''); // 모든 버튼 비활성화
                    }
                },
                '#copybot_open_settings_button': (e) => { 
                    e.stopPropagation(); 
                    const isCurrentlyVisible = $('#copybot_settings_panel').is(':visible');
                    $('#copybot_ghostwrite_panel, #copybot_message_operations_panel, #copybot_misc_panel, #copybot_quickmenu_panel').slideUp(200);
                    $('#copybot_settings_panel').slideToggle(200, () => { 
                        if (callbacks.saveSettings) callbacks.saveSettings(); 
                    });
                    // active 상태 업데이트
                    if (!isCurrentlyVisible) {
                        updateSubmenuButtonStates('copybot_open_settings_button');
                    } else {
                        updateSubmenuButtonStates(''); // 모든 버튼 비활성화
                    }
                },
                '#copybot_open_message_operations_button': (e) => { 
                    e.stopPropagation(); 
                    const isCurrentlyVisible = $('#copybot_message_operations_panel').is(':visible');
                    $('#copybot_ghostwrite_panel, #copybot_settings_panel, #copybot_misc_panel, #copybot_quickmenu_panel').slideUp(200);
                    $('#copybot_message_operations_panel').slideToggle(200, () => { 
                        if (callbacks.saveSettings) callbacks.saveSettings(); 
                    });
                    // active 상태 업데이트
                    if (!isCurrentlyVisible) {
                        updateSubmenuButtonStates('copybot_open_message_operations_button');
                    } else {
                        updateSubmenuButtonStates(''); // 모든 버튼 비활성화
                    }
                },
                '#copybot_open_float_button': (e) => {
                    e.stopPropagation();
                    const isCurrentlyVisible = $('#copybot_float_panel').is(':visible');
                    $('.copybot_settings_panel').not('#copybot_float_panel').slideUp(200); $('#copybot_capture_settings_button').removeClass('active');   // 캡처 옵션 패널(.copybot_settings_panel)도 함께 닫히므로 ⚙ 강조도 끈다
                    $('#copybot_float_panel').slideToggle(200, () => {
                        if (callbacks.saveSettings) callbacks.saveSettings();
                    });
                    if (!isCurrentlyVisible) {
                        updateSubmenuButtonStates('copybot_open_float_button');
                    } else {
                        updateSubmenuButtonStates('');
                    }
                },
                '#copybot_capture_settings_button': (e) => {
                    e.stopPropagation();
                    const willOpen = !$('#copybot_capture_panel').is(':visible');
                    $('#copybot_capture_panel').slideToggle(200);
                    $('#copybot_capture_settings_button').toggleClass('active', willOpen);
                },
                '#copybot_capture_execute': () => {
                    // 빈 번호 채움은 capture.js 가 담당 (범위 복사와 같은 "채우고 한 번 더" 방식) → 살아있는 미리보기 열림
                    if (window.CopyBotCapture) window.CopyBotCapture.openPreview($('#copybot_capture_start').val(), $('#copybot_capture_end').val());
                },
                '#copybot_update_check': (e) => { e.stopPropagation(); window.CopyBotCommands?.checkExtensionUpdate?.(); },
                '#copybot_update_run': (e) => { e.stopPropagation(); window.CopyBotCommands?.updateExtension?.(); },
                '#copybot_reset_all': (e) => { e.stopPropagation(); window.CopyBotSettings?.resetAllSettings?.(); },
                '#copybot_open_misc_button': (e) => {
                    e.stopPropagation();
                    const isCurrentlyVisible = $('#copybot_misc_panel').is(':visible');
                    $('#copybot_ghostwrite_panel, #copybot_settings_panel, #copybot_message_operations_panel, #copybot_quickmenu_panel').slideUp(200); 
                    $('#copybot_misc_panel').slideToggle(200, () => {
                        if (callbacks.saveSettings) callbacks.saveSettings();
                    });
                    if (!isCurrentlyVisible) window.CopyBotCommands?.showExtensionVersion?.();   // 업데이트 섹션의 현재 버전 (열 때만 1회)
                    // active 상태 업데이트
                    if (!isCurrentlyVisible) {
                        updateSubmenuButtonStates('copybot_open_misc_button');
                    } else {
                        updateSubmenuButtonStates(''); // 모든 버튼 비활성화
                    }
                },
                '.copybot_toggle_button': function(e) {
                    e.stopPropagation();
                    const button = $(this);
                    const isEnabled = button.attr('data-enabled') === 'true';
                    const newState = !isEnabled;
                    button.attr('data-enabled', newState).text(newState ? 'ON' : 'OFF');
                    
                    const actions = {
                        'copybot_ghostwrite_toggle': () => {
						$('#copybot_ghostwrite_position_options, #copybot_ghostwrite_textbox, #copybot_ghostwrite_exclude_container, #copybot_ghostwrite_panel .copybot_ghostwrite_help').slideToggle(newState);
						// 대필 아이콘 피커 표시/숨김
						if (newState) {
							$('#copybot_ghostwrite_icon_picker').show();
						} else {
							$('#copybot_ghostwrite_icon_picker').hide();
						}
						// 대필 기능 OFF시 임시대필칸도 제거
						if (!newState && window.CopyBotGhostwrite && window.CopyBotGhostwrite.removeTempPromptField) {
							window.CopyBotGhostwrite.removeTempPromptField();
						} else if (newState && callbacks.addTempPromptField) {
							// 대필 기능 ON시 임시대필칸 설정에 따라 추가
							setTimeout(() => {
								callbacks.addTempPromptField();
							}, 100);
						}
					},
					'copybot_temp_field_toggle': () => { 
						if (window.CopyBotGhostwrite && window.CopyBotGhostwrite.refreshTempPromptField) {
							window.CopyBotGhostwrite.refreshTempPromptField();
						} else if (callbacks.addTempPromptField) {
							callbacks.addTempPromptField();
						}
					},
                        'copybot_hq_profile_toggle': () => {
                            $('#copybot_hq_profile_options').toggle(newState);   // "봇 목록에도 적용" 줄은 고화질이 켜져 있을 때만 보임
                            return newState ? (callbacks.enableHighQualityProfiles && callbacks.enableHighQualityProfiles()) : (callbacks.disableHighQualityProfiles && callbacks.disableHighQualityProfiles());
                        },
                        'copybot_remove_resize_toggle': () => newState ? (callbacks.removeResizeHandle && callbacks.removeResizeHandle()) : (callbacks.restoreResizeHandle && callbacks.restoreResizeHandle()),
                        'copybot_hide_placeholder_toggle': () => newState ? (callbacks.hidePlaceholder && callbacks.hidePlaceholder()) : (callbacks.restorePlaceholder && callbacks.restorePlaceholder()),
                        'copybot_confirm_delete_toggle': () => { /* 설정 저장만 수행하면 되므로 추가 동작 없음 */ },
                        'copybot_debug_mode_toggle': () => {
                            isDebugMode = newState;
                            // commands 모듈에도 디버그 모드 상태 전달
                            if (callbacks.setDebugMode) {
                                callbacks.setDebugMode(newState);
                            }
                        },
                        'copybot_quickmenu_toggle': () => {
                            // 접근 방식 옵션 표시/숨김
                            if (newState) {
                                $('#copybot_quickmenu_access_options').slideDown(200);
                            } else {
                                $('#copybot_quickmenu_access_options').slideUp(200);
                            }
                        },
                        'copybot_custom_buttons_toggle': () => {
                            window.CopyBotUI.renderCustomSlots();
                            $('#copybot_custom_buttons_options').slideToggle(newState);
                            window.CopyBotUI.refreshCustomButtonTargets();
                        },
                        'copybot_float_toggle': () => {
                            $('#copybot_float_options').slideToggle(newState);
                            $('#copybot_float_icon_picker').toggle(newState);
                            if (window.CopyBotWandMenu?.refreshFloatButton) window.CopyBotWandMenu.refreshFloatButton();
                        },
                        'copybot_capture_anonymize_toggle': () => {
                            $('#copybot_capture_anonymize_options').slideToggle(newState);
                            setTimeout(() => { try { window.CopyBotCapture?.refreshPreviewRules?.(); } catch (e) { /* 무시 */ } }, 350);
                        },
                    };
                    const defaultAction = () => $(`#${button.attr('id').replace('_toggle', '_options')}`).slideToggle(newState);
                    (actions[button.attr('id')] || defaultAction)();
                    if (newState && window.copybot_ensureScrollGuard) window.copybot_ensureScrollGuard();
                    
                    // this 대신 window.CopyBotUI 직접 호출
                    if (window.CopyBotUI && window.CopyBotUI.updateActionButtons) {
                        window.CopyBotUI.updateActionButtons();
                    }
                    if (callbacks.safeUpdateInputFieldIcons) callbacks.safeUpdateInputFieldIcons();
                    if (callbacks.saveSettings) callbacks.saveSettings();
                }
            };

            for (const selector in eventMap) {
                $(document).off('click', selector).on('click', selector, eventMap[selector]);
            }
            
            // ... 이하 나머지 이벤트 핸들러들
            $(document).off('click', '#copybot_reload_profiles_button').on('click', '#copybot_reload_profiles_button', function() {
                if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '프로필 목록 수동 새로고침 실행');
                const currentlySelected = $('#copybot_ghostwrite_profile_select').val();
                if (callbacks.loadGhostwriteProfiles) callbacks.loadGhostwriteProfiles();
                $('#copybot_ghostwrite_profile_select').val(currentlySelected);
                
                // 🔥 9단계 신규: 프로필 새로고침 시 피드백 표시
                if (callbacks.showStatusIcon) callbacks.showStatusIcon('profile', false); // ✅ 표시 후 페이드아웃
                
                toastr.success('프로필 목록을 새로고침했습니다.');
                const icon = $(this);
                icon.addClass('fa-spin');
                setTimeout(() => icon.removeClass('fa-spin'), 500);
            });
            
            $(document).off('keypress', '#copybot_start, #copybot_end').on('keypress', '#copybot_start, #copybot_end', (e) => { if(e.which === 13) $('#copybot_execute').click(); });
            $(document).off('keypress', '#copybot_capture_start, #copybot_capture_end').on('keypress', '#copybot_capture_start, #copybot_capture_end', (e) => { if(e.which === 13) $('#copybot_capture_execute').click(); });
            $(document).off('keypress', '#copybot_jump_number').on('keypress', '#copybot_jump_number', (e) => { if(e.which === 13) $('#copybot_jump_to').click(); });
            
            $(document).off('input', '#copybot_textbox').on('input', '#copybot_textbox', function() {
                const hasContent = $(this).val().trim().length > 0;
                $('#copybot_copy_content, #copybot_remove_tags, #copybot_linebreak_fix, #copybot_save_txt, #copybot_clear_content').prop('disabled', !hasContent);
            });

			$(document).off('change', '.copybot_checkbox, .copybot_radio').on('change', '.copybot_checkbox, .copybot_radio', function() {

                if (window.CopyBotUI && window.CopyBotUI.updateActionButtons) {
                    window.CopyBotUI.updateActionButtons();
                }
                if (callbacks.safeUpdateInputFieldIcons) callbacks.safeUpdateInputFieldIcons();
                if (callbacks.saveSettings) callbacks.saveSettings();
            });
            
            // 편의기능 위치 드롭다운 변경 이벤트
			$(document).off('change', '#copybot_tag_remove_position, #copybot_delete_position, #copybot_delete_regenerate_position')
				.on('change', '#copybot_tag_remove_position, #copybot_delete_position, #copybot_delete_regenerate_position', () => {
				if (callbacks.safeUpdateInputFieldIcons) callbacks.safeUpdateInputFieldIcons();
				if (callbacks.saveSettings) callbacks.saveSettings();
			});

			// ===== 편의기능 복사기/입력필드 체크박스 이벤트 =====
			
			// 복사기 체크박스 변경 - 소메뉴 아이콘 표시/숨김
			$(document).off('change', '#copybot_tag_remove_submenu, #copybot_delete_submenu, #copybot_delete_regenerate_submenu')
				.on('change', '#copybot_tag_remove_submenu, #copybot_delete_submenu, #copybot_delete_regenerate_submenu', function() {
				const checkboxId = $(this).attr('id');
				const isChecked = $(this).is(':checked');
				
				// 체크박스 ID에 따라 해당 소메뉴 아이콘 표시/숨김
				if (checkboxId === 'copybot_tag_remove_submenu') {
					if (isChecked) {
						const iconClass = $('#copybot_tag_remove_icon_picker').data('icon') || 'fa-tags';
						$('#copybot_submenu_tag_remove')
							.removeClass()
							.addClass(`copybot_submenu_icon fa-solid ${iconClass}`)
							.show();
					} else {
						$('#copybot_submenu_tag_remove').hide();
					}
				} else if (checkboxId === 'copybot_delete_submenu') {
					if (isChecked) {
						const iconClass = $('#copybot_delete_icon_picker').data('icon') || 'fa-trash';
						$('#copybot_submenu_delete')
							.removeClass()
							.addClass(`copybot_submenu_icon fa-solid ${iconClass}`)
							.show();
					} else {
						$('#copybot_submenu_delete').hide();
					}
				} else if (checkboxId === 'copybot_delete_regenerate_submenu') {
					if (isChecked) {
						const iconClass = $('#copybot_delete_regenerate_icon_picker').data('icon') || 'fa-redo';
						$('#copybot_submenu_regenerate')
							.removeClass()
							.addClass(`copybot_submenu_icon fa-solid ${iconClass}`)
							.show();
					} else {
						$('#copybot_submenu_regenerate').hide();
					}
				}
				
				if (callbacks.saveSettings) callbacks.saveSettings();
				if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '복사기 체크박스 변경:', checkboxId, '→', isChecked ? 'ON' : 'OFF');
			});

			// 입력필드 체크박스 변경 - 위치 드롭다운 활성화/비활성화 + 아이콘 업데이트
			$(document).off('change', '#copybot_tag_remove_inputfield, #copybot_delete_inputfield, #copybot_delete_regenerate_inputfield')
				.on('change', '#copybot_tag_remove_inputfield, #copybot_delete_inputfield, #copybot_delete_regenerate_inputfield', function() {
				const checkboxId = $(this).attr('id');
				const isChecked = $(this).is(':checked');
				
				// 체크박스 ID에 따라 해당 위치 드롭다운 활성화/비활성화
				if (checkboxId === 'copybot_tag_remove_inputfield') {
					$('#copybot_tag_remove_position').prop('disabled', !isChecked);
				} else if (checkboxId === 'copybot_delete_inputfield') {
					$('#copybot_delete_position').prop('disabled', !isChecked);
				} else if (checkboxId === 'copybot_delete_regenerate_inputfield') {
					$('#copybot_delete_regenerate_position').prop('disabled', !isChecked);
				}
				
				if (callbacks.safeUpdateInputFieldIcons) callbacks.safeUpdateInputFieldIcons();
				if (callbacks.saveSettings) callbacks.saveSettings();
				if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '입력필드 체크박스 변경:', checkboxId, '→', isChecked ? 'ON' : 'OFF');
			});

			// ===== 소메뉴 아이콘 클릭 이벤트 =====
			
			// 태그제거 아이콘 클릭
			$(document).off('click', '#copybot_submenu_tag_remove').on('click', '#copybot_submenu_tag_remove', function(e) {
				e.preventDefault();
				e.stopPropagation();
				if (callbacks.runAction) callbacks.runAction('remove_tags');   // 레지스트리 한 곳 (다른 창구와 같은 동작)
				if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '소메뉴: 태그제거 실행');
			});

			// 삭제 아이콘 클릭 (좆됨방지는 commands.js에서 처리)
			$(document).off('click', '#copybot_submenu_delete').on('click', '#copybot_submenu_delete', function(e) {
				e.preventDefault();
				e.stopPropagation();
				if (callbacks.runAction) callbacks.runAction('delete_last');
				if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '소메뉴: 삭제 실행');
			});

			// 재생성 아이콘 클릭 (generation.js 파이프라인)
			$(document).off('click', '#copybot_submenu_regenerate').on('click', '#copybot_submenu_regenerate', function(e) {
				e.preventDefault();
				e.stopPropagation();
				if (callbacks.runAction) callbacks.runAction('delete_regen');
				if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '소메뉴: 재생성 실행');
			});

			// 커스텀 소메뉴 아이콘 클릭 (actions.js 레지스트리)
			$(document).off('click', '.copybot_submenu_custom').on('click', '.copybot_submenu_custom', function(e) {
				e.preventDefault();
				e.stopPropagation();
				const actionId = $(this).attr('data-action');
				const slotIndex = Number($(this).attr('data-slot'));
				if (actionId && callbacks.runAction) callbacks.runAction(actionId, Number.isInteger(slotIndex) ? slotIndex : undefined, this);
			});

			// ===== 커스텀 버튼 슬롯 이벤트 =====
			$(document).off('click', '#copybot_custom_slot_add').on('click', '#copybot_custom_slot_add', function(e) {
				e.preventDefault(); e.stopPropagation();
				if (window.CopyBotUI.addCustomSlot() && callbacks.saveSettings) callbacks.saveSettings();
			});
			$(document).off('click', '.copybot_custom_slot_remove').on('click', '.copybot_custom_slot_remove', function(e) {
				e.preventDefault(); e.stopPropagation();
				window.CopyBotUI.removeCustomSlot($(this).closest('.copybot_custom_slot'));
				window.CopyBotUI.refreshCustomButtonTargets();
				if (callbacks.saveSettings) callbacks.saveSettings();
			});
			$(document).off('change', '.copybot_custom_action').on('change', '.copybot_custom_action', async function() {
				const $slot = $(this).closest('.copybot_custom_slot');
				const raw = String($(this).val() || '');
				const actionId = raw.startsWith('st_menu:') ? 'st_menu' : raw;
				const $picker = $slot.find('.copybot_icon_picker');
				if (actionId === 'st_menu' || actionId === 'qr_set') {
					// 실리 메뉴 / QR 세트: 고르기 팝업을 끝내야 설정이 완성된다. 취소하면 직전 값으로 되돌림 (그 전엔 아무것도 건드리지 않음)
					const prevRaw = $slot.data('prevAction') || '';
					if (!window.CopyBotShortcut) { toastr.warning('바로가기 모듈을 불러오지 못했습니다.'); $(this).val(prevRaw); return; }
					const prevLink = $slot.data('link') || null;
					const sameAsBefore = prevRaw === raw && !!prevLink;
					const seed = actionId === 'st_menu' ? { menu: raw.split(':')[1] } : {};
					const link = await window.CopyBotShortcut.configure(actionId, sameAsBefore ? prevLink : seed);
					if (!link) { if (!sameAsBefore) $(this).val(prevRaw); return; }
					window.CopyBotUI.commitSlotLink($slot, link);
					return;
				}
				$slot.data('link', null).data('prevAction', raw);
				// 사용자가 아이콘을 직접 고르지 않았으면 동작 기본 아이콘으로 맞춤
				const defaultIcon = actionId ? (window.CopyBotActions?.defaultIcon(actionId) || 'fa-circle') : 'fa-circle';
				$picker.attr('data-default', defaultIcon);           // 피커의 "기본값"은 항상 지금 동작의 기본 아이콘
				if (!$picker.data('customized')) {                    // 유저가 직접 고른 아이콘은 "(사용 안 함)"으로 꺼 둬도 그대로 둔다 (× 지우기만 초기화)
					$picker.removeClass().addClass(`fa-solid ${defaultIcon} copybot_icon_picker copybot_inline_icon_picker`).data('icon', defaultIcon);
				}
				window.CopyBotUI._renderSlotDesc($slot, actionId, null);
				$slot.find('.copybot_custom_submenu, .copybot_custom_inputfield').prop('disabled', false);     // 꺼 둔 칸에서도 미리 설정 가능
				$slot.find('.copybot_custom_position').prop('disabled', !$slot.find('.copybot_custom_inputfield').is(':checked'));
				window.CopyBotUI.refreshCustomButtonTargets();
				if (callbacks.saveSettings) callbacks.saveSettings();
			});
			// 바로가기 슬롯의 [바꾸기] → 다시 고르기 (shortcut.js 가 commitSlotLink 로 반영·저장)
			$(document).off('click', '.copybot_sc_change').on('click', '.copybot_sc_change', function(e) {
				e.preventDefault(); e.stopPropagation();
				const index = Number($(this).closest('.copybot_custom_slot').attr('data-slot'));
				if (Number.isInteger(index) && window.CopyBotShortcut?.reconfigureSlot) window.CopyBotShortcut.reconfigureSlot(index);
			});
			$(document).off('change', '.copybot_custom_submenu, .copybot_custom_inputfield, .copybot_custom_position').on('change', '.copybot_custom_submenu, .copybot_custom_inputfield, .copybot_custom_position', function() {
				const $slot = $(this).closest('.copybot_custom_slot');
				$slot.find('.copybot_custom_position').prop('disabled', !$slot.find('.copybot_custom_inputfield').is(':checked'));   // 꺼 둔 칸에서도 위치는 입력필드 체크에만 따름
				window.CopyBotUI.refreshCustomButtonTargets();
				if (callbacks.saveSettings) callbacks.saveSettings();
			});

			// ===== 입력필드 아이콘 순서 이벤트 =====
			const iconOrderChanged = () => {
				const order = window.CopyBotUI.readIconOrder();
				window.CopyBotUI.renderIconOrderList(order);
				if (callbacks.saveSettings) callbacks.saveSettings();
				if (window.CopyBotIcons?.updateInputFieldIcons) window.CopyBotIcons.updateInputFieldIcons();
			};
			$(document).off('click', '#copybot_icon_order_list .copybot_icon_move_up').on('click', '#copybot_icon_order_list .copybot_icon_move_up', function(e) {
				e.preventDefault(); e.stopPropagation();
				const $li = $(this).closest('li'); const $prev = $li.prev(); if ($prev.length) $li.insertBefore($prev);
				iconOrderChanged();
			});
			$(document).off('click', '#copybot_icon_order_list .copybot_icon_move_down').on('click', '#copybot_icon_order_list .copybot_icon_move_down', function(e) {
				e.preventDefault(); e.stopPropagation();
				const $li = $(this).closest('li'); const $next = $li.next(); if ($next.length) $li.insertAfter($next);
				iconOrderChanged();
			});
			$(document).off('click', '#copybot_icon_order_reset').on('click', '#copybot_icon_order_reset', function(e) {
				e.preventDefault(); e.stopPropagation();
				window.CopyBotUI.renderIconOrderList(null);
				iconOrderChanged();
				toastr.info('아이콘 순서를 기본값으로 되돌렸습니다.', '', { timeOut: 1500 });
			});
			window.CopyBotUI.renderIconOrderList(null);   // 설정 로드 전 기본 순서로 그려 둠

			// ===== 플로팅 메뉴 설정 이벤트 =====
			$(document).off('change', '[id^="copybot_fm_section_"]').on('change', '[id^="copybot_fm_section_"]', function() {
				if (window.CopyBotWandMenu?.applySectionVisibility) window.CopyBotWandMenu.applySectionVisibility();
				if (callbacks.saveSettings) callbacks.saveSettings();
			});
			$(document).off('click', '#copybot_float_reset_position').on('click', '#copybot_float_reset_position', function(e) {
				e.stopPropagation();
				if (window.CopyBotWandMenu?.resetFloatPosition) window.CopyBotWandMenu.resetFloatPosition();
				toastr.info('플로팅 버튼 위치를 초기화했습니다.', '', { timeOut: 1500 });
			});
			// 다른 소메뉴 버튼을 누르면 플로팅/캡처 패널도 닫기
			$(document).off('click.copybot_float_close', '.copybot_settings_button').on('click.copybot_float_close', '.copybot_settings_button', function() {
				if (this.id !== 'copybot_open_float_button') $('#copybot_float_panel').slideUp(200);
			});

			// 고화질 프로필: "봇 목록에도 적용" 체크 → 저장 + 적용 범위 갱신
			$(document).off('change', '#copybot_hq_profile_list').on('change', '#copybot_hq_profile_list', function() {
				if (callbacks.saveSettings) callbacks.saveSettings();
				try { window.CopyBotProfiles?.refreshListScope?.(); } catch (e) { /* 무시 */ }
			});

			// 캡처 설정 저장 (규칙·이미지·품질)
			let captureSaveTimer = null;
			const scheduleCaptureSave = (e) => {
				clearTimeout(captureSaveTimer);
				// 규칙·대체어를 타이핑하는 중(input)에는 700ms — 글자마다 미리보기 전체를 다시 만들지 않게. 셀렉트·체크·칸을 벗어날 때(change)·규칙 삭제는 300ms
				const typing = !!e && e.type === 'input' && $(e.target).is('.copybot_rule_from, .copybot_rule_to, #copybot_capture_persona_to');
				captureSaveTimer = setTimeout(() => {
					if (callbacks.saveSettings) callbacks.saveSettings();
					// 규칙 칸에 커서가 있는 동안에는 저장만 하고 미리보기는 다시 만들지 않는다 — 다시 만들 때 화면 안정화가 입력칸 포커스를 풀어
					// 치던 도중 키보드가 내려갔음(2026-10-11). 칸을 벗어나면(focusout) 그때 반영하고, 복사/저장 직전에도 항상 지금 규칙으로 맞춘다
					const ae = document.activeElement;
					if (ae && ae.matches && ae.matches('.copybot_rule_from, .copybot_rule_to, #copybot_capture_persona_to')) return;
					// 익명화 규칙이 바뀌었으면 열린 미리보기 본문도 새 규칙으로 (실시간 반영 원칙)
					try { window.CopyBotCapture?.refreshPreviewRules?.(); } catch (e) { /* 무시 */ }
				}, typing ? 700 : 300);
			};
			// 규칙 칸을 벗어나면 미리보기에 반영 (값이 안 바뀌어 change 가 안 오는 경우 포함)
			$(document).off('focusout.copybot_rule_refresh', '.copybot_rule_from, .copybot_rule_to, #copybot_capture_persona_to')
				.on('focusout.copybot_rule_refresh', '.copybot_rule_from, .copybot_rule_to, #copybot_capture_persona_to', scheduleCaptureSave);
			$(document).off('input change', '#copybot_capture_scale, #copybot_capture_images, #copybot_capture_choices, #copybot_capture_statuswin, #copybot_capture_assets, #copybot_capture_layout, .copybot_capture_show, .copybot_rule_from, .copybot_rule_to, #copybot_capture_persona_anon, #copybot_capture_persona_to')
				.on('input change', '#copybot_capture_scale, #copybot_capture_images, #copybot_capture_choices, #copybot_capture_statuswin, #copybot_capture_assets, #copybot_capture_layout, .copybot_capture_show, .copybot_rule_from, .copybot_rule_to, #copybot_capture_persona_anon, #copybot_capture_persona_to', scheduleCaptureSave);
			// 옵션 기본값이 바뀌면 미리보기 숨김·요소 체크 표시도 갱신
			$(document).off('change.copybot_kinds_refresh', '#copybot_capture_images, #copybot_capture_choices, #copybot_capture_statuswin, #copybot_capture_assets, .copybot_capture_show')
				.on('change.copybot_kinds_refresh', '#copybot_capture_images, #copybot_capture_choices, #copybot_capture_statuswin, #copybot_capture_assets, .copybot_capture_show', () => { window.CopyBotCapture?.refreshPreviewHidden?.(); window.CopyBotUI.renderCaptureKinds(); });
			$(document).off('click', '.copybot_rule_add').on('click', '.copybot_rule_add', function(e) {
				e.stopPropagation();
				const scope = $(this).attr('data-scope');
				$(`#copybot_capture_rules_${scope}`).append(window.CopyBotUI._ruleRowHtml('', '', scope));
				// 자동 포커스 금지: 유저가 입력칸을 직접 누를 때만 모바일 키보드가 뜨게 한다
			});
			$(document).off('click', '.copybot_rule_remove').on('click', '.copybot_rule_remove', function(e) {
				e.stopPropagation();
				const $row = $(this).closest('.copybot_rule_row');
				const $list = $row.parent();
				if ($list.children('.copybot_rule_row').length <= 1) {
					$row.find('input').val('');
				} else {
					$row.remove();
				}
				scheduleCaptureSave();
			});
			// 복사기 패널(확장 설정의 접이식 상자)이 지금 펼쳐져 보이는지
			const isPanelVisible = () => $('#copybot_settings .inline-drawer-content').is(':visible');
			// 복사기 접이식 상자 자체가 펼쳐져 있는지 (바깥 확장 패널이 닫혀 안 보이는 상태 포함 — 확장 패널만 다시 열면 그대로 보이므로 내용은 맞춰 둬야 함)
			const isDrawerOpen = () => {
				try {
					const el = document.querySelector('#copybot_settings .inline-drawer-content');
					return !!el && getComputedStyle(el).display !== 'none';
				} catch (e) { return false; }
			};
			// 봇별 익명화 규칙 목록이 지금 캐릭터 것이 아니면 다시 그림 (같은 캐릭터면 입력 중인 내용을 건드리지 않음)
			const syncCaptureCharScope = () => {
				const key = window.CopyBotCapture?.currentCharKey?.() || '(none)';
				if ($('#copybot_capture_rules_char').attr('data-char-key') === key) return;
				window.CopyBotUI.refreshCaptureCharScope();
				window.CopyBotUI.renderCaptureKinds();
			};
			// 번호 칸 예시 갱신용 메시지 이벤트 구독: 로드 때가 아니라 복사기 패널을 처음 열 때 1회만 (미사용 시 구독 0).
			// 구독 뒤에도 패널이 닫혀 있으면 핸들러는 타이머도 만들지 않고 바로 끝난다.
			const bindRangePlaceholderEvents = () => {
				if (window.__copybot_range_ph_bound) return;
				try {
					const ctx0 = window.SillyTavern?.getContext?.();
					if (!ctx0?.eventSource) return;
					window.__copybot_range_ph_bound = true;
					const onChatEvent = () => {
						if (!isPanelVisible()) return;
						setTimeout(() => window.CopyBotUI.updateRangePlaceholders(), 50);
					};
					['CHAT_CHANGED', 'MESSAGE_SENT', 'MESSAGE_RECEIVED', 'MESSAGE_DELETED', 'MESSAGE_EDITED', 'CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED']
						.map(k => ctx0.event_types?.[k]).filter(Boolean)
						.forEach(ev => ctx0.eventSource.on(ev, onChatEvent));
				} catch (err) { /* 컨텍스트 없음: 무시 */ }
			};
			// 번호 칸 예시(첫/마지막 번호): 칸을 누를 때·패널을 열 때 갱신, 패널을 한 번이라도 연 뒤에는 채팅이 바뀌거나 메시지가 늘고 줄 때도 갱신
			$(document).off('focusin.copybot_range_ph', '#copybot_start, #copybot_end, #copybot_capture_start, #copybot_capture_end')
				.on('focusin.copybot_range_ph', '#copybot_start, #copybot_end, #copybot_capture_start, #copybot_capture_end', () => { bindRangePlaceholderEvents(); window.CopyBotUI.updateRangePlaceholders(); });
			if (isPanelVisible()) bindRangePlaceholderEvents();   // 핸들러를 다시 거는 시점에 패널이 이미 열려 있는 경우(핫리로드 등)
			$(document).off('click.copybot_range_ph', '#copybot_settings .inline-drawer-toggle, #copybot_mode_toggle button')
				.on('click.copybot_range_ph', '#copybot_settings .inline-drawer-toggle, #copybot_mode_toggle button', () => {
					bindRangePlaceholderEvents();   // 복사기 패널을 처음 여는 시점에 1회 (열지 않으면 메시지 이벤트 구독 0)
					setTimeout(() => {
						window.CopyBotUI.updateRangePlaceholders();
						if (!isPanelVisible()) return;
						// 패널을 닫아 둔 사이 채팅이 바뀌었으면 봇별 익명화 규칙 목록·요소 목록을 지금 캐릭터 것으로
						syncCaptureCharScope();
						// 복사기를 열었을 때 캡처 모드면 기록된 미리보기를 패널 안에 다시 띄움 (로드 시점이 아니라 유저가 열 때)
						// 패널이 닫힌 사이 이 상자로 옮겨진 미리보기(전체 화면에서 뒤로가기·축소)는 폭을 못 재 높이가 안 맞춰져 있다 → 보이는 지금 다시 맞춤 (미리보기 없으면 아무 일도 안 함)
						if ($('#copybot_mode_capture').is(':visible')) { try { window.CopyBotCapture?.autoOpenPreview?.(); window.CopyBotCapture?.relayoutPreview?.(); } catch (e) { /* 무시 */ } }
					}, 50);
				});
			window.CopyBotUI.updateRangePlaceholders();

			// 채팅/캐릭터가 바뀌면: 이전 채팅의 캡처 미리보기를 닫고(항상), 복사기 상자가 펼쳐져 있을 때만 캐릭터별 규칙 표시 갱신 (저장은 settings.js 가 현재 캐릭터 키로 함)
			try {
				const ctx = window.SillyTavern?.getContext?.();
				if (ctx?.eventSource && !window.__copybot_capture_chat_bound) {
					window.__copybot_capture_chat_bound = true;
					ctx.eventSource.on(ctx.event_types.CHAT_CHANGED, () => {
						// 미리보기가 없으면 아무 일도 안 함 (capture.js onChatChanged 가 바로 return)
						try { window.CopyBotCapture?.onChatChanged?.(); } catch (e) { /* 무시 */ }
						if (!isDrawerOpen()) return;   // 복사기 상자가 접혀 있으면 펼칠 때 갱신 (목록의 data-char-key 가 달라 그 사이 저장·캡처는 저장소 값을 씀)
						// 캐릭터 바뀌기 직전 입력 중이던 규칙은 settings 에서 키별로 이미 저장됨
						setTimeout(() => { syncCaptureCharScope(); window.CopyBotUI.renderCaptureKinds(); }, 50);
					});
				}
			} catch (err) { /* 컨텍스트 없음: 무시 */ }
			window.CopyBotUI.renderCaptureRules('global', []);
			window.CopyBotUI.refreshCaptureCharScope();

			// ===== 입력창 안내문 모드 이벤트 =====
			$(document).off('change', '#copybot_placeholder_mode').on('change', '#copybot_placeholder_mode', function() {
				const mode = $(this).val();
				$('#copybot_placeholder_replace_options').toggle(mode === 'replace');
				// 하위 호환용 숨은 토글 동기화
				$('#copybot_hide_placeholder_toggle').attr('data-enabled', mode === 'hide').text(mode === 'hide' ? 'ON' : 'OFF');
				if (callbacks.safeApplyPlaceholderSetting) callbacks.safeApplyPlaceholderSetting();
				if (callbacks.saveSettings) callbacks.saveSettings();
				if (mode !== 'off' && window.copybot_ensureScrollGuard) window.copybot_ensureScrollGuard();
			});
			let placeholderInputTimer = null;
			$(document).off('input', '#copybot_placeholder_text, #copybot_placeholder_css').on('input', '#copybot_placeholder_text, #copybot_placeholder_css', function() {
				clearTimeout(placeholderInputTimer);
				placeholderInputTimer = setTimeout(() => {
					if (callbacks.safeApplyPlaceholderSetting) callbacks.safeApplyPlaceholderSetting();
					if (callbacks.saveSettings) callbacks.saveSettings();
				}, 300);
			});

			// ===== 퀵메뉴 설정 이벤트 핸들러 =====

			// 퀵메뉴 버튼 클릭 - 패널 토글
			$(document).off('click', '#copybot_open_quickmenu_button').on('click', '#copybot_open_quickmenu_button', function() {
				const $quickmenuPanel = $('#copybot_quickmenu_panel');
				const isVisible = $quickmenuPanel.is(':visible');
				
				// 모든 설정 패널 닫기
				$('.copybot_settings_panel').slideUp(200); $('#copybot_capture_settings_button').removeClass('active');   // 캡처 옵션 패널(.copybot_settings_panel)도 함께 닫히므로 ⚙ 강조도 끈다
				$('.copybot_settings_button').removeClass('active');
				
				// 퀵메뉴 패널 토글
				if (!isVisible) {
					$quickmenuPanel.slideDown(200);
					$(this).addClass('active');
				}
				
				if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '퀵메뉴 패널 토글:', !isVisible ? 'ON' : 'OFF');
			});

			// 퀵메뉴 접근 방식 체크박스 변경
			$(document).off('change', '#copybot_quickmenu_wand, #copybot_quickmenu_input_icon').on('change', '#copybot_quickmenu_wand, #copybot_quickmenu_input_icon', function() {
				const checkboxId = $(this).attr('id');
				const isChecked = $(this).is(':checked');
				
				// 마법봉 체크박스인 경우 아이콘 피커 표시/숨김
				if (checkboxId === 'copybot_quickmenu_wand') {
					if (isChecked) {
						$('#copybot_quickmenu_wand_icon_picker').show();
					} else {
						$('#copybot_quickmenu_wand_icon_picker').hide();
					}
				}

				// 입력필드 아이콘 체크박스인 경우 위치 드롭다운 및 아이콘 피커 표시/숨김
				if (checkboxId === 'copybot_quickmenu_input_icon') {
					if (isChecked) {
						$('#copybot_quickmenu_position_container').slideDown(200);
						$('#copybot_quickmenu_input_icon_picker').show();
					} else {
						$('#copybot_quickmenu_position_container').slideUp(200);
						$('#copybot_quickmenu_input_icon_picker').hide();
					}
				}
				
				if (callbacks.saveSettings) callbacks.saveSettings();
				// 아이콘 업데이트 (입력필드 아이콘 표시/숨김)
				if (callbacks.updateInputFieldIcons) {
					setTimeout(() => callbacks.updateInputFieldIcons(), 100);
				}
				if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '퀵메뉴 접근 방식 변경:', checkboxId, '→', isChecked ? 'ON' : 'OFF');
			});

			// 퀵메뉴 섹션 체크박스 변경
			$(document).off('change', '[id^="copybot_qm_section_"]').on('change', '[id^="copybot_qm_section_"]', function() {
				const sectionId = $(this).attr('id').replace('copybot_qm_section_', '');
				const isChecked = $(this).is(':checked');
				
				// 섹션 표시/숨김 즉시 적용
				if (window.CopyBotWandMenu && window.CopyBotWandMenu.applySectionVisibility) {
					window.CopyBotWandMenu.applySectionVisibility();
				}
				
				if (callbacks.saveSettings) callbacks.saveSettings();
				if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '퀵메뉴 섹션 변경:', sectionId, '→', isChecked ? 'ON' : 'OFF');
			});

			// 퀵메뉴 입력필드 위치 드롭다운 변경
			$(document).off('change', '#copybot_quickmenu_icon_position').on('change', '#copybot_quickmenu_icon_position', function() {
				const position = $(this).val();
				if (callbacks.saveSettings) callbacks.saveSettings();
				// 아이콘 위치 변경 즉시 적용
				if (callbacks.updateInputFieldIcons) {
					setTimeout(() => callbacks.updateInputFieldIcons(), 100);
				}
				if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '퀵메뉴 아이콘 위치 변경:', position);
			});
            
            // 하이브리드 자동저장 - 대필 기본 지시문 텍스트박스 이벤트 (일관성을 위해 동일하게 수정)
            $(document).off('input focus blur', '#copybot_ghostwrite_textbox'); // 기존 모든 핸들러 제거
            
            // input 이벤트 (디바운싱 저장)
            $(document).on('input', '#copybot_ghostwrite_textbox', function(e) {
                if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, 'basicPrompt input 이벤트 감지:', e.target.value);
                if (callbacks.scheduleDebounceAutoSave) callbacks.scheduleDebounceAutoSave('basicPrompt');
            });
            
            // blur 이벤트 (즉시 저장)
            $(document).on('blur', '#copybot_ghostwrite_textbox', function(e) {
                if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, 'basicPrompt blur 이벤트 감지:', e.target.value);
                if (callbacks.scheduleImmediateAutoSave) callbacks.scheduleImmediateAutoSave('basicPrompt', 'blur');
            });
            
            // focus 이벤트
            $(document).on('focus', '#copybot_ghostwrite_textbox', function(e) {
                if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, 'basicPrompt focus 이벤트');
                if (callbacks.saveSettings) callbacks.saveSettings();
            });

            // 🔥 핸들러 중복 문제 해결: 대필 제외 지시문 텍스트박스 이벤트 (강제 재등록)
            $(document).off('input focus blur', '#copybot_ghostwrite_exclude_textbox'); // 기존 모든 핸들러 제거
            
            // input 이벤트 (디바운싱 저장)
            $(document).on('input', '#copybot_ghostwrite_exclude_textbox', function(e) {
                if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, 'excludePrompt input 이벤트 감지:', e.target.value);
                if (callbacks.scheduleDebounceAutoSave) callbacks.scheduleDebounceAutoSave('excludePrompt');
            });
                
            // blur 이벤트 (즉시 저장) - 별도 등록으로 우선순위 확보
            $(document).on('blur', '#copybot_ghostwrite_exclude_textbox', function(e) {
                if (callbacks.debugLog && isDebugMode) {
                    callbacks.debugLog(true, 'excludePrompt blur 이벤트 감지:', e.target.value);
                    callbacks.debugLog(true, 'excludePrompt blur 이벤트 → scheduleImmediateAutoSave 호출');
                }
                if (callbacks.scheduleImmediateAutoSave) callbacks.scheduleImmediateAutoSave('excludePrompt', 'blur');
            });
            
            // focus 이벤트
            $(document).on('focus', '#copybot_ghostwrite_exclude_textbox', function(e) {
                if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, 'excludePrompt focus 이벤트');
                if (callbacks.saveSettings) callbacks.saveSettings();
            });

            // 하이브리드 자동저장 - 프로필 선택 드롭다운 이벤트
            $(document).off('change', '#copybot_ghostwrite_profile_select').on('change', '#copybot_ghostwrite_profile_select', function() {
                // 프로필 변경: 즉시 저장 + 즉시 피드백(✅). 대필 UI 는 예전 겉동작 그대로 둔다 (2026-10-11 유저 결정: 대필은 개선 요청이 있기 전까지 건드리지 않음)
                if (callbacks.scheduleImmediateAutoSave) callbacks.scheduleImmediateAutoSave('profile', 'change');
                if (callbacks.showStatusIcon) callbacks.showStatusIcon('profile', false); // ✅ 표시 후 페이드아웃
                if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '프로필 변경됨, 피드백 표시');

                // 기존 일반 설정 저장도 유지
                if (callbacks.saveSettings) callbacks.saveSettings();
            });

			// === 아이콘 피커 클릭 이벤트 (편의기능 3종) ===
            $(document).off('click', '.copybot_icon_picker').on('click', '.copybot_icon_picker', async function() {
                const $picker = $(this);
                // 연타 방지: 피커가 뜨기 전(아이콘 목록을 받아 오는 중)에 한 번 더 누르면 피커가 두 겹으로 뜨고 showModal 래퍼도 겹친다
                const UI = window.CopyBotUI;
                const startedAt = Date.now();
                if (UI._pickerBusyAt && (startedAt - UI._pickerBusyAt < 3000 || document.querySelector('dialog[open] .faPicker-container'))) return;
                UI._pickerBusyAt = startedAt;
                const currentIcon = $picker.data('icon') || $picker.attr('data-default');
                const defaultIcon = $picker.attr('data-default');
                
                let stopFocusGuard = null;
                try {
                    // ST 내장 아이콘 피커 동적 import
                    const { showFontAwesomePicker } = await import('/scripts/utils.js');

                    // "No Icon/아이콘 없음" 버튼 → "기본값" 표기와 검색칸 자동 포커스 억제는 _suppressPickerAutofocus 가 함께 처리
                    // 실리 피커의 검색칸(autofocus)이 모바일 키보드를 바로 띄우는 것 방지: 유저가 검색칸을 직접 누를 때만 키보드
                    stopFocusGuard = window.CopyBotUI._suppressPickerAutofocus();
                    const selectedIcon = await showFontAwesomePicker();
                    
                    // 취소 (null)이면 무시
                    if (selectedIcon === null) {
                        if (callbacks.debugLog && isDebugMode) {
                            callbacks.debugLog(true, '아이콘 선택 취소됨');
                        }
                        return;
                    }
                    
                    // 빈 문자열 = "기본값" 버튼 클릭 → 디폴트 아이콘으로 복원
                    const newIcon = selectedIcon === '' ? defaultIcon : selectedIcon;
                    
                    // 인라인 피커 여부 먼저 확인 (removeClass 전에!)
					const pickerId = $picker.attr('id') || '';
					const isInlinePicker = $picker.hasClass('copybot_inline_icon_picker');

					// 새 아이콘 적용
					$picker
						.removeClass()
						.addClass(`fa-solid ${newIcon} copybot_icon_picker${isInlinePicker ? ' copybot_inline_icon_picker' : ''}`)
						.data('icon', newIcon);

					// 커스텀 슬롯 / 플로팅 버튼 아이콘이면 관련 UI 즉시 갱신
					if ($picker.closest('.copybot_custom_slot').length) {
						$picker.data('customized', selectedIcon !== '');
						window.CopyBotUI.refreshCustomButtonTargets();
					}
					if (pickerId === 'copybot_float_icon_picker' && window.CopyBotWandMenu?.refreshFloatButton) {
						window.CopyBotWandMenu.refreshFloatButton();
					}

					// 설정 저장
					if (window.CopyBotSettings && window.CopyBotSettings.saveSettings) {
						window.CopyBotSettings.saveSettings();
					}

					// 입력필드 아이콘 업데이트
					if (window.CopyBotIcons && window.CopyBotIcons.updateInputFieldIcons) {
						window.CopyBotIcons.updateInputFieldIcons();
					}

					// 마법봉 아이콘 피커인 경우 Extensions 메뉴 갱신
					if (pickerId === 'copybot_quickmenu_wand_icon_picker') {
						if (window.CopyBotWandMenu && window.CopyBotWandMenu.registerWandMenu) {
							$('#copybot_wand_container').remove();
							(window.CopyBotWandMenu.refreshWandRegistration || window.CopyBotWandMenu.registerWandMenu)();
						}
					}

					// 편의기능 아이콘 피커인 경우 퀵메뉴 팝업 아이콘도 갱신
					const convenienceIconPickers = [
						'copybot_tag_remove_icon_picker',
						'copybot_delete_icon_picker',
						'copybot_delete_regenerate_icon_picker'
					];
					if (convenienceIconPickers.includes(pickerId)) {
						if (window.CopyBotWandMenu && window.CopyBotWandMenu.updateQuickMenuIcons) {
							window.CopyBotWandMenu.updateQuickMenuIcons();
						}
					}
                    
                    if (callbacks.debugLog && isDebugMode) {
                        const action = selectedIcon === '' ? '기본값 복원' : '변경';
                        callbacks.debugLog(true, `아이콘 ${action}:`, currentIcon, '→', newIcon);
                    }
                    
                } catch (error) {
                    console.error('깡갤 복사기: 아이콘 피커 호출 실패', error);
                    toastr.error('아이콘 선택창을 열 수 없습니다.');
                } finally {
                    UI._pickerBusyAt = 0;
                    if (stopFocusGuard) stopFocusGuard();
                }
            });

            // (예전 여기에는 선택자 없이 걸린 문서 전체 click → stopPropagation 리스너가 있었다. 패널과 무관하게 모든 클릭의 window 전파를 끊고, 다시 불릴 때마다 한 겹씩 쌓여 제거함)

            // 커스텀 슬롯 행 미리 그리기 (설정 로드 전에 DOM 이 있어야 값이 들어감)
            window.CopyBotUI.renderCustomSlots();

            // ===== 결과 텍스트박스 크게 보기 =====
            $(document).off('click', '#copybot_textbox_expand').on('click', '#copybot_textbox_expand', function(e) {
                e.stopPropagation();
                window.CopyBotUI.openTextboxOverlay();
            });
            $(document).off('click', '#copybot_textbox_overlay .copybot_overlay_close').on('click', '#copybot_textbox_overlay .copybot_overlay_close', function() {
                window.CopyBotUI.closeTextboxOverlay();
            });
            $(document).off('click', '#copybot_textbox_overlay .copybot_overlay_copy').on('click', '#copybot_textbox_overlay .copybot_overlay_copy', function() {
                if (callbacks.copyTextboxContent) callbacks.copyTextboxContent();
            });
            $(document).off('input', '#copybot_textbox_overlay textarea').on('input', '#copybot_textbox_overlay textarea', function() {
                // 큰 화면에서 고친 내용을 원래 텍스트박스에 실시간 반영
                $('#copybot_textbox').val($(this).val()).trigger('input');
            });
            // ESC 닫기 리스너는 오버레이/전체화면을 처음 열 때 등록 (ensureEscHandler) — 미사용 시 문서 keydown 리스너 0

            // ===== 메인 모드 전환 (텍스트 복사 / 캡처) =====
            $(document).off('click', '#copybot_mode_toggle button').on('click', '#copybot_mode_toggle button', function(e) {
                e.stopPropagation();
                window.CopyBotUI.setMode($(this).data('mode'));
            });

            // ===== 캡처 미리보기: 요소 선택, 큰 화면 =====
            // 요소 체크 (미리보기 안): 끄면 이번 미리보기에서만 뺌(저장 안 함), 켜면 그 종류를 빼던 설정을 전부 풂. 미리보기에 즉시 반영 (재캡처 없음)
            $(document).off('change', '.copybot_capture_kinds input[type="checkbox"]').on('change', '.copybot_capture_kinds input[type="checkbox"]', function(e) {
                e.stopPropagation();
                const kind = String($(this).attr('data-kind') || '');
                const show = $(this).is(':checked');
                const C = window.CopyBotCapture;
                const r = C?.setKindIncluded ? C.setKindIncluded(kind, show) : false;
                if (!r) { $(this).prop('checked', !show); return; }   // 채팅이 바뀌어 미리보기가 닫힌 경우 등 — capture.js 가 이미 안내함
                if (r.released.length) {
                    const where = r.released.map(s => (s === 'global' ? '모든 봇' : '이 봇')).join('·');
                    toastr.info(`"${C.kindLabel(kind)}" 항상 빼기(${where})도 풀었습니다. ↶ 로 되돌릴 수 있습니다.`, '', { timeOut: 3500 });
                    window.CopyBotUI.liftToasts();
                }
                window.CopyBotUI.renderCaptureKinds();
            });
            // 요소 목록의 단추: 압정(이 봇에서 항상 빼기 켜고 끄기) / [모든 봇 ×](공통 설정 풀기) / [N개 따로 ×](하나씩 뺀 것 되살리기) / ×(기록 지우기)
            $(document).off('click', '.copybot_capture_kinds [data-act]').on('click', '.copybot_capture_kinds [data-act]', function(e) {
                e.stopPropagation();
                e.preventDefault();
                const C = window.CopyBotCapture;
                if (!C) return;
                const kind = String($(this).attr('data-kind') || '');
                const act = $(this).attr('data-act');
                const hadPreview = !!C.hasPreview?.();
                let ok = true;
                if (act === 'bot') ok = C.setKindHidden(kind, !$(this).hasClass('copybot_capture_kind_pin_on'), 'bot');
                else if (act === 'global') ok = C.setKindHidden(kind, false, 'global');
                else if (act === 'solo') ok = C.restoreSolo(kind);
                else if (act === 'forget') ok = C.forgetKind(kind);
                // 채팅이 바뀌어 미리보기가 닫힌 경우는 capture.js 가 이미 안내함
                if (!ok && !(hadPreview && !C.hasPreview?.())) { toastr.warning('이 요소는 지금 저장할 수 없습니다(캐릭터 없음).'); window.CopyBotUI.liftToasts(); }
                if (ok && act !== 'solo' && callbacks.saveSettings) callbacks.saveSettings();
                window.CopyBotUI.renderCaptureKinds();
            });
            $(document).off('click', '.copybot_capture_box .copybot_overlay_collapse').on('click', '.copybot_capture_box .copybot_overlay_collapse', function(e) {
                e.stopPropagation();
                window.CopyBotCapture?.closePreview?.();
            });
            $(document).off('click', '.copybot_capture_box .copybot_overlay_reopen').on('click', '.copybot_capture_box .copybot_overlay_reopen', function(e) {
                e.stopPropagation();
                window.CopyBotCapture?.reopenPreview?.();
            });
            // 요소 넣고 빼기 되돌리기/다시하기 (설정도 그 시점으로 함께)
            $(document).off('click', '.copybot_capture_box .copybot_overlay_undo').on('click', '.copybot_capture_box .copybot_overlay_undo', function(e) {
                e.stopPropagation();
                window.CopyBotCapture?.undoHide?.();
            });
            $(document).off('click', '.copybot_capture_box .copybot_overlay_redo').on('click', '.copybot_capture_box .copybot_overlay_redo', function(e) {
                e.stopPropagation();
                window.CopyBotCapture?.redoHide?.();
            });
            $(document).off('click', '.copybot_capture_box .copybot_overlay_clear').on('click', '.copybot_capture_box .copybot_overlay_clear', function(e) {
                e.stopPropagation();
                window.CopyBotCapture?.clearAll?.();
            });
            $(document).off('click', '.copybot_capture_box .copybot_overlay_copy').on('click', '.copybot_capture_box .copybot_overlay_copy', function(e) {
                e.stopPropagation();
                window.CopyBotCapture?.deliver('copy', 0);
            });
            $(document).off('click', '.copybot_capture_box .copybot_overlay_save').on('click', '.copybot_capture_box .copybot_overlay_save', function(e) {
                e.stopPropagation();
                window.CopyBotCapture?.deliver('saveAll');
            });
            $(document).off('click', '.copybot_capture_box .copybot_overlay_kinds_toggle').on('click', '.copybot_capture_box .copybot_overlay_kinds_toggle', function(e) {
                e.stopPropagation();
                $(this).closest('.copybot_capture_box').find('.copybot_capture_kinds_wrap').slideToggle(150, () => window.CopyBotCapture?.relayoutPreview?.());
            });
            $(document).off('click', '.copybot_capture_box .copybot_overlay_expand').on('click', '.copybot_capture_box .copybot_overlay_expand', function(e) {
                e.stopPropagation();
                window.CopyBotUI.expandCapturePreview();
            });
            $(document).off('click', '.copybot_capture_box .copybot_overlay_shrink').on('click', '.copybot_capture_box .copybot_overlay_shrink', function(e) {
                e.stopPropagation();
                window.CopyBotUI._restoreCapturePanel();
                window.CopyBotUI.shrinkCapturePreview();
            });
            $(document).off('click', '.copybot_capture_box .copybot_overlay_gear').on('click', '.copybot_capture_box .copybot_overlay_gear', function(e) {
                e.stopPropagation();
                window.CopyBotUI.toggleCaptureOptionsPopup();
            });
            $(document).off('click', '.copybot_capture_box .copybot_overlay_options_close').on('click', '.copybot_capture_box .copybot_overlay_options_close', function(e) {
                e.stopPropagation();
                window.CopyBotUI.toggleCaptureOptionsPopup(false);
            });
            $(document).off('click', '.copybot_capture_box').on('click', '.copybot_capture_box', function(e) { e.stopPropagation(); });
            // 전체 화면의 ESC/뒤로가기(네이티브 cancel)는 _captureModalDialog 가 dialog 에 직접 건 리스너가 처리한다 (cancel 은 버블링하지 않아 여기서 위임으로는 잡히지 않음)


            if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '깡갤 복사기: 이벤트 핸들러 설정 완료');
        },

        // === 내부 헬퍼 함수들 ===

        setDebugMode: function(enabled) { isDebugMode = !!enabled; },

        // 모듈 상태 확인
        isInitialized: function() {
            return !!callbacks.debugLog;
        }
    };

    if (window.copybot_debug_mode) {
        console.log('CopyBotUI 모듈 로드 완료');
    }
})();