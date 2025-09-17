// 깡갤 복사기 설정 관리 모듈
// 설정 저장/로드, placeholder, resize handle 관리
(function() {
    'use strict';

    // placeholder 관리용 스타일 요소들
    let placeholderStyleElement = null;
    let resizeStyleElement = null;

    // 전역 네임스페이스 생성
    window.CopyBotSettings = {
        
        // 설정 저장 함수 강화
        saveSettings: function() {
            try {
                const settings = {
                    position: $('input[name="copybot_position"]:checked').val() || 'right',
                    ghostwrite: {
                        enabled: $('#copybot_ghostwrite_toggle').attr('data-enabled') === 'true',
                        text: $('#copybot_ghostwrite_textbox').val() || '',
                        excludeText: $('#copybot_ghostwrite_exclude_textbox').val() || '',
                        position: $('input[name="copybot_ghostwrite_position"]:checked').val() || 'right',
                        useTempField: $('#copybot_temp_field_toggle').attr('data-enabled') === 'true',
                        profile: $('#copybot_ghostwrite_profile_select').val() || 'default',
                        // 프리셋 시스템 통합 (컨텍스트 안전한 방식)
                        presets: window.CopyBotSettings.getPresetsFromNewSystem(), // 현재 프리셋 배열
                        activePreset: $('#copybot_preset_select').val() || '기본 프리셋' // 현재 활성 프리셋명
                    },
                    tagRemove: {
                        enabled: $('#copybot_tag_remove_toggle').attr('data-enabled') === 'true',
                        button: $('#copybot_tag_remove_button').is(':checked'),
                        icon: $('#copybot_tag_remove_icon').is(':checked')
                    },
                    delete: {
                        enabled: $('#copybot_delete_toggle').attr('data-enabled') === 'true',
                        button: $('#copybot_delete_button').is(':checked'),
                        icon: $('#copybot_delete_icon').is(':checked')
                    },
                    deleteRegenerate: {
                        enabled: $('#copybot_delete_regenerate_toggle').attr('data-enabled') === 'true',
                        button: $('#copybot_delete_regenerate_button').is(':checked'),
                        icon: $('#copybot_delete_regenerate_icon').is(':checked')
                    },
                    misc: {
                        hqProfile: $('#copybot_hq_profile_toggle').attr('data-enabled') === 'true',
                        removeResize: $('#copybot_remove_resize_toggle').attr('data-enabled') === 'true',
                        debugMode: $('#copybot_debug_mode_toggle').attr('data-enabled') === 'true',
                        hidePlaceholder: $('#copybot_hide_placeholder_toggle').attr('data-enabled') === 'true'
                    }
                };
                
                // 다중 백업 저장으로 설정 유지 강화
                localStorage.setItem('copybot_settings', JSON.stringify(settings));
                localStorage.setItem('copybot_settings_backup', JSON.stringify(settings));
                sessionStorage.setItem('copybot_settings_temp', JSON.stringify(settings));
                
                if (window.CopyBotUtils) {
                    window.CopyBotUtils.debugLog(window.copybot_debug_mode, '설정 저장 완료', settings);
                }
                return true;
            } catch (error) {
                console.error('깡갤 복사기: 설정 저장 실패', error);
                return false;
            }
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
                // 다중 소스에서 설정 복구 시도
                let savedSettings = null;
                
                try {
                    savedSettings = localStorage.getItem('copybot_settings');
                } catch (e) {
                    console.warn('깡갤 복사기: localStorage에서 설정 로드 실패, 백업에서 시도');
                }
                
                if (!savedSettings) {
                    try {
                        savedSettings = localStorage.getItem('copybot_settings_backup');
                    } catch (e) {
                        console.warn('깡갤 복사기: 백업에서도 설정 로드 실패, sessionStorage에서 시도');
                    }
                }
                
                if (!savedSettings) {
                    try {
                        savedSettings = sessionStorage.getItem('copybot_settings_temp');
                    } catch (e) {
                        console.warn('깡갤 복사기: sessionStorage에서도 설정 로드 실패');
                    }
                }
                
                if (!savedSettings) {
                    if (window.CopyBotUtils) {
                        window.CopyBotUtils.debugLog(window.copybot_debug_mode, '깡갤 복사기: 저장된 설정이 없음');
                    }
                    return;
                }

                const settings = JSON.parse(savedSettings);
                if (window.CopyBotUtils) {
                    window.CopyBotUtils.debugLog(window.copybot_debug_mode, '깡갤 복사기: 설정 로드 중', settings);
                }

                // 위치 설정
                if (settings.position) {
                    $(`input[name="copybot_position"][value="${settings.position}"]`).prop('checked', true);
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

                $('#copybot_tag_remove_button').prop('checked', settings.tagRemove.button);
                $('#copybot_tag_remove_icon').prop('checked', settings.tagRemove.icon);
                $('#copybot_delete_button').prop('checked', settings.delete.button);
                $('#copybot_delete_icon').prop('checked', settings.delete.icon);
                $('#copybot_delete_regenerate_button').prop('checked', settings.deleteRegenerate.button);
                $('#copybot_delete_regenerate_icon').prop('checked', settings.deleteRegenerate.icon);

                if (settings.tagRemove.enabled) $('#copybot_tag_remove_options').show(); else $('#copybot_tag_remove_options').hide();
                if (settings.delete.enabled) $('#copybot_delete_options').show(); else $('#copybot_delete_options').hide();
                if (settings.deleteRegenerate.enabled) $('#copybot_delete_regenerate_options').show(); else $('#copybot_delete_regenerate_options').hide();
                
                // 기타 설정 로드
                if (settings.misc) {
                    // 각 설정값이 명시적으로 true일 때만 ON으로 설정합니다. (기본값 OFF)
                    const hqProfileEnabled = settings.misc.hqProfile === true;
                    const removeResizeEnabled = settings.misc.removeResize === true;
                    const hidePlaceholderEnabled = settings.misc.hidePlaceholder === true;
                    window.copybot_debug_mode = settings.misc.debugMode === true;

                    $('#copybot_hq_profile_toggle').attr('data-enabled', hqProfileEnabled).text(hqProfileEnabled ? 'ON' : 'OFF');
                    $('#copybot_remove_resize_toggle').attr('data-enabled', removeResizeEnabled).text(removeResizeEnabled ? 'ON' : 'OFF');
                    $('#copybot_hide_placeholder_toggle').attr('data-enabled', hidePlaceholderEnabled).text(hidePlaceholderEnabled ? 'ON' : 'OFF');
                    $('#copybot_debug_mode_toggle').attr('data-enabled', window.copybot_debug_mode).text(window.copybot_debug_mode ? 'ON' : 'OFF');

                    if (window.copybot_debug_mode) {
                        $('#copybot_debug_info').show();
                    } else {
                        $('#copybot_debug_info').hide();
                    }

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

        // CSS 기반 placeholder 숨기기
        hidePlaceholder: function() {
            if (window.CopyBotUtils) {
                window.CopyBotUtils.debugLog(window.copybot_debug_mode, '깡갤 복사기: CSS 기반 입력창 안내문 숨기기');
            }
            
            // 기존 스타일 제거
            if (placeholderStyleElement) {
                placeholderStyleElement.remove();
            }
            
            // CSS 스타일 추가로 placeholder 숨기기
            placeholderStyleElement = document.createElement('style');
            placeholderStyleElement.textContent = `
                #send_textarea::placeholder,
                #copybot_temp_prompt::placeholder {
                    opacity: 0 !important;
                    color: transparent !important;
                }
            `;
            document.head.appendChild(placeholderStyleElement);
            
            if (window.CopyBotUtils) {
                window.CopyBotUtils.debugLog(window.copybot_debug_mode, 'CSS 기반 placeholder 숨김 완료');
            }
        },

        // placeholder 복원
        restorePlaceholder: function() {
            if (window.CopyBotUtils) {
                window.CopyBotUtils.debugLog(window.copybot_debug_mode, '깡갤 복사기: CSS 기반 입력창 안내문 복원');
            }
            
            // CSS 스타일 제거로 placeholder 복원
            if (placeholderStyleElement) {
                placeholderStyleElement.remove();
                placeholderStyleElement = null;
            }
            
            if (window.CopyBotUtils) {
                window.CopyBotUtils.debugLog(window.copybot_debug_mode, 'CSS 기반 placeholder 복원 완료');
            }
        },

        // 안전한 placeholder 적용 함수 (타이밍 이슈 해결)
        safeApplyPlaceholderSetting: function() {
            const hidePlaceholderEnabled = $('#copybot_hide_placeholder_toggle').attr('data-enabled') === 'true';
            
            // DOM 요소가 준비될 때까지 재시도
            const applyWithRetry = (attempts = 0) => {
                const textarea = document.querySelector('#send_textarea');
                
                if (textarea && textarea.isConnected) {
                    if (hidePlaceholderEnabled) {
                        this.hidePlaceholder();
                    } else {
                        this.restorePlaceholder();
                    }
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

    if (window.copybot_debug_mode) {
        console.log('CopyBotSettings 모듈 로드 완료');
    }
})();