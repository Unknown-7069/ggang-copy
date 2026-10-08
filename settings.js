// 깡갤 복사기 설정 관리 모듈
// 설정 저장/로드, placeholder, resize handle 관리
(function() {
    'use strict';

    // placeholder 관리용 스타일 요소들
    let placeholderStyleElement = null;
    let placeholderObserver = null;      // placeholder 속성 고정용 MutationObserver
    let lastKnownPlaceholder = '';       // 복원용 원본 placeholder 문구
    let placeholderOverrideValue = null; // 현재 우리가 고정해 둔 placeholder 값
    let captureCharRules = {};           // 캡처 캐릭터별 익명화 규칙 { key: [{from,to}] }
    let captureHideKinds = {};           // 캡처 캐릭터별 숨김(동적 블록) { key: { 'block:div.xxx': true } } — 숨기는 것만
    let captureHideGlobal = {};          // 캡처 공통 숨김(고정 종류 중 select 가 없는 것: frame/otherimg/details/table/code/quote) { kind: true }
    let resizeStyleElement = null;

    // 전역 네임스페이스 생성
    window.CopyBotSettings = {
        
        // 설정 저장 (저사양 대비: 연속 호출을 200ms 로 묶어 localStorage 쓰기 횟수를 줄임)
        _saveTimer: null,
        saveSettings: function() {
            clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(() => {
                this._saveTimer = null;
                this.saveSettingsNow();
            }, 200);
            return true;
        },

        // 좆됨방지(삭제 전 재확인) 옵션 — 기본 ON("옵션 기본 OFF" 원칙의 명시적 예외, 2026-10-09 유저 결정).
        // 저장값 해석 규칙(로드·여기 공통): 구버전 저장본은 항상 confirmDelete:false 가 박혀 있으므로(저장 시 전체 객체를 쓰기 때문)
        // 한 번은 ON 으로 올린다. 유저가 이후 직접 끄면 confirmDeleteDefaultApplied 표식과 함께 false 가 저장되고, 그때부터만 OFF 를 존중한다.
        readConfirmDeleteFromMisc: function(misc) {
            if (!misc || typeof misc !== 'object') return true;
            if (misc.confirmDeleteDefaultApplied !== true) return true;   // 새 기본값을 아직 한 번도 거치지 않은 저장본 → ON
            return misc.confirmDelete !== false;                          // 표식 이후: 명시적으로 껐을 때만 OFF
        },

        // fail-closed: 설정 패널 DOM 이 있으면 그 값, 없으면 저장값, 그것도 못 읽으면 "확인한다"
        isConfirmDeleteEnabled: function() {
            const $t = $('#copybot_confirm_delete_toggle');
            if ($t.length) return $t.attr('data-enabled') === 'true';
            try {
                const raw = localStorage.getItem('copybot_settings');
                if (raw) return this.readConfirmDeleteFromMisc(JSON.parse(raw)?.misc);
            } catch (e) { /* 못 읽으면 안전한 쪽 */ }
            return true;
        },

        // === 저장 이원화 (2026-10-09 유저 결정) ===
        // 브라우저 저장소(localStorage)는 그대로 쓰고, 같은 내용을 실리 계정 설정(extensionSettings → 서버 settings.json)에도 심는다.
        // 로드 때는 둘 중 _savedAt 이 더 최근인 쪽을 쓴다 → 사이트 데이터 삭제·기기 교체 뒤에도 실리 계정으로 로그인만 하면 돌아온다.
        SERVER_KEY: 'ggang_copy',
        _serverCtx: function() {
            try {
                const ctx = window.SillyTavern?.getContext?.();
                if (ctx && ctx.extensionSettings && typeof ctx.extensionSettings === 'object') return ctx;
            } catch (e) { /* 실리 API 없음 */ }
            return null;
        },
        writeServerCopy: function(json) {
            try {
                const ctx = this._serverCtx();
                if (!ctx) return false;
                const obj = JSON.parse(json);   // 깊은 복사 — DOM 참조·공유 객체가 실리 설정에 섞이지 않게
                ctx.extensionSettings[this.SERVER_KEY] = { v: 1, savedAt: Number(obj._savedAt) || Date.now(), settings: obj };
                if (typeof ctx.saveSettingsDebounced === 'function') ctx.saveSettingsDebounced();
                return true;
            } catch (e) {
                window.CopyBotUtils?.debugLog(window.copybot_debug_mode, '서버 사본 저장 실패(브라우저 저장은 됨)', e);
                return false;
            }
        },
        // 브라우저 저장본(local) vs 실리 계정 사본(server) 중 쓸 것 고르기 (순수 함수 — 표 테스트 대상)
        //  • 둘 다 없음 → none / 한쪽만 → 그쪽 / 둘 다 → _savedAt 이 큰 쪽, 같으면 local
        //  • 브라우저 저장본에 타임스탬프가 없으면(구버전이 마지막으로 저장) 이 기기에서 가장 최근 상태이므로 local — 다른 기기의 서버 사본이 덮지 않음
        pickLatestSettings: function(local, server) {
            const okL = !!(local && typeof local === 'object');
            const okS = !!(server && typeof server === 'object');
            if (!okL && !okS) return { settings: null, source: 'none' };
            if (!okS) return { settings: local, source: 'local' };
            if (!okL) return { settings: server, source: 'server' };
            const tl = Number(local._savedAt) || 0;
            const ts = Number(server._savedAt) || 0;
            if (tl === 0) return { settings: local, source: 'local' };
            return ts > tl ? { settings: server, source: 'server' } : { settings: local, source: 'local' };
        },
        readServerCopy: function() {
            try {
                const ctx = this._serverCtx();
                const copy = ctx?.extensionSettings?.[this.SERVER_KEY];
                if (copy && typeof copy === 'object' && copy.settings && typeof copy.settings === 'object') {
                    return JSON.parse(JSON.stringify(copy.settings));   // 실리 설정 객체를 직접 건드리지 않게 복사
                }
            } catch (e) { /* 못 읽으면 없는 것으로 */ }
            return null;
        },

        // 확장 관련 저장값 전부 초기화 (기타 탭 맨 아래 버튼). 브라우저(copybot_ 접두 키 전부) + 실리 계정 사본을 지우고 새로고침.
        // 채팅·캐릭터·실리 자체 설정은 건드리지 않는다. 되돌릴 수 없으므로 항상 확인창.
        resetAllSettings: async function() {
            const msg = '깡갤 복사기 설정을 전부 지우고 처음 설치한 상태로 되돌립니다.\n'
                + '프리셋·대필 지시문·커스텀 버튼·캡처 규칙 등 복사기 관련 저장값이 브라우저와 실리 계정 양쪽에서 모두 사라지고, 되돌릴 수 없습니다.\n'
                + '(채팅·캐릭터·실리 설정은 건드리지 않습니다)\n\n정말 초기화하시겠습니까?';
            if (!confirm(msg)) return false;
            window.copybot_resetting = true;   // 이후 모든 저장(디바운스·pagehide 포함) 차단 — 지운 직후 화면값으로 다시 써지는 것 방지
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
            let removed = 0;
            for (const store of [window.localStorage, window.sessionStorage]) {
                try {
                    const keys = [];
                    for (let i = 0; i < store.length; i++) {
                        const k = store.key(i);
                        if (k && k.startsWith('copybot_')) keys.push(k);
                    }
                    keys.forEach(k => { store.removeItem(k); removed++; });
                } catch (e) { /* 저장소 접근 불가 — 서버 사본만이라도 지운다 */ }
            }
            let serverDone = Promise.resolve();
            try {
                const ctx = this._serverCtx();
                if (ctx && Object.prototype.hasOwnProperty.call(ctx.extensionSettings, this.SERVER_KEY)) {
                    delete ctx.extensionSettings[this.SERVER_KEY];
                    if (typeof ctx.saveSettingsDebounced === 'function') {
                        serverDone = new Promise(resolve => {
                            let done = false;
                            const finish = () => { if (!done) { done = true; resolve(); } };
                            const ev = ctx.event_types?.SETTINGS_UPDATED;
                            if (ev && typeof ctx.eventSource?.once === 'function') ctx.eventSource.once(ev, finish);   // 서버 저장 완료 신호
                            setTimeout(finish, 4000);   // 안전망: 신호가 안 와도 새로고침은 한다
                            ctx.saveSettingsDebounced();
                        });
                    }
                }
            } catch (e) {
                console.error('깡갤 복사기: 실리 계정 사본 삭제 실패', e);
            }
            window.CopyBotUtils?.debugLog(window.copybot_debug_mode, `설정 초기화: 브라우저 키 ${removed}개 삭제`);
            toastr.info('복사기 설정을 초기화했습니다. 새로고침합니다…');
            await serverDone;
            location.reload();
            return true;
        },

        // 설정 즉시 저장 (페이지 떠날 때 등)
        saveSettingsNow: function() {
            try {
                const settings = {
                    ghostwrite: {
                        enabled: $('#copybot_ghostwrite_toggle').attr('data-enabled') === 'true',
                        text: $('#copybot_ghostwrite_textbox').val() || '',
                        excludeText: $('#copybot_ghostwrite_exclude_textbox').val() || '',
                        position: $('input[name="copybot_ghostwrite_position"]:checked').val() || 'right',
						iconClass: $('#copybot_ghostwrite_icon_picker').data('icon') || 'fa-user-edit',
						useTempField: $('#copybot_temp_field_toggle').attr('data-enabled') === 'true',
                        profile: $('#copybot_ghostwrite_profile_select').val() || 'default',
                        // 프리셋 시스템 통합 (컨텍스트 안전한 방식)
                        presets: window.CopyBotSettings.getPresetsFromNewSystem(), // 현재 프리셋 배열
                        activePreset: $('#copybot_preset_select').val() || '기본 프리셋' // 현재 활성 프리셋명
                    },
                    tagRemove: {
                        enabled: $('#copybot_tag_remove_toggle').attr('data-enabled') === 'true',
                        position: $('#copybot_tag_remove_position').val() || 'bottom_left',
                        iconClass: $('#copybot_tag_remove_icon_picker').data('icon') || 'fa-tags',
                        submenu: $('#copybot_tag_remove_submenu').is(':checked'),
                        inputfield: $('#copybot_tag_remove_inputfield').is(':checked')
                    },
                    delete: {
                        enabled: $('#copybot_delete_toggle').attr('data-enabled') === 'true',
                        position: $('#copybot_delete_position').val() || 'bottom_left',
                        iconClass: $('#copybot_delete_icon_picker').data('icon') || 'fa-trash',
                        submenu: $('#copybot_delete_submenu').is(':checked'),
                        inputfield: $('#copybot_delete_inputfield').is(':checked')
                    },
                    deleteRegenerate: {
                        enabled: $('#copybot_delete_regenerate_toggle').attr('data-enabled') === 'true',
                        position: $('#copybot_delete_regenerate_position').val() || 'bottom_left',
                        iconClass: $('#copybot_delete_regenerate_icon_picker').data('icon') || 'fa-redo',
                        submenu: $('#copybot_delete_regenerate_submenu').is(':checked'),
                        inputfield: $('#copybot_delete_regenerate_inputfield').is(':checked'),
                        cacheMode: $('#copybot_regen_cache_mode').val() || 'off',
                        retryEnabled: $('#copybot_regen_retry_toggle').attr('data-enabled') === 'true'
                    },
                    copy: {
                        includeHidden: $('#copybot_copy_include_hidden').is(':checked')
                    },
                    capture: {
                        anonymize: $('#copybot_capture_anonymize_toggle').attr('data-enabled') === 'true',
                        personaAnon: $('#copybot_capture_persona_anon').is(':checked'),
                        personaTo: String($('#copybot_capture_persona_to').val() ?? 'ㅇㅇ'),
                        globalRules: window.CopyBotUI?.readCaptureRules ? window.CopyBotUI.readCaptureRules('global') : [],
                        charRules: window.CopyBotSettings.collectCaptureCharRules(),
                        images: $('#copybot_capture_images').val() || 'include',
                        choices: $('#copybot_capture_choices').val() || 'skip',
                        status: $('#copybot_capture_statuswin').val() || 'include',
                        show: {
                            bot:  { avatar: $('#copybot_capture_show_bot_avatar').is(':checked'),  name: $('#copybot_capture_show_bot_name').is(':checked'),  text: $('#copybot_capture_show_bot_text').is(':checked') },
                            user: { avatar: $('#copybot_capture_show_user_avatar').is(':checked'), name: $('#copybot_capture_show_user_name').is(':checked'), text: $('#copybot_capture_show_user_text').is(':checked') },
                        },
                        assets: $('#copybot_capture_assets').val() || 'include',
                        scale: $('#copybot_capture_scale').val() || 'full',
                        layout: $('#copybot_capture_layout').val() || 'single',
                        hideKinds: captureHideKinds,
                        hideGlobal: captureHideGlobal
                    },
                    ui: {
                        mode: $('#copybot_mode_toggle button.active').data('mode') || 'text',
                        lastCaptureRange: window.CopyBotCapture?.lastRange || null
                    },
                    customButtons: {
                        enabled: $('#copybot_custom_buttons_toggle').attr('data-enabled') === 'true',
                        slots: window.CopyBotSettings.readCustomSlots()
                    },
                    icons: {
                        order: window.CopyBotUI?.readIconOrder ? window.CopyBotUI.readIconOrder() : null   // 입력필드 아이콘 우선순위 (null = 기본)
                    },
                    floatMenu: {
                        enabled: $('#copybot_float_toggle').attr('data-enabled') === 'true',
                        iconClass: $('#copybot_float_icon_picker').data('icon') || 'fa-bolt',
                        sections: {
                            jump: $('#copybot_fm_section_jump').is(':checked'),
                            write: $('#copybot_fm_section_write').is(':checked'),
                            copy: $('#copybot_fm_section_copy').is(':checked'),
                            hide: $('#copybot_fm_section_hide').is(':checked'),
                            multi_delete: $('#copybot_fm_section_multi_delete').is(':checked'),
                            custom: $('#copybot_fm_section_custom').is(':checked')
                        }
                    },
                    quickMenu: {
						enabled: $('#copybot_quickmenu_toggle').attr('data-enabled') === 'true',
						accessWand: $('#copybot_quickmenu_wand').is(':checked'),
						accessInputIcon: $('#copybot_quickmenu_input_icon').is(':checked'),
						inputIconPosition: $('#copybot_quickmenu_icon_position').val() || 'bottom_left',
						wandIconClass: $('#copybot_quickmenu_wand_icon_picker').data('icon') || 'fa-scroll',
						inputIconClass: $('#copybot_quickmenu_input_icon_picker').data('icon') || 'fa-clipboard',
						sections: {
							jump: $('#copybot_qm_section_jump').is(':checked'),
							write: $('#copybot_qm_section_write').is(':checked'),
							copy: $('#copybot_qm_section_copy').is(':checked'),
							hide: $('#copybot_qm_section_hide').is(':checked'),
							multi_delete: $('#copybot_qm_section_multi_delete').is(':checked'),
							custom: $('#copybot_qm_section_custom').is(':checked')
						}
					},
					misc: {
						hqProfile: $('#copybot_hq_profile_toggle').attr('data-enabled') === 'true',
						removeResize: $('#copybot_remove_resize_toggle').attr('data-enabled') === 'true',
						debugMode: $('#copybot_debug_mode_toggle').attr('data-enabled') === 'true',
						hidePlaceholder: window.CopyBotSettings.getPlaceholderMode() === 'hide',
						placeholderMode: window.CopyBotSettings.getPlaceholderMode(),
						placeholderText: $('#copybot_placeholder_text').val() || '',
						placeholderCss: $('#copybot_placeholder_css').val() || '',
						confirmDelete: $('#copybot_confirm_delete_toggle').attr('data-enabled') === 'true',
						confirmDeleteDefaultApplied: true   // 이 표식이 있는 저장본부터 confirmDelete:false 를 "유저가 직접 껐다"로 존중
					}
                };
                
                // 로드에 실패한 세션에서는 저장하지 않는다 (화면의 기본값으로 기존 저장본을 덮어쓰면 설정이 날아감)
                if (window.copybot_settings_load_failed) {
                    window.CopyBotUtils?.debugLog(window.copybot_debug_mode, '설정 로드 실패 상태라 저장 생략(기존 저장본 보호)');
                    return false;
                }
                if (window.copybot_resetting) return false;   // 초기화 진행 중 — 지운 값을 다시 쓰지 않는다
                settings._savedAt = Date.now();   // 브라우저 저장본 vs 실리 계정 사본 중 최신 판별용
                const json = JSON.stringify(settings);
                // 백업 = 덮어쓰기 직전의 이전 저장본 (같은 값을 두 번 쓰면 백업이 아님)
                let prev = null;
                try { prev = localStorage.getItem('copybot_settings'); } catch (e) { /* 무시 */ }
                if (prev && prev !== json) localStorage.setItem('copybot_settings_backup', prev);
                localStorage.setItem('copybot_settings', json);
                sessionStorage.setItem('copybot_settings_temp', json);
                window.CopyBotSettings.writeServerCopy(json);   // 실리 계정에도 같은 내용(실패해도 브라우저 저장은 유지)
                
                if (window.CopyBotUtils) {
                    window.CopyBotUtils.debugLog(window.copybot_debug_mode, '설정 저장 완료', settings);
                }
                return true;
            } catch (error) {
                console.error('깡갤 복사기: 설정 저장 실패', error);
                return false;
            }
        },

        // === 캡처 요소 숨김 저장소 ===
        // 공통(고정 종류): { kind: true } — 숨기는 것만 저장
        getCaptureHideGlobal: function() {
            return { ...captureHideGlobal };
        },
        setCaptureHideGlobal: function(kind, hidden) {
            if (!kind) return;
            if (hidden) captureHideGlobal[kind] = true;
            else delete captureHideGlobal[kind];
        },
        // 캐릭터별(동적 블록) (키: 캐릭터 아바타 파일명 / 그룹 id): { key: { kind: true } } — 숨기는 것만 저장
        getCaptureHideKinds: function(key) {
            const v = captureHideKinds[key];
            return (v && typeof v === 'object') ? { ...v } : {};
        },
        setCaptureHideKind: function(key, kind, hidden) {
            if (!key || !kind) return;
            const map = (captureHideKinds[key] && typeof captureHideKinds[key] === 'object') ? captureHideKinds[key] : {};
            if (hidden) map[kind] = true;
            else delete map[kind];
            if (Object.keys(map).length) captureHideKinds[key] = map;
            else delete captureHideKinds[key];
        },

        // === 캡처 캐릭터별 익명화 규칙 저장소 (키: 캐릭터 아바타 파일명 / 그룹 id) ===
        getCaptureCharRules: function(key) {
            return Array.isArray(captureCharRules[key]) ? captureCharRules[key] : [];
        },
        // 현재 열린 캐릭터의 규칙을 화면에서 읽어 저장소에 반영한 뒤 전체 맵 반환
        collectCaptureCharRules: function() {
            const key = window.CopyBotCapture?.currentCharKey?.();
            if (key && window.CopyBotUI?.readCaptureRules) {
                const rules = window.CopyBotUI.readCaptureRules('char');
                if (rules.length) captureCharRules[key] = rules;
                else delete captureCharRules[key];
            }
            return captureCharRules;
        },

        // 커스텀 버튼 슬롯 읽기 (설정 저장용)
        readCustomSlots: function() {
            const slots = [];
            $('#copybot_custom_slots .copybot_custom_slot').each(function() {
                const $slot = $(this);
                slots.push({
                    action: $slot.find('.copybot_custom_action').val() || '',
                    iconClass: $slot.find('.copybot_icon_picker').data('icon') || '',
                    submenu: $slot.find('.copybot_custom_submenu').is(':checked'),
                    inputfield: $slot.find('.copybot_custom_inputfield').is(':checked'),
                    position: $slot.find('.copybot_custom_position').val() || 'bottom_left'
                });
            });
            return slots;
        },

        // 프리셋 데이터 추출 (설정 저장용) - 안전성 강화
        getPresetsFromNewSystem: function() {
            try {
                // 🔥 1. CopyBotPresets 모듈에서 직접 가져오기 (최우선)
                if (window.CopyBotPresets && typeof window.CopyBotPresets.getPresets === 'function') {
                    const modulePresets = window.CopyBotPresets.getPresets();
                    if (modulePresets && modulePresets.length > 0) {
                        if (window.CopyBotUtils) {
                            window.CopyBotUtils.debugLog(window.copybot_debug_mode, '프리셋 모듈에서 데이터 가져오기:', modulePresets.length, '개');
                        }
                        return modulePresets;
                    }
                }
                
                // 2. 먼저 기존 일반설정에서 프리셋 데이터 확인
                const existingSettings = localStorage.getItem('copybot_settings');
                if (existingSettings) {
                    const parsed = JSON.parse(existingSettings);
                    if (parsed.ghostwrite && parsed.ghostwrite.presets) {
                        return parsed.ghostwrite.presets; // 이미 통합된 데이터가 있으면 사용
                    }
                }
                
                // 3. 없으면 기존 copybot_presets에서 가져오기 (마이그레이션용)
                const legacyPresets = localStorage.getItem('copybot_presets');
                if (legacyPresets) {
                    const parsed = JSON.parse(legacyPresets);
                    if (window.CopyBotUtils) {
                        window.CopyBotUtils.debugLog(window.copybot_debug_mode, '기존 프리셋 데이터를 일반설정으로 마이그레이션:', parsed.length, '개');
                    }
                    return parsed;
                }
                
                // 4. 둘 다 없으면 기본 프리셋만 반환
                return [{ name: '기본 프리셋', prompt: '', excludePrompt: '', profile: 'default' }];
                
            } catch (error) {
                console.error('깡갤 복사기: 프리셋 데이터 추출 실패', error);
                return [{ name: '기본 프리셋', prompt: '', excludePrompt: '', profile: 'default' }];
            }
        },

        // 설정 로드 함수 강화
        loadSettings: function(callbacks) {
            try {
                // 다중 소스에서 설정 복구 시도: 본 키 → 백업(이전 저장본) → 세션 임시. 파싱되는 첫 소스를 쓴다.
                // 저장본이 있는데 전부 파싱 실패면 "로드 실패" 표식을 세워 이번 세션의 저장을 막는다(기본값으로 덮어써 설정을 날리지 않음).
                const sources = [
                    ['copybot_settings', () => localStorage.getItem('copybot_settings')],
                    ['copybot_settings_backup', () => localStorage.getItem('copybot_settings_backup')],
                    ['copybot_settings_temp', () => sessionStorage.getItem('copybot_settings_temp')],
                ];
                let settings = null;
                let anyStored = false;
                let sourceName = null;
                for (const [name, read] of sources) {
                    let raw = null;
                    try { raw = read(); } catch (e) { continue; }
                    if (!raw) continue;
                    anyStored = true;
                    try {
                        const parsed = JSON.parse(raw);
                        if (parsed && typeof parsed === 'object') { settings = parsed; sourceName = name; break; }
                    } catch (e) {
                        window.CopyBotUtils?.debugLog(window.copybot_debug_mode, `설정 소스 ${name} 파싱 실패, 다음 소스 시도`);
                    }
                }
                // 실리 계정(서버) 사본: 브라우저 저장본이 없거나(기기 교체·사이트 데이터 삭제) 전부 깨졌거나, 서버 쪽이 더 최근이면 그쪽을 쓴다.
                // 타임스탬프 없는 구버전 브라우저 저장본은 이 기기의 최신 상태로 보고 그대로 쓴다(다음 저장 때 타임스탬프와 서버 사본이 생김).
                const picked = window.CopyBotSettings.pickLatestSettings(settings, window.CopyBotSettings.readServerCopy());
                if (picked.source === 'server') { settings = picked.settings; sourceName = 'server'; }
                window.CopyBotUtils?.debugLog(window.copybot_debug_mode, `설정 소스: ${sourceName || '없음'}`);
                window.copybot_settings_load_failed = false;
                if (!settings) {
                    if (anyStored) {
                        window.copybot_settings_load_failed = true;
                        console.error('깡갤 복사기: 저장된 설정을 읽을 수 없어 이번 세션에는 설정을 저장하지 않습니다(기존 저장본 보호).');
                    } else {
                        window.CopyBotUtils?.debugLog(window.copybot_debug_mode, '깡갤 복사기: 저장된 설정이 없음');
                    }
                    return;
                }
                // 구버전·일부만 남은 설정도 끝까지 적용되게: 아래에서 옵셔널 없이 접근하는 묶음은 빈 객체로 보정
                ['ghostwrite', 'tagRemove', 'delete', 'deleteRegenerate', 'misc'].forEach(k => {
                    if (!settings[k] || typeof settings[k] !== 'object') settings[k] = {};
                });
                if (window.CopyBotUtils) {
                    window.CopyBotUtils.debugLog(window.copybot_debug_mode, '깡갤 복사기: 설정 로드 중', settings);
                }


                // 대필 설정
                if (settings.ghostwrite) {
                    const isGhostwriteEnabled = settings.ghostwrite.enabled === true;
                    $('#copybot_ghostwrite_toggle').attr('data-enabled', isGhostwriteEnabled).text(isGhostwriteEnabled ? 'ON' : 'OFF');
                    $('#copybot_ghostwrite_textbox').val(settings.ghostwrite.text || '');
                    $('#copybot_ghostwrite_exclude_textbox').val(settings.ghostwrite.excludeText || '');
                    
                    if (settings.ghostwrite.position) {
						$(`input[name="copybot_ghostwrite_position"][value="${settings.ghostwrite.position}"]`).prop('checked', true);
					}

					// 대필 아이콘 클래스 로드
					if (settings.ghostwrite.iconClass) {
						const $picker = $('#copybot_ghostwrite_icon_picker');
						$picker
							.removeClass()
							.addClass(`fa-solid ${settings.ghostwrite.iconClass} copybot_icon_picker copybot_inline_icon_picker`)
							.data('icon', settings.ghostwrite.iconClass);
					}

					// 대필 아이콘 피커 표시/숨김 (토글 상태에 따라)
					if (settings.ghostwrite.enabled) {
						$('#copybot_ghostwrite_icon_picker').show();
					}
                    
                    // 대필 프로필 설정 로드 (타이밍 개선)
                    if (settings.ghostwrite.profile) {
                        setTimeout(() => {
                            $('#copybot_ghostwrite_profile_select').val(settings.ghostwrite.profile);
                            if (window.CopyBotUtils) {
                                window.CopyBotUtils.debugLog(window.copybot_debug_mode, '저장된 대필 프로필 설정 적용:', settings.ghostwrite.profile);
                            }
                        }, 200);
                    }
                    
                    // 임시 대필칸 사용 설정 로드
                    const useTempField = settings.ghostwrite.useTempField !== undefined ? settings.ghostwrite.useTempField : false;
                    $('#copybot_temp_field_toggle').attr('data-enabled', useTempField).text(useTempField ? 'ON' : 'OFF');
                    
                    // 토글 상태에 따라 모든 관련 UI를 제어
                    const ghostwriteElements = $('#copybot_ghostwrite_position_options, #copybot_ghostwrite_panel .copybot_description, #copybot_ghostwrite_textbox, #copybot_ghostwrite_exclude_container');
                    if (isGhostwriteEnabled) {
                        ghostwriteElements.show();
                    } else {
                        ghostwriteElements.hide();
                    }
                }

                // 기능별 토글 설정
                $('#copybot_tag_remove_toggle').attr('data-enabled', settings.tagRemove.enabled).text(settings.tagRemove.enabled ? 'ON' : 'OFF');
                $('#copybot_delete_toggle').attr('data-enabled', settings.delete.enabled).text(settings.delete.enabled ? 'ON' : 'OFF');
                $('#copybot_delete_regenerate_toggle').attr('data-enabled', settings.deleteRegenerate.enabled).text(settings.deleteRegenerate.enabled ? 'ON' : 'OFF');

                if (settings.tagRemove.position) {
                    $('#copybot_tag_remove_position').val(settings.tagRemove.position);
                }
                // 태그제거 아이콘 로드
                const tagRemoveIcon = settings.tagRemove.iconClass || 'fa-tags';
                $('#copybot_tag_remove_icon_picker')
                    .removeClass()
                    .addClass(`fa-solid ${tagRemoveIcon} copybot_icon_picker copybot_inline_icon_picker`)
                    .data('icon', tagRemoveIcon);
                // 태그제거 체크박스 로드 (마이그레이션: 기존 enabled=true 유저는 inputfield=true)
                const tagRemoveSubmenu = settings.tagRemove.submenu || false;
                const tagRemoveInputfield = settings.tagRemove.inputfield !== undefined ? settings.tagRemove.inputfield : settings.tagRemove.enabled;
                $('#copybot_tag_remove_submenu').prop('checked', tagRemoveSubmenu);
                $('#copybot_tag_remove_inputfield').prop('checked', tagRemoveInputfield);
                
                if (settings.delete.position) {
                    $('#copybot_delete_position').val(settings.delete.position);
                }
                // 삭제 아이콘 로드
                const deleteIcon = settings.delete.iconClass || 'fa-trash';
                $('#copybot_delete_icon_picker')
                    .removeClass()
                    .addClass(`fa-solid ${deleteIcon} copybot_icon_picker copybot_inline_icon_picker`)
                    .data('icon', deleteIcon);
                // 삭제 체크박스 로드 (마이그레이션: 기존 enabled=true 유저는 inputfield=true)
                const deleteSubmenu = settings.delete.submenu || false;
                const deleteInputfield = settings.delete.inputfield !== undefined ? settings.delete.inputfield : settings.delete.enabled;
                $('#copybot_delete_submenu').prop('checked', deleteSubmenu);
                $('#copybot_delete_inputfield').prop('checked', deleteInputfield);
                
                if (settings.deleteRegenerate.position) {
                    $('#copybot_delete_regenerate_position').val(settings.deleteRegenerate.position);
                }
                // 재생성 아이콘 로드
                const regenIcon = settings.deleteRegenerate.iconClass || 'fa-redo';
                $('#copybot_delete_regenerate_icon_picker')
                    .removeClass()
                    .addClass(`fa-solid ${regenIcon} copybot_icon_picker copybot_inline_icon_picker`)
                    .data('icon', regenIcon);
                // 재생성 체크박스 로드 (마이그레이션: 기존 enabled=true 유저는 inputfield=true)
                const regenSubmenu = settings.deleteRegenerate.submenu || false;
                const regenInputfield = settings.deleteRegenerate.inputfield !== undefined ? settings.deleteRegenerate.inputfield : settings.deleteRegenerate.enabled;
                $('#copybot_delete_regenerate_submenu').prop('checked', regenSubmenu);
                $('#copybot_delete_regenerate_inputfield').prop('checked', regenInputfield);

                if (settings.tagRemove.enabled) $('#copybot_tag_remove_options').show(); else $('#copybot_tag_remove_options').hide();
                if (settings.delete.enabled) $('#copybot_delete_options').show(); else $('#copybot_delete_options').hide();
                if (settings.deleteRegenerate.enabled) $('#copybot_delete_regenerate_options').show(); else $('#copybot_delete_regenerate_options').hide();

                // 재생성 캐시 우회 모드 (기본 off)
                $('#copybot_regen_cache_mode').val(['off', 'light', 'strong'].includes(settings.deleteRegenerate.cacheMode) ? settings.deleteRegenerate.cacheMode : 'off');

                // 끈질기게 재시도 (기본 off)
                const retryEnabled = settings.deleteRegenerate.retryEnabled === true;
                $('#copybot_regen_retry_toggle').attr('data-enabled', retryEnabled).text(retryEnabled ? 'ON' : 'OFF');

                // 복사 옵션 (기본 off)
                $('#copybot_copy_include_hidden').prop('checked', settings.copy?.includeHidden === true);

                // 캡처 옵션 (익명화 기본 ON — 2026-10-09 유저 확정, 개인정보 안전장치라 기본 OFF 원칙의 예외. 저장값이 명시적 false 일 때만 OFF. 이미지는 같이 캡처가 기본)
                const captureAnon = settings.capture?.anonymize !== false;
                $('#copybot_capture_anonymize_toggle').attr('data-enabled', captureAnon).text(captureAnon ? 'ON' : 'OFF');
                $('#copybot_capture_anonymize_options').toggle(captureAnon);
                // 페르소나 이름 항상 익명화: 기본 ON (유저 확정 예외). 저장값이 명시적으로 false 일 때만 OFF. 바꿀 글자 기본 'ㅇㅇ'
                $('#copybot_capture_persona_anon').prop('checked', settings.capture?.personaAnon !== false);
                $('#copybot_capture_persona_to').val(typeof settings.capture?.personaTo === 'string' ? settings.capture.personaTo : 'ㅇㅇ');
                // 품질: 2단계(full 기본/light). 구버전 숫자값은 3→full, 1·2→light 로 이관
                const rawScale = String(settings.capture?.scale ?? '');
                $('#copybot_capture_scale').val(rawScale === 'light' || rawScale === '1' || rawScale === '2' ? 'light' : 'full');
                $('#copybot_capture_images').val(settings.capture?.images === 'skip' ? 'skip' : 'include');
                $('#copybot_capture_choices').val(settings.capture?.choices === 'include' ? 'include' : 'skip');   // 기본: 빼고 캡처
                $('#copybot_capture_statuswin').val(settings.capture?.status === 'skip' ? 'skip' : 'include');       // 기본: 상태창 같이 캡처
                // 표시 요소 (유저 확정 기본값: 봇 프사·이름·메시지 + 유저 프사·메시지, 유저 이름만 가림). 저장값이 불리언일 때만 그 값
                {
                    const show = settings.capture?.show || {};
                    const def = { bot: { avatar: true, name: true, text: true }, user: { avatar: true, name: false, text: true } };
                    for (const role of ['bot', 'user']) for (const part of ['avatar', 'name', 'text']) {
                        const v = show[role]?.[part];
                        $(`#copybot_capture_show_${role}_${part}`).prop('checked', typeof v === 'boolean' ? v : def[role][part]);
                    }
                }
                $('#copybot_capture_assets').val(settings.capture?.assets === 'skip' ? 'skip' : 'include');
                $('#copybot_capture_layout').val(settings.capture?.layout === 'split' ? 'split' : 'single');
                captureHideKinds = (settings.capture?.hideKinds && typeof settings.capture.hideKinds === 'object') ? settings.capture.hideKinds : {};
                captureHideGlobal = (settings.capture?.hideGlobal && typeof settings.capture.hideGlobal === 'object') ? settings.capture.hideGlobal : {};
                // 마지막 캡처 기록(같은 채팅이면 캡처 모드 진입 시 미리보기 자동 표시)
                if (window.CopyBotCapture) {
                    const lr = settings.ui?.lastCaptureRange;
                    window.CopyBotCapture.lastRange = (lr && typeof lr === 'object' && Number.isInteger(lr.s) && Number.isInteger(lr.e)) ? { s: lr.s, e: lr.e, chatKey: lr.chatKey || null } : null;
                }
                // 메인 모드(텍스트/캡처): 마지막으로 쓴 모드 복원 (기본 텍스트)
                if (window.CopyBotUI?.setMode) window.CopyBotUI.setMode(settings.ui?.mode === 'capture' ? 'capture' : 'text', { save: false });
                // 규칙: 새 구조(globalRules/charRules). 구버전 텍스트 규칙(rules)은 공통 규칙으로 이관
                let globalRules = Array.isArray(settings.capture?.globalRules) ? settings.capture.globalRules : null;
                if (!globalRules && typeof settings.capture?.rules === 'string' && window.CopyBotCapture?.parseRules) {
                    globalRules = window.CopyBotCapture.parseRules(settings.capture.rules);
                }
                captureCharRules = (settings.capture?.charRules && typeof settings.capture.charRules === 'object') ? settings.capture.charRules : {};
                if (window.CopyBotUI?.renderCaptureRules) {
                    window.CopyBotUI.renderCaptureRules('global', globalRules || []);
                    window.CopyBotUI.refreshCaptureCharScope();
                }

                // 커스텀 버튼 (기본 off)
                const customEnabled = settings.customButtons?.enabled === true;
                $('#copybot_custom_buttons_toggle').attr('data-enabled', customEnabled).text(customEnabled ? 'ON' : 'OFF');
                $('#copybot_custom_buttons_options').toggle(customEnabled);
                if (window.CopyBotUI?.applyCustomSlotSettings) {
                    window.CopyBotUI.applyCustomSlotSettings(settings.customButtons?.slots || []);
                }
                // 입력필드 아이콘 순서 (저장값 없으면 기본 순서)
                if (window.CopyBotUI?.renderIconOrderList) {
                    window.CopyBotUI.renderIconOrderList(Array.isArray(settings.icons?.order) ? settings.icons.order : null);
                }

                // 플로팅 메뉴 (기본 off)
                const floatEnabled = settings.floatMenu?.enabled === true;
                $('#copybot_float_toggle').attr('data-enabled', floatEnabled).text(floatEnabled ? 'ON' : 'OFF');
                $('#copybot_float_options').toggle(floatEnabled);
                $('#copybot_float_icon_picker').toggle(floatEnabled);
                if (settings.floatMenu?.iconClass) {
                    $('#copybot_float_icon_picker')
                        .removeClass()
                        .addClass(`fa-solid ${settings.floatMenu.iconClass} copybot_icon_picker copybot_inline_icon_picker`)
                        .data('icon', settings.floatMenu.iconClass);
                }
                if (settings.floatMenu?.sections) {
                    const fs = settings.floatMenu.sections;
                    ['jump', 'write', 'copy', 'hide', 'multi_delete', 'custom'].forEach(key => {
                        $(`#copybot_fm_section_${key}`).prop('checked', fs[key] !== false);
                    });
                }
                setTimeout(() => {
                    window.CopyBotWandMenu?.refreshFloatButton?.();
                    window.CopyBotWandMenu?.refreshCustomSections?.();
                    window.CopyBotWandMenu?.refreshWandRegistration?.();
                }, 150);
                
                // 기타 설정 로드
                if (settings.misc) {
                    // 각 설정값이 명시적으로 true일 때만 ON으로 설정합니다. (기본값 OFF)
                    const hqProfileEnabled = settings.misc.hqProfile === true;
                    const removeResizeEnabled = settings.misc.removeResize === true;
                    const hidePlaceholderEnabled = settings.misc.hidePlaceholder === true;
                    const confirmDeleteEnabled = window.CopyBotSettings.readConfirmDeleteFromMisc(settings.misc);   // 좆됨방지만 기본 ON (예외)
                    window.copybot_debug_mode = settings.misc.debugMode === true;
                    if (callbacks?.setDebugMode) callbacks.setDebugMode(window.copybot_debug_mode);   // 모듈별 내부 플래그도 저장값으로

                    $('#copybot_hq_profile_toggle').attr('data-enabled', hqProfileEnabled).text(hqProfileEnabled ? 'ON' : 'OFF');
                    $('#copybot_remove_resize_toggle').attr('data-enabled', removeResizeEnabled).text(removeResizeEnabled ? 'ON' : 'OFF');
                    $('#copybot_hide_placeholder_toggle').attr('data-enabled', hidePlaceholderEnabled).text(hidePlaceholderEnabled ? 'ON' : 'OFF');
                    $('#copybot_confirm_delete_toggle').attr('data-enabled', confirmDeleteEnabled).text(confirmDeleteEnabled ? 'ON' : 'OFF');

                    // 입력창 안내문 모드 (구버전 hidePlaceholder → 'hide' 로 이행)
                    const placeholderMode = ['off', 'hide', 'replace'].includes(settings.misc.placeholderMode)
                        ? settings.misc.placeholderMode
                        : (hidePlaceholderEnabled ? 'hide' : 'off');
                    $('#copybot_placeholder_mode').val(placeholderMode);
                    $('#copybot_placeholder_text').val(settings.misc.placeholderText || '');
                    $('#copybot_placeholder_css').val(settings.misc.placeholderCss || '');
                    $('#copybot_placeholder_replace_options').toggle(placeholderMode === 'replace');
                    $('#copybot_hide_placeholder_toggle').attr('data-enabled', placeholderMode === 'hide').text(placeholderMode === 'hide' ? 'ON' : 'OFF');
                    $('#copybot_debug_mode_toggle').attr('data-enabled', window.copybot_debug_mode).text(window.copybot_debug_mode ? 'ON' : 'OFF');

                    // 콜백 함수들 실행
                    if (callbacks) {
                        if (hqProfileEnabled && callbacks.enableHighQualityProfiles) {
                            callbacks.enableHighQualityProfiles();
                        } else if (callbacks.disableHighQualityProfiles) {
                            callbacks.disableHighQualityProfiles();
                        }
                        
                        if (removeResizeEnabled) {
                            this.removeResizeHandle();
                        }
                        
                        // placeholder 설정 적용 (안전한 방식)
                        setTimeout(() => {
                            this.safeApplyPlaceholderSetting();
                        }, 200);
                    }
                }

                // 퀵메뉴 설정 로드
				if (settings.quickMenu) {
					const isQuickMenuEnabled = settings.quickMenu.enabled === true;
					$('#copybot_quickmenu_toggle').attr('data-enabled', isQuickMenuEnabled).text(isQuickMenuEnabled ? 'ON' : 'OFF');
					
					// 접근 방식 체크박스 복원
					$('#copybot_quickmenu_wand').prop('checked', settings.quickMenu.accessWand === true);
					$('#copybot_quickmenu_input_icon').prop('checked', settings.quickMenu.accessInputIcon === true);
					
					// 위치 드롭다운 복원
					if (settings.quickMenu.inputIconPosition) {
						$('#copybot_quickmenu_icon_position').val(settings.quickMenu.inputIconPosition);
					}
					
					// 퀵메뉴 ON/OFF에 따른 접근방식 옵션 표시/숨김
					if (isQuickMenuEnabled) {
						$('#copybot_quickmenu_access_options').show();
						// 입력필드 아이콘 체크 시 위치 드롭다운 표시
						if (settings.quickMenu.accessInputIcon) {
							$('#copybot_quickmenu_position_container').show();
							$('#copybot_quickmenu_input_icon_picker').show();
						}

						// 마법봉 체크 시 아이콘 피커 표시
						if (settings.quickMenu.accessWand) {
							$('#copybot_quickmenu_wand_icon_picker').show();
						}

						// 마법봉 아이콘 클래스 로드 (구버전 기본값 fa-clipboard 는 새 기본값 fa-scroll 로 이관 — 예전엔 고를 수 없던 기본이었으므로)
						if (settings.quickMenu.wandIconClass) {
							const wandIcon = settings.quickMenu.wandIconClass === 'fa-clipboard' ? 'fa-scroll' : settings.quickMenu.wandIconClass;
							const $wandPicker = $('#copybot_quickmenu_wand_icon_picker');
							$wandPicker
								.removeClass()
								.addClass(`fa-solid ${wandIcon} copybot_icon_picker copybot_inline_icon_picker`)
								.data('icon', wandIcon);
						}

						// 입력필드 아이콘 클래스 로드
						if (settings.quickMenu.inputIconClass) {
							const $inputPicker = $('#copybot_quickmenu_input_icon_picker');
							$inputPicker
								.removeClass()
								.addClass(`fa-solid ${settings.quickMenu.inputIconClass} copybot_icon_picker copybot_inline_icon_picker`)
								.data('icon', settings.quickMenu.inputIconClass);
						}
					} else {
						$('#copybot_quickmenu_access_options').hide();
					}
					
					// 섹션 표시 설정 로드 (기본값: 모두 ON)
					if (settings.quickMenu.sections) {
						const sections = settings.quickMenu.sections;
						$('#copybot_qm_section_jump').prop('checked', sections.jump !== false);
						$('#copybot_qm_section_write').prop('checked', sections.write !== false);
						$('#copybot_qm_section_copy').prop('checked', sections.copy !== false);
						$('#copybot_qm_section_hide').prop('checked', sections.hide !== false);
						$('#copybot_qm_section_multi_delete').prop('checked', sections.multi_delete !== false);
							$('#copybot_qm_section_custom').prop('checked', sections.custom !== false);
					}

					// 퀵메뉴 섹션 표시/숨김 적용
					if (window.CopyBotWandMenu && window.CopyBotWandMenu.applySectionVisibility) {
						setTimeout(() => {
							window.CopyBotWandMenu.applySectionVisibility();
						}, 100);
					}

					if (window.CopyBotUtils) {
						window.CopyBotUtils.debugLog(window.copybot_debug_mode, '퀵메뉴 설정 로드:', settings.quickMenu);
					}
				}

				// 설정 로드 후 프리셋 관련 UI 업데이트 (순서 개선)
                if (callbacks && callbacks.updatePresetDropdown) {
                    setTimeout(() => {
                        callbacks.updatePresetDropdown();
                        
                        // 🔥 중요: 활성 프리셋 강제 로드 (새로고침 시 동기화 문제 해결)
                        if (settings.ghostwrite && settings.ghostwrite.activePreset && callbacks.loadPresetFromSettings) {
                            setTimeout(() => {
                                callbacks.loadPresetFromSettings(settings.ghostwrite.activePreset);
                                if (window.CopyBotUtils) {
                                    window.CopyBotUtils.debugLog(window.copybot_debug_mode, '활성 프리셋 로드 (일반설정, 다중 소스):', settings.ghostwrite.activePreset);
                                }
                            }, 50);
                        }
                        
                        if (window.CopyBotUtils) {
                            window.CopyBotUtils.debugLog(window.copybot_debug_mode, '프리셋 드롭다운 업데이트 완료');
                        }
                    }, 100);
                }

                if (window.CopyBotUtils) {
                    window.CopyBotUtils.debugLog(window.copybot_debug_mode, '깡갤 복사기: 설정 로드 완료');
                }
            } catch (error) {
                console.error('깡갤 복사기: 설정 로드 실패', error);
            }
        },

        // 입력창 조절점 제거 기능
        removeResizeHandle: function() {
            if (window.CopyBotUtils) {
                window.CopyBotUtils.debugLog(window.copybot_debug_mode, '깡갤 복사기: 입력창 및 임시 대필칸 조절점 제거');
            }
            
            const textarea = document.querySelector('#send_textarea');
            const tempPrompt = document.querySelector('#copybot_temp_prompt');
            
            if (textarea) {
                textarea.style.setProperty('resize', 'none', 'important');
            }
            if (tempPrompt) {
                tempPrompt.style.setProperty('resize', 'none', 'important');
            }
            
            // 기존 스타일 제거
            if (resizeStyleElement) {
                resizeStyleElement.remove();
            }
            
            // CSS 스타일 추가
            resizeStyleElement = document.createElement('style');
            resizeStyleElement.textContent = `
                #send_textarea.mdHotkeys,
                #copybot_temp_prompt {
                    resize: none !important;
                }
                
                /* 웹킷 브라우저의 resize handle 완전 제거 */
                #send_textarea::-webkit-resizer,
                #copybot_temp_prompt::-webkit-resizer {
                    display: none !important;
                }
            `;
            document.head.appendChild(resizeStyleElement);
        },

        // 조절점 복원
        restoreResizeHandle: function() {
            if (window.CopyBotUtils) {
                window.CopyBotUtils.debugLog(window.copybot_debug_mode, '깡갤 복사기: 입력창 및 임시 대필칸 조절점 복원');
            }
            
            const textarea = document.querySelector('#send_textarea');
            const tempPrompt = document.querySelector('#copybot_temp_prompt');
            
            if (textarea) {
                textarea.style.removeProperty('resize');
            }
            if (tempPrompt) {
                tempPrompt.style.removeProperty('resize');
            }
            
            // CSS 스타일 제거
            if (resizeStyleElement) {
                resizeStyleElement.remove();
                resizeStyleElement = null;
            }
        },

        // ===== 입력창 안내문(placeholder) 모드: 'off'(기본) | 'hide'(숨김) | 'replace'(변경) =====

        // 현재 모드 읽기 (새 select 우선, 없으면 구버전 토글)
        getPlaceholderMode: function() {
            const mode = $('#copybot_placeholder_mode').val();
            if (mode === 'off' || mode === 'hide' || mode === 'replace') return mode;
            return $('#copybot_hide_placeholder_toggle').attr('data-enabled') === 'true' ? 'hide' : 'off';
        },

        // 특이도 최대 셀렉터 (테마 확장의 `body.salty #send_textarea::placeholder {... !important}` 류를 이김)
        _placeholderSelectors: function() {
            const ids = ['send_textarea', 'copybot_temp_prompt'];
            return ids.flatMap(id => {
                const rep = `#${id}`.repeat(4);
                return [`html body ${rep}::placeholder`, `html body ${rep}::-webkit-input-placeholder`];
            }).join(',\n');
        },

        // 사용자 CSS 선언문에 !important 를 보강 (선택자 없이 속성만 적게 되어 있음)
        _forceImportant: function(css) {
            return String(css || '')
                .split(';')
                .map(decl => decl.trim())
                .filter(decl => decl && decl.includes(':') && !/[{}<>]/.test(decl))
                .map(decl => /!important\s*$/i.test(decl) ? decl : `${decl} !important`)
                .join(';\n');
        },

        // 모드 적용 (하나의 진입점)
        applyPlaceholderMode: function(mode) {
            const utils = window.CopyBotUtils;
            if (placeholderStyleElement) {
                placeholderStyleElement.remove();
                placeholderStyleElement = null;
            }

            if (mode === 'hide') {
                placeholderStyleElement = document.createElement('style');
                placeholderStyleElement.id = 'copybot_placeholder_style';
                placeholderStyleElement.textContent = `${this._placeholderSelectors()} {
                    opacity: 0 !important;
                    color: transparent !important;
                    text-shadow: none !important;
                    visibility: hidden !important;
                }`;
                document.head.appendChild(placeholderStyleElement);
                // 2중 안전장치: 속성 자체를 비움 (ST 가 연결 상태 바뀔 때 다시 써넣어도 Observer 가 계속 비움)
                this.startPlaceholderAttrOverride('');
                utils?.debugLog(window.copybot_debug_mode, '입력창 안내문: 숨김 적용');
                return;
            }

            if (mode === 'replace') {
                const text = String($('#copybot_placeholder_text').val() || '');
                const css = this._forceImportant($('#copybot_placeholder_css').val());
                // 테마가 ::placeholder 를 숨기는 경우에도 바꾼 문구가 보이도록 기본 표시값을 강제 + 사용자 CSS
                placeholderStyleElement = document.createElement('style');
                placeholderStyleElement.id = 'copybot_placeholder_style';
                placeholderStyleElement.textContent = `${this._placeholderSelectors()} {\n    opacity: 1 !important;\n    visibility: visible !important;\n${css}\n}`;
                document.head.appendChild(placeholderStyleElement);
                this.startPlaceholderAttrOverride(text);
                utils?.debugLog(window.copybot_debug_mode, '입력창 안내문: 변경 적용', { text, css });
                return;
            }

            this.stopPlaceholderAttrOverride();
            utils?.debugLog(window.copybot_debug_mode, '입력창 안내문: 기본으로 복원');
        },

        // (하위 호환) 숨김 / 복원
        hidePlaceholder: function() { this.applyPlaceholderMode('hide'); },
        restorePlaceholder: function() { this.applyPlaceholderMode('off'); },

        // placeholder 속성을 원하는 값으로 고정 (원본은 기억해 뒀다가 복원 시 되돌림)
        // ⚠️ 안전장치: 다른 테마/확장 스크립트가 같은 속성을 계속 되돌리면 MutationObserver 끼리 무한 핑퐁 →
        //    마이크로태스크가 비워지지 않아 페이지 전체가 멈춘다. 그래서
        //    ① 되돌리기는 동기(관찰 콜백 안)로 하지 않고 다음 프레임에 1번만 예약하고,
        //    ② 1초에 20번 넘게 싸우면 즉시 포기(관찰 해제)하고 CSS 숨김만 남긴다.
        startPlaceholderAttrOverride: function(desired) {
            const textarea = document.querySelector('#send_textarea');
            if (!textarea) return;

            const lastOverridePlaceholder = placeholderOverrideValue;
            placeholderOverrideValue = desired;

            let fightCount = 0;
            let fightWindowStart = Date.now();
            let scheduled = false;

            const apply = () => {
                const current = textarea.getAttribute('placeholder') ?? '';
                if (current === desired) return;
                // ST 원본 문구만 기억 (우리가 넣은 값은 제외)
                if (current && current !== lastOverridePlaceholder) {
                    lastKnownPlaceholder = current;
                }
                textarea.setAttribute('placeholder', desired);
            };

            const onMutation = () => {
                const now = Date.now();
                if (now - fightWindowStart > 1000) { fightWindowStart = now; fightCount = 0; }
                fightCount++;
                if (fightCount > 20) {
                    // 다른 스크립트와 충돌 중 → 포기 (CSS 숨김/변경 스타일은 그대로 유지됨)
                    if (placeholderObserver) { placeholderObserver.disconnect(); placeholderObserver = null; }
                    window.CopyBotUtils?.debugLog(window.copybot_debug_mode, '입력창 안내문: 다른 스크립트와 속성 충돌이 반복되어 속성 고정을 중단함 (CSS 만 유지)');
                    return;
                }
                if (scheduled) return;
                scheduled = true;
                requestAnimationFrame(() => { scheduled = false; apply(); });
            };

            if (placeholderObserver) {
                placeholderObserver.disconnect();
            }
            apply();
            placeholderObserver = new MutationObserver(onMutation);
            placeholderObserver.observe(textarea, { attributes: true, attributeFilter: ['placeholder'] });
        },

        // 실리 기본 안내문 알아내기 (기억해 둔 원본 → 없으면 data-i18n 의 connected_text 를 실리 번역기로)
        _defaultPlaceholderText: function(textarea) {
            if (lastKnownPlaceholder) return lastKnownPlaceholder;
            try {
                const i18n = textarea.getAttribute('data-i18n') || '';
                const m = i18n.match(/\[connected_text\]([^;]+)/);
                const english = m ? m[1].trim() : 'Type a message, or /? for help';
                const ctx = window.SillyTavern?.getContext?.();
                const translated = typeof ctx?.translate === 'function' ? ctx.translate(english) : english;
                return translated || english;
            } catch (e) {
                return 'Type a message, or /? for help';
            }
        },

        // 속성 고정 해제 및 원본 복원 (즉시 반영)
        stopPlaceholderAttrOverride: function() {
            if (placeholderObserver) {
                placeholderObserver.disconnect();
                placeholderObserver = null;
            }
            // 우리가 속성을 고정한 적이 없으면(모드 '기본') 입력창을 아예 건드리지 않는다 — 미사용 시 무영향
            if (placeholderOverrideValue === null) return;
            const textarea = document.querySelector('#send_textarea');
            if (textarea) {
                const current = textarea.getAttribute('placeholder') ?? '';
                if (!current || current === placeholderOverrideValue) {
                    textarea.setAttribute('placeholder', this._defaultPlaceholderText(textarea));
                }
            }
            placeholderOverrideValue = null;
        },

        // 안전한 placeholder 적용 함수 (타이밍 이슈 해결)
        safeApplyPlaceholderSetting: function() {
            const mode = this.getPlaceholderMode();

            // DOM 요소가 준비될 때까지 재시도
            const applyWithRetry = (attempts = 0) => {
                const textarea = document.querySelector('#send_textarea');

                if (textarea && textarea.isConnected) {
                    this.applyPlaceholderMode(mode);
                } else if (attempts < 10) {
                    if (window.CopyBotUtils) {
                        window.CopyBotUtils.debugLog(window.copybot_debug_mode, `placeholder 적용 재시도 ${attempts + 1}/10`);
                    }
                    setTimeout(() => applyWithRetry(attempts + 1), 100);
                } else {
                    if (window.CopyBotUtils) {
                        window.CopyBotUtils.debugLog(window.copybot_debug_mode, 'placeholder 적용 실패 - send_textarea 요소를 찾을 수 없음');
                    }
                }
            };
            
            applyWithRetry();
        }
    };

    // 디바운스 중인 저장이 있으면 페이지를 떠나기 전에 반드시 기록
    window.addEventListener('pagehide', () => {
        if (window.copybot_resetting) return;   // 초기화 중엔 저장 금지
        if (window.CopyBotSettings._saveTimer) {
            clearTimeout(window.CopyBotSettings._saveTimer);
            window.CopyBotSettings._saveTimer = null;
            window.CopyBotSettings.saveSettingsNow();
        }
    });

    if (window.copybot_debug_mode) {
        console.log('CopyBotSettings 모듈 로드 완료');
    }
})();