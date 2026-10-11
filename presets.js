// 깡갤 복사기 프리셋 관리 모듈
// 대필 프리셋 CRUD, 활성 프리셋 관리, UI 제어
// 의존성: utils.js, settings.js
(function() {
    'use strict';

    // 전역 변수 관리
    let isPresetEditMode = false;

    // 전역 네임스페이스 생성
    window.CopyBotPresets = {
        
        // === 모듈 초기화 ===
        init: function(dependencies) {
            // 의존성 주입 및 초기화
            this.dependencies = dependencies || {};
            
            // 필수 의존성 체크
            if (!window.CopyBotUtils) {
                console.error('CopyBotPresets: CopyBotUtils 모듈이 필요합니다');
                return false;
            }
            if (!window.CopyBotSettings) {
                console.error('CopyBotPresets: CopyBotSettings 모듈이 필요합니다');
                return false;
            }
            
            if (window.copybot_debug_mode) {
                console.log('CopyBotPresets 모듈 초기화 완료');
            }
            return true;
        },

        // === 데이터 관리 ===

        // 설정 저장소에 쓰는 단일 통로 (settings.js 와 같은 규칙):
        //  • 로드에 실패한 세션(copybot_settings_load_failed)에서는 쓰지 않는다 — 기존 저장본 보호
        //  • 백업 키는 "덮어쓰기 직전의 이전 저장본" (같은 값을 두 번 쓰지 않음)
        _writeSettings: function(settings) {
            if (window.copybot_settings_load_failed) {
                this.debugLog('설정 로드 실패 상태라 프리셋 저장 생략(기존 저장본 보호)');
                return false;
            }
            if (window.copybot_resetting) return false;   // 초기화 진행 중
            settings._savedAt = Date.now();   // 브라우저 vs 실리 계정 사본 최신 판별용 (settings.js 와 동일 규칙)
            const json = JSON.stringify(settings);
            let prev = null;
            try { prev = localStorage.getItem('copybot_settings'); } catch (e) { /* 무시 */ }
            // 이전 본 키가 깨진 문자열이면 좋은 백업을 그걸로 덮지 않는다 (settings.js 와 동일 규칙)
            const prevOk = !!prev && (window.CopyBotSettings?._isJsonObject ? window.CopyBotSettings._isJsonObject(prev) : true);
            if (prev && prev !== json && prevOk) localStorage.setItem('copybot_settings_backup', prev);
            localStorage.setItem('copybot_settings', json);
            sessionStorage.setItem('copybot_settings_temp', json);
            window.CopyBotSettings?.writeServerCopy?.(json);   // 실리 계정에도 같은 내용
            return true;
        },

        // 프리셋 목록 가져오기 (다중 소스 복구 로직)
        getPresets: function() {
            try {
                // 1. 전역 변수에서 먼저 확인 (이미 로드된 경우)
                if (window.copybotIntegratedPresets) {
                    let presets = [...window.copybotIntegratedPresets]; // 복사본 생성
                    
                    // 기본 프리셋 정렬 보장
                    const defaultPresetIndex = presets.findIndex(p => p.name === '기본 프리셋');
                    if (defaultPresetIndex > 0) {
                        const defaultPreset = presets.splice(defaultPresetIndex, 1)[0];
                        presets.unshift(defaultPreset);
                    }
                    
                    return presets;
                }
                
                // 2. 일반설정에서 직접 로드
                const settingsJSON = localStorage.getItem('copybot_settings');
                if (settingsJSON) {
                    const settings = JSON.parse(settingsJSON);
                    if (settings.ghostwrite && settings.ghostwrite.presets) {
                        let presets = settings.ghostwrite.presets;
                        
                        // 하위 호환성 처리 (profile 필드 추가)
                        presets = presets.map(preset => {
                            if (!preset.hasOwnProperty('profile')) {
                                preset.profile = 'default';
                            }
                            return preset;
                        });
                        
                        // 기본 프리셋 처리
                        const defaultPresetIndex = presets.findIndex(p => p.name === '기본 프리셋');
                        if (defaultPresetIndex === -1) {
                            presets.unshift({ name: '기본 프리셋', prompt: '', excludePrompt: '', profile: 'default' });
                        } else if (defaultPresetIndex !== 0) {
                            const defaultPreset = presets.splice(defaultPresetIndex, 1)[0];
                            presets.unshift(defaultPreset);
                        }
                        
                        // 전역 변수에도 저장
                        window.copybotIntegratedPresets = presets;
                        return presets;
                    }
                }
                
                // 3. 기존 copybot_presets에서 마이그레이션 (하위 호환성)
                const legacyPresetsJSON = localStorage.getItem('copybot_presets');
                if (legacyPresetsJSON) {
                    let presets = JSON.parse(legacyPresetsJSON);
                    presets = presets.map(preset => {
                        if (!preset.hasOwnProperty('profile')) {
                            preset.profile = 'default';
                        }
                        return preset;
                    });
                    this.debugLog('기존 copybot_presets에서 마이그레이션:', presets.length, '개');
                    window.copybotIntegratedPresets = presets;
                    return presets;
                }
                
                // 4. 모두 없으면 기본 프리셋 생성
                const defaultPresets = [{ name: '기본 프리셋', prompt: '', excludePrompt: '', profile: 'default' }];
                window.copybotIntegratedPresets = defaultPresets;
                return defaultPresets;
                
            } catch (e) {
                console.error("프리셋 로딩 실패:", e);
                const defaultPresets = [{ name: '기본 프리셋', prompt: '', excludePrompt: '', profile: 'default' }];
                window.copybotIntegratedPresets = defaultPresets;
                return defaultPresets;
            }
        },

        // 프리셋 목록 저장 (다중 백업)
        savePresets: function(presets) {
            try {
                // 기본 프리셋이 항상 첫 번째 위치에 오도록 보장
                const defaultPresetIndex = presets.findIndex(p => p.name === '기본 프리셋');
                if (defaultPresetIndex > 0) {
                    const defaultPreset = presets.splice(defaultPresetIndex, 1)[0];
                    presets.unshift(defaultPreset);
                }
                
                // 전역 변수 업데이트
                window.copybotIntegratedPresets = presets;
                
                // 일반설정 업데이트
                const settingsJSON = localStorage.getItem('copybot_settings');
                let settings = settingsJSON ? JSON.parse(settingsJSON) : {};
                
                // ghostwrite 섹션이 없으면 생성
                if (!settings.ghostwrite) {
                    settings.ghostwrite = {};
                }
                
                // 프리셋 배열 업데이트
                settings.ghostwrite.presets = presets;
                
                // 현재 활성 프리셋의 내용을 UI 현재 값과 동기화
                const activePresetName = $('#copybot_preset_select').val();
                if (activePresetName) {
                    const activePreset = presets.find(p => p.name === activePresetName);
                    if (activePreset) {
                        settings.ghostwrite.text = activePreset.prompt || '';
                        settings.ghostwrite.excludeText = activePreset.excludePrompt || '';
                        settings.ghostwrite.profile = activePreset.profile || 'default';
                    }
                }
                
                if (!this._writeSettings(settings)) return false;

                this.debugLog('프리셋 저장 완료 (일반설정 통합):', presets.length, '개');
                return true;
            } catch (e) {
                console.error("프리셋 저장 실패:", e);
                return false;
            }
        },

        // 레거시 데이터 마이그레이션
        performDataMigration: function() {
            try {
                this.debugLog('깡갤 복사기: 데이터 마이그레이션 시작');
                
                // 1. 이미 통합된 시스템인지 확인
                const currentSettings = localStorage.getItem('copybot_settings');
                if (currentSettings) {
                    const parsed = JSON.parse(currentSettings);
                    if (parsed.ghostwrite && parsed.ghostwrite.presets && parsed.ghostwrite.presets.length > 0) {
                        this.debugLog('이미 통합된 시스템, 마이그레이션 건너뛰기');
                        return; // 이미 마이그레이션 완료
                    }
                }
                
                // 2. 기존 copybot_presets 데이터 확인
                const legacyPresets = localStorage.getItem('copybot_presets');
                const legacyActivePreset = localStorage.getItem('copybot_active_preset');
                
                if (legacyPresets) {
                    this.debugLog('기존 프리셋 데이터 발견, 마이그레이션 진행');
                    
                    let settings = currentSettings ? JSON.parse(currentSettings) : {};
                    
                    // ghostwrite 섹션 초기화
                    if (!settings.ghostwrite) {
                        settings.ghostwrite = {
                            enabled: false,
                            text: '',
                            excludeText: '',
                            position: 'right',
                            useTempField: false,
                            profile: 'default'
                        };
                    }
                    
                    // 프리셋 데이터 마이그레이션
                    const presets = JSON.parse(legacyPresets);
                    
                    // 하위 호환성 처리
                    const migratedPresets = presets.map(preset => {
                        if (!preset.hasOwnProperty('profile')) {
                            preset.profile = 'default';
                        }
                        return preset;
                    });
                    
                    // 기본 프리셋 정렬 보장
                    const defaultIndex = migratedPresets.findIndex(p => p.name === '기본 프리셋');
                    if (defaultIndex > 0) {
                        const defaultPreset = migratedPresets.splice(defaultIndex, 1)[0];
                        migratedPresets.unshift(defaultPreset);
                    } else if (defaultIndex === -1) {
                        migratedPresets.unshift({ name: '기본 프리셋', prompt: '', excludePrompt: '', profile: 'default' });
                    }
                    
                    // 일반설정에 통합
                    settings.ghostwrite.presets = migratedPresets;
                    settings.ghostwrite.activePreset = legacyActivePreset || '기본 프리셋';
                    
                    // 활성 프리셋의 내용을 현재 값으로 설정
                    const activePreset = migratedPresets.find(p => p.name === settings.ghostwrite.activePreset);
                    if (activePreset) {
                        settings.ghostwrite.text = activePreset.prompt || '';
                        settings.ghostwrite.excludeText = activePreset.excludePrompt || '';
                        settings.ghostwrite.profile = activePreset.profile || 'default';
                    }
                    
                    // 새로운 통합 시스템에 저장 — 설정 쓰기 통로(_writeSettings: 백업=이전 저장본, _savedAt, 실리 계정 사본, 차단 플래그)만 사용
                    let written = false;
                    try {
                        written = this._writeSettings(settings);
                        this.debugLog('마이그레이션: 저장', written ? '성공' : '생략');
                    } catch (storageError) {
                        console.error('마이그레이션: 저장 실패', storageError);
                    }

                    this.debugLog('마이그레이션 완료:', migratedPresets.length, '개 프리셋');

                    // 3. 기존 데이터 정리 (새 저장이 실제로 됐을 때만, 1초 후 - 안전을 위해 지연)
                    if (written) {
                        setTimeout(() => {
                            localStorage.removeItem('copybot_presets');
                            localStorage.removeItem('copybot_active_preset');
                            this.debugLog('기존 프리셋 데이터 정리 완료');
                        }, 1000);
                    }

                } else {
                    // 기존 프리셋 데이터 없음 → 아무것도 쓰지 않는다. (예전엔 여기서 타임스탬프 없는 초기 설정을 본 키에 만들어 두었는데,
                    // 그러면 새 기기에서 실리 계정 사본이 "더 오래된 것"으로 밀려 무시되고 첫 저장 때 서버 사본까지 기본값으로 덮였다 — 2026-10-11)
                    // 기본 프리셋은 getPresets() 가 저장 없이 돌려주므로 초기 저장이 필요 없다.
                    this.debugLog('기존 프리셋 데이터 없음, 마이그레이션 없음');
                }
                
            } catch (error) {
                console.error('깡갤 복사기: 마이그레이션 실패', error);
            }
        },

        // === 프리셋 CRUD ===

        // 자동저장의 "마지막 저장값"을 방금 불러온 값으로 맞춘다 (문자열인 칸만).
        // ghostwrite.js 는 원본 그대로 두므로(2026-10-11 유저 결정) 그 모듈의 기록 객체에 값만 적는다. 수정안의 markSaved 가 있으면 그쪽을 쓴다.
        _markSaved: function(values) {
            const gw = window.CopyBotGhostwrite;
            if (!gw || !values) return;
            if (typeof gw.markSaved === 'function') { gw.markSaved(values); return; }
            if (!gw._lastSavedValues || typeof gw._lastSavedValues !== 'object') return;
            for (const key of ['basicPrompt', 'excludePrompt', 'profile']) {
                if (typeof values[key] === 'string') gw._lastSavedValues[key] = values[key];
            }
        },

        // 프리셋 로드 (통합된 시스템용)
        loadPreset: function(presetName) {
            if (!presetName) {
                presetName = '기본 프리셋';
            }
            
            const presets = this.getPresets();
            const preset = presets.find(p => p.name === presetName);
            
            if (preset) {
                // 프롬프트 텍스트 로드
                if (preset.prompt !== undefined) $('#copybot_ghostwrite_textbox').val(preset.prompt);
                if (preset.excludePrompt !== undefined) $('#copybot_ghostwrite_exclude_textbox').val(preset.excludePrompt);

                // 마지막 저장값 업데이트 (하이브리드 자동저장용) — 방금 불러온 값이 곧 저장된 값이다.
                // (예전엔 존재하지 않는 window.lastSavedValues 에 써서 아무 일도 안 했다 → 이전 프리셋의 값이 "마지막 저장값"으로 남았음)
                // 값을 건드리지 않은 칸(undefined)은 넘기지 않는다.
                this._markSaved({
                    basicPrompt: preset.prompt !== undefined ? String(preset.prompt ?? '') : undefined,
                    excludePrompt: preset.excludePrompt !== undefined ? String(preset.excludePrompt ?? '') : undefined,
                });

                // 프로필 설정 로드
                setTimeout(() => {
                    const profileSelect = $('#copybot_ghostwrite_profile_select');
                    const targetProfile = preset.profile || 'default';

                    if (this._isProfileListed(targetProfile)) {
                        profileSelect.val(targetProfile);
                    } else {
                        profileSelect.val('default');
                        if (targetProfile !== 'default' && window.copybot_debug_mode) {
                            this.debugLog('저장된 프로필을 찾을 수 없어 기본값으로 설정:', targetProfile);
                        }
                    }
                    this._markSaved({ profile: profileSelect.val() || 'default' });
                }, 150);
                
                this.debugLog('✅ 통합 시스템에서 프리셋 로드 완료:', presetName);
            } else {
                this.debugLog('프리셋을 찾을 수 없음:', presetName);
            }
        },

        // 대필 프로필 드롭다운에 그 프로필이 지금 있는가 (값 그대로 비교 — 선택자 문자열에 끼워 넣지 않는다)
        _isProfileListed: function(profileId) {
            const select = document.getElementById('copybot_ghostwrite_profile_select');
            return !!select && Array.from(select.options || []).some(option => option.value === profileId);
        },

        // 현재 프리셋 저장 (자동저장 연계). 저장소에 실제로 썼으면 true, 못 썼으면 false
        saveCurrentPreset: function(isAutoSave = false) {
            const selectedName = $('#copybot_preset_select').val();
            let presets = this.getPresets();

            // 현재 입력된 값들 가져오기
            const currentPrompt = $('#copybot_ghostwrite_textbox').val() || '';
            const currentExcludePrompt = $('#copybot_ghostwrite_exclude_textbox').val() || '';
            const currentProfile = $('#copybot_ghostwrite_profile_select').val() || 'default';

            if (selectedName) {
                // 시나리오 1: 프리셋이 선택되어 있을 때 (업데이트)
                const presetToUpdate = presets.find(p => p.name === selectedName);
                if (presetToUpdate) {
                    // 프로필 목록이 아직 안 떴거나 지금은 없는 프로필이라 화면이 '기본'으로 내려앉아 있을 뿐이면, 저장돼 있던 전용 프로필을 지우지 않는다
                    // (지시문만 고쳤는데 프리셋의 전용 프로필 설정까지 사라지던 것 방지. 목록에 있는 프로필에서 '기본'으로 직접 바꾼 것은 그대로 저장된다)
                    const storedProfile = presetToUpdate.profile || 'default';
                    const profileToSave = (currentProfile === 'default' && storedProfile !== 'default' && !this._isProfileListed(storedProfile))
                        ? storedProfile : currentProfile;

                    // 프리셋 데이터 업데이트
                    presetToUpdate.prompt = currentPrompt;
                    presetToUpdate.excludePrompt = currentExcludePrompt;
                    presetToUpdate.profile = profileToSave;

                    // 기본 프리셋이 항상 첫 번째 (savePresets 와 같은 규칙)
                    const defaultPresetIndex = presets.findIndex(p => p.name === '기본 프리셋');
                    if (defaultPresetIndex > 0) presets.unshift(presets.splice(defaultPresetIndex, 1)[0]);

                    // 전역 변수 동기화
                    window.copybotIntegratedPresets = presets;
                    window.copybotActivePreset = selectedName;

                    // 현재 지시문·활성 프리셋·프리셋 목록을 한 번에 쓴다.
                    // (예전엔 같은 저장본을 세 번 연달아 읽고 썼다 → 자동저장 한 번에 저장소 쓰기 3번, 백업 키는 "이전 저장본"이 아니라 방금 쓴 중간 상태로 덮였음)
                    let written = false;
                    try {
                        const settings = JSON.parse(localStorage.getItem('copybot_settings') || '{}');
                        if (!settings.ghostwrite) settings.ghostwrite = {};
                        settings.ghostwrite.text = currentPrompt;
                        settings.ghostwrite.excludeText = currentExcludePrompt;
                        settings.ghostwrite.profile = profileToSave;
                        settings.ghostwrite.activePreset = selectedName;
                        settings.ghostwrite.presets = presets;
                        written = this._writeSettings(settings) === true;
                    } catch (e) {
                        console.error('프리셋 저장 실패:', e);
                    }

                    // 자동저장일 때는 토스트 메시지 생략
                    if (!isAutoSave) {
                        if (window.toastr) {
                            if (written) toastr.success(`'${selectedName}' 프리셋이 업데이트되고 현재 프리셋으로 설정되었습니다.`, '', { escapeHtml: true });
                            else toastr.error('프리셋을 저장하지 못했습니다.');
                        }
                    } else {
                        this.debugLog(`'${selectedName}' 프리셋 자동저장 ${written ? '완료' : '안 됨'}`);
                    }
                    return written;
                } else {
                    if (!isAutoSave && window.toastr) {
                        toastr.error(`'${selectedName}' 프리셋을 찾지 못해 업데이트에 실패했습니다.`, '', { escapeHtml: true });
                    }
                    return false;
                }
            } else {
                // 시나리오 2: 드롭다운에서 빈 값("")이 선택된 경우
                // 이제 기본 프리셋이 실제 객체로 존재하므로 이 경우는 발생하지 않아야 함
                // 하위 호환성을 위해 기본 프리셋 업데이트로 처리
                const defaultPreset = presets.find(p => p.name === '기본 프리셋');
                if (defaultPreset) {
                    defaultPreset.prompt = $('#copybot_ghostwrite_textbox').val();
                    defaultPreset.excludePrompt = $('#copybot_ghostwrite_exclude_textbox').val();
                    defaultPreset.profile = $('#copybot_ghostwrite_profile_select').val() || 'default';
                    const written = this.savePresets(presets) === true;
                    // 기본 프리셋도 활성 프리셋으로 설정
                    this.setActivePreset('기본 프리셋');

                    if (!isAutoSave) {
                        if (window.toastr) {
                            toastr.success('기본 프리셋이 업데이트되고 현재 프리셋으로 설정되었습니다.');
                        }
                        if (this.updatePresetDropdown) {
                            this.updatePresetDropdown();
                        }
                        $('#copybot_preset_select').val('기본 프리셋');
                    } else {
                        this.debugLog('기본 프리셋 자동저장 완료');
                    }
                    return written;
                } else {
                    // 예외 상황: 새 프리셋 생성 프로세스 유지 (자동저장에서는 실행하지 않음)
                    if (!isAutoSave) {
                        let name = prompt("저장할 새 프리셋의 이름을 입력해 주십시오:", "");
                        if (!name || name.trim() === '') {
                            if (name !== null && window.toastr) toastr.warning("프리셋 이름은 비워둘 수 없습니다.");
                            return;
                        }
                        name = name.trim();
                        const existingPreset = presets.find(p => p.name.toLowerCase() === name.toLowerCase());
                        if (existingPreset) {
                            if (!confirm(`'${existingPreset.name}' 프리셋이 이미 존재합니다. 덮어쓰시겠습니까?`)) return;
                            existingPreset.prompt = $('#copybot_ghostwrite_textbox').val();
                            existingPreset.excludePrompt = $('#copybot_ghostwrite_exclude_textbox').val();
                            existingPreset.profile = $('#copybot_ghostwrite_profile_select').val() || 'default';
                            // 덮어쓴 프리셋을 활성 프리셋으로 설정
                            this.setActivePreset(existingPreset.name);
                            if (window.toastr) toastr.success(`'${existingPreset.name}' 프리셋이 덮어쓰기되고 현재 프리셋으로 설정되었습니다.`);
                        } else {
                            presets.push({ 
                                name: name, 
                                prompt: $('#copybot_ghostwrite_textbox').val(), 
                                excludePrompt: $('#copybot_ghostwrite_exclude_textbox').val(),
                                profile: $('#copybot_ghostwrite_profile_select').val() || 'default'
                            });
                            // 새로 생성된 프리셋을 활성 프리셋으로 설정
                            this.setActivePreset(name);
                            if (window.toastr) toastr.success(`'${name}' 프리셋이 새로 저장되고 현재 프리셋으로 설정되었습니다.`);
                        }
                        const written = this.savePresets(presets) === true;
                        if (this.updatePresetDropdown) this.updatePresetDropdown();
                        $('#copybot_preset_select').val(name);
                        return written;
                    }
                    return false;   // 자동저장인데 저장할 프리셋을 정할 수 없음 → 아무것도 쓰지 않음
                }
            }
        },

        // 새 프리셋 추가
        addNewPreset: function() {
            let presets = this.getPresets();
            let newNameBase = "새 프리셋";
            let newName = newNameBase;
            let counter = 1;
            while (presets.some(p => p.name === newName)) {
                newName = `${newNameBase} ${++counter}`;
            }
            presets.push({ name: newName, prompt: "", excludePrompt: "", profile: "default" });
            this.savePresets(presets);
            // 새 프리셋을 곧바로 "지금 쓰는(활성) 프리셋"으로 삼는다 (프리셋 복사와 같은 규칙).
            // 안 그러면 바로 이어지는 이름 편집을 취소(✕)했을 때 드롭다운만 이전 프리셋으로 돌아가고 지시문 칸은 새 프리셋(빈칸)인 채라,
            // 그 칸을 눌렀다 떼기만 해도 이전 프리셋의 지시문이 빈 값으로 덮였다.
            this.setActivePreset(newName);
            if (this.updatePresetDropdown) this.updatePresetDropdown();
            $('#copybot_preset_select').val(newName);
            this.loadPreset(newName);
            if (this.enterPresetEditMode) this.enterPresetEditMode();
        },

        // 프리셋 삭제
        deletePreset: function(nameToDelete) {
            // 기본 프리셋 삭제 방지
            if (nameToDelete === '기본 프리셋') {
                if (window.toastr) toastr.error('기본 프리셋은 삭제할 수 없습니다.');
                return false;
            }
            
            let presets = this.getPresets();
            // 지우는 프리셋은 곧 "지금 쓰던(활성) 프리셋"이다 → 저장본의 활성 프리셋·현재 지시문도 기본 프리셋 것으로 함께 옮긴다.
            // (예전엔 목록에서만 빼서, 새로고침하면 지운 프리셋의 지시문이 '기본 프리셋' 칸에 그대로 떠 있었고 한 글자만 고쳐도 기본 프리셋을 덮어썼다)
            // 드롭다운을 먼저 기본 프리셋으로 돌려 두면 savePresets 가 현재 지시문을 기본 프리셋 것으로 맞춰 쓴다.
            $('#copybot_preset_select').val('기본 프리셋');
            this.savePresets(presets.filter(p => p.name !== nameToDelete));
            this.setActivePreset('기본 프리셋');
            this.loadPreset('기본 프리셋'); // 삭제 후 기본 프리셋으로 이동
            return true;
        },

        // 프리셋 이름 변경
        renamePreset: function(oldName, newName) {
            oldName = String(oldName ?? '');
            newName = String(newName ?? '').trim();
            if (!newName) {
                if (window.toastr) toastr.error('프리셋 이름은 비워둘 수 없습니다.');
                return false;
            }
            if (oldName === '기본 프리셋') {
                if (window.toastr) toastr.warning('기본 프리셋의 이름은 변경할 수 없습니다.');
                return false;
            }
            // 드롭다운의 관리 메뉴 값과 같은 이름이면 그 프리셋을 고를 때마다 "추가/순서 변경/복사"가 실행돼 다시는 고를 수 없게 된다
            if (/^__(add|reorder|copy)__$/.test(newName)) {
                if (window.toastr) toastr.error('그 이름은 프리셋 관리 메뉴가 쓰고 있어 사용할 수 없습니다.');
                return false;
            }
            let presets = this.getPresets();
            if (presets.some(p => String(p.name).toLowerCase() === newName.toLowerCase() && String(p.name).toLowerCase() !== oldName.toLowerCase())) {
                if (window.toastr) toastr.error(`'${newName}' 이름은 이미 사용 중입니다.`, '', { escapeHtml: true });
                return false;
            }
            const preset = presets.find(p => p.name === oldName);
            if (preset) {
                // 이름을 바꾸기 전에 확인해야 한다 (바꾼 뒤엔 옛 이름의 프리셋이 없어 항상 "활성 아님"으로 나왔음)
                const wasActive = this.getActivePreset() === oldName;
                preset.name = newName;
                
                // 🔥 핵심 수정 1: 드롭다운 값도 즉시 변경 (savePresets에서 올바른 값을 읽도록)
                $('#copybot_preset_select').val(newName);
                
                // 🔥 핵심 수정 2: 활성 프리셋이 변경된 프리셋이면 활성 프리셋 이름도 업데이트
                if (wasActive) {
                    this.setActivePreset(newName);
                }
                
                this.savePresets(presets);
                return true;
            }
            return false;
        },

        // 현재 프리셋 복사
        copyCurrentPreset: function() {
            const originalName = $('#copybot_preset_select').val();
            let presets = this.getPresets();
            
            // 선택된 프리셋이 없는 예외적인 경우, 현재 입력된 내용을 기반으로 새 프리셋을 생성합니다.
            if (!originalName) {
                const currentPrompt = $('#copybot_ghostwrite_textbox').val();
                const currentExcludePrompt = $('#copybot_ghostwrite_exclude_textbox').val();
                
                let newName = "복사된 프리셋 (1)";
                let counter = 1;
                while (presets.some(p => p.name === newName)) {
                    counter++;
                    newName = `복사된 프리셋 (${counter})`;
                }
                
                const newPreset = { 
                    name: newName, 
                    prompt: currentPrompt || '', 
                    excludePrompt: currentExcludePrompt || '',
                    profile: $('#copybot_ghostwrite_profile_select').val() || 'default'
                };
                presets.push(newPreset);
                this.savePresets(presets);
                if (window.toastr) toastr.success(`현재 입력 내용이 '${newName}'(으)로 저장되었습니다.`, '', { escapeHtml: true });
                if (this.updatePresetDropdown) this.updatePresetDropdown();
                // 드롭다운 값을 변경하고 change 이벤트를 강제로 발생시킵니다.
                $('#copybot_preset_select').val(newName).trigger('change');
                return;
            }
            
            // 정상적으로 프리셋이 선택된 경우
            const originalPreset = presets.find(p => p.name === originalName);
            if (!originalPreset) {
                if (window.toastr) toastr.error("오류: 원본 프리셋을 찾을 수 없습니다.");
                return;
            }
            
            // '기본 프리셋'을 특별 취급하는 이름 생성 로직을 제거, 모든 프리셋은 원본 이름을 기반으로 (숫자)만 붙임
            const baseName = originalName; 
            let newName = `${baseName} (1)`;
            let counter = 1;
            while (presets.some(p => p.name === newName)) {
                counter++;
                newName = `${baseName} (${counter})`;
            }
            
            // 원본 프리셋의 모든 내용을 그대로 복사합니다.
            const newPreset = { 
                name: newName, 
                prompt: originalPreset.prompt, 
                excludePrompt: originalPreset.excludePrompt, 
                profile: originalPreset.profile || 'default' 
            };
            
            presets.push(newPreset);
            this.savePresets(presets);
            
            if (window.toastr) toastr.success(`'${newName}'(으)로 복사되었습니다.`, '', { escapeHtml: true });
            if (this.updatePresetDropdown) this.updatePresetDropdown();
            
            // 새로 생성된 프리셋을 선택하고, 앱의 내부 상태를 갱신하기 위해 change 이벤트를 강제로 발생시킴
            $('#copybot_preset_select').val(newName).trigger('change');
        },

        // === 활성 프리셋 관리 ===

        // 활성 프리셋 조회 (다중 소스 우선순위)
        getActivePreset: function() {
            try {
                // 1. 전역 변수에서 먼저 확인
                if (window.copybotActivePreset) {
                    const presets = this.getPresets();
                    const presetExists = presets.some(p => p.name === window.copybotActivePreset);
                    if (presetExists) {
                        this.debugLog('활성 프리셋 로드 (전역):', window.copybotActivePreset);
                        return window.copybotActivePreset;
                    }
                }
                
                // 2. 일반설정에서 확인 (다중 소스 시도)
                let settingsJSON = null;
                
                // 2-1. 메인 설정에서 시도
                try {
                    settingsJSON = localStorage.getItem('copybot_settings');
                } catch (e) {
                    this.debugLog('메인 설정에서 활성 프리셋 로드 실패');
                }
                
                // 2-2. 백업 설정에서 시도
                if (!settingsJSON) {
                    try {
                        settingsJSON = localStorage.getItem('copybot_settings_backup');
                        this.debugLog('백업 설정에서 활성 프리셋 로드 시도');
                    } catch (e) {
                        this.debugLog('백업 설정에서 활성 프리셋 로드 실패');
                    }
                }
                
                // 2-3. 임시 설정에서 시도
                if (!settingsJSON) {
                    try {
                        settingsJSON = sessionStorage.getItem('copybot_settings_temp');
                        this.debugLog('임시 설정에서 활성 프리셋 로드 시도');
                    } catch (e) {
                        this.debugLog('임시 설정에서 활성 프리셋 로드 실패');
                    }
                }
                
                if (settingsJSON) {
                    const settings = JSON.parse(settingsJSON);
                    if (settings.ghostwrite && settings.ghostwrite.activePreset) {
                        const activePreset = settings.ghostwrite.activePreset;
                        const presets = this.getPresets();
                        const presetExists = presets.some(p => p.name === activePreset);
                        if (presetExists) {
                            window.copybotActivePreset = activePreset; // 전역 변수에도 저장
                            this.debugLog('활성 프리셋 로드 (일반설정, 다중 소스):', activePreset);
                            return activePreset;
                        }
                    }
                }
                
                // 3. 레거시 지원 (하위 호환성) - 🔥 수정: 이미 통합 시스템에서 찾았으면 레거시는 건너뛰기
                const legacyActivePreset = localStorage.getItem('copybot_active_preset');
                if (legacyActivePreset) {
                    // 🔥 핵심 수정: 통합 시스템에서 이미 활성 프리셋을 찾았다면 레거시는 무시
                    if (settingsJSON) {
                        const settings = JSON.parse(settingsJSON);
                        if (settings.ghostwrite && settings.ghostwrite.activePreset) {
                            // 통합 시스템에 활성 프리셋이 있으면 레거시는 정리만 하고 사용하지 않음
                            localStorage.removeItem('copybot_active_preset');
                            this.debugLog('레거시 활성 프리셋 정리됨 (통합 시스템 우선):', legacyActivePreset);
                        }
                    } else {
                        // 통합 시스템에 데이터가 없을 때만 레거시 사용
                        const presets = this.getPresets();
                        const presetExists = presets.some(p => p.name === legacyActivePreset);
                        if (presetExists) {
                            this.debugLog('활성 프리셋 로드 (레거시):', legacyActivePreset);
                            return legacyActivePreset;
                        } else {
                            localStorage.removeItem('copybot_active_preset');
                            this.debugLog('레거시 활성 프리셋이 더 이상 존재하지 않아 제거됨:', legacyActivePreset);
                        }
                    }
                }
            } catch (error) {
                console.error('활성 프리셋 로드 실패:', error);
            }
            return '기본 프리셋'; // 기본값
        },

        // 활성 프리셋 설정 (다중 저장소 동기화)
        setActivePreset: function(presetName) {
            try {
                // 전역 변수 업데이트
                window.copybotActivePreset = presetName;
                
                // 일반설정에도 저장
                const settingsJSON = localStorage.getItem('copybot_settings');
                let settings = settingsJSON ? JSON.parse(settingsJSON) : {};
                
                if (!settings.ghostwrite) {
                    settings.ghostwrite = {};
                }
                
                settings.ghostwrite.activePreset = presetName;

                this._writeSettings(settings);
                // (구버전 키 copybot_active_preset 은 더 쓰지 않는다 — 마이그레이션이 지우는 키를 여기서 되살리던 자기모순 제거, 2026-10-11)

                this.debugLog('활성 프리셋 설정 (통합, 다중 백업):', presetName);
            } catch (error) {
                console.error('활성 프리셋 저장 실패:', error);
            }
        },

// === UI 관리 ===

        // 프리셋 드롭다운 메뉴 업데이트
        updatePresetDropdown: function() {
            const presets = this.getPresets();
            const select = $('#copybot_preset_select');
            const selectedValue = select.val(); // 현재 선택된 값 기억
            
            // 활성 프리셋 우선 선택 로직
            const activePreset = this.getActivePreset();

            // 1. 드롭다운 메뉴를 완전히 새로 구성합니다.
            select.empty();
            
            // 기본 프리셋을 실제 프리셋 배열에서 가져와서 표시
            // text 는 글자 그대로 들어간다(HTML 로 해석되지 않음) → 미리 이스케이프하면 "A&B" 가 "A&amp;B" 로 보인다
            presets.forEach(preset => {
                select.append($('<option>', { value: preset.name, text: preset.name }));
            });

            // 2. 관리 메뉴를 항상 추가합니다.
            select.append('<option value="" disabled>──────────</option>');
            select.append('<option value="__add__" class="copybot_preset_management_option">+ 새 프리셋 추가</option>');
            
            // 기본 프리셋을 제외한 프리셋이 2개 이상일 때만 순서 변경 기능 표시
            const reorderablePresets = presets.filter(p => p.name !== '기본 프리셋');
            if (reorderablePresets.length > 1) {
                select.append('<option value="__reorder__" class="copybot_preset_management_option">+ 프리셋 순서 변경</option>');
            }
            
            // "현재 프리셋 복사" 기능을 항상 표시
            select.append('<option value="__copy__" class="copybot_preset_management_option">+ 현재 프리셋 복사</option>');
            
            // 3. 선택할 값 결정 우선순위: 전역 활성 프리셋 > 현재 선택값 > 로컬 활성 프리셋 > 기본 프리셋
            let valueToSelect;
            const globalActivePreset = window.copybotActivePreset; // 전역 변수 우선
            
            if (globalActivePreset && presets.some(p => p.name === globalActivePreset)) {
                valueToSelect = globalActivePreset; // 전역 활성 프리셋 최우선
                this.debugLog('드롭다운 선택 (전역 활성):', valueToSelect);
            } else if (selectedValue && selectedValue !== '' && presets.some(p => p.name === selectedValue)) {
                valueToSelect = selectedValue; // 현재 선택값이 유효하면 유지
                this.debugLog('드롭다운 선택 (현재값 유지):', valueToSelect);
            } else if (activePreset && presets.some(p => p.name === activePreset)) {
                valueToSelect = activePreset; // 로컬 활성 프리셋
                this.debugLog('드롭다운 선택 (로컬 활성):', valueToSelect);
            } else {
                valueToSelect = '기본 프리셋'; // 기본값
                this.debugLog('드롭다운 선택 (기본값):', valueToSelect);
            }

            select.val(valueToSelect);

            // 4. 현재 선택된 값을 data 속성에 저장 (관리 메뉴에서 복원용)
            select.data('previousValue', valueToSelect);
        },

        // 편집 모드 진입
        enterPresetEditMode: function() {
            isPresetEditMode = true;
            const selectedPresetName = $('#copybot_preset_select').val();
            $('#copybot_preset_edit').hide();
            $('#copybot_preset_confirm, #copybot_preset_cancel').show();
            
            // 기본 프리셋이 아닐 때만 삭제 버튼 표시
            if (selectedPresetName && selectedPresetName !== '기본 프리셋') {
                $('#copybot_preset_delete').show();
            }
            
            $('#copybot_preset_select').hide();
            
            // 기본 프리셋일 때는 이름 변경 입력창 비활성화
            if (selectedPresetName === '기본 프리셋') {
                $('#copybot_preset_rename_input').val(selectedPresetName).show().prop('disabled', true);
            } else {
                $('#copybot_preset_rename_input').val(selectedPresetName).show().prop('disabled', false);   // 자동 포커스 금지(모바일 키보드)
            }
            
            $('#copybot_ghostwrite_textbox, #copybot_ghostwrite_exclude_textbox').prop('disabled', true);
        },
        
        // 편집 모드 종료
        exitPresetEditMode: function(forceUpdate = false) {
            if (!isPresetEditMode && !forceUpdate) return;
            isPresetEditMode = false;
            $('#copybot_preset_edit').show();
            $('#copybot_preset_confirm, #copybot_preset_delete, #copybot_preset_cancel').hide();
            $('#copybot_preset_rename_input').hide();
            $('#copybot_preset_select').show();
            $('#copybot_ghostwrite_textbox, #copybot_ghostwrite_exclude_textbox').prop('disabled', false);
            this.updatePresetDropdown();
        },

        // 편집 버튼 상태 업데이트
        updatePresetEditButtonState: function() {
            const selectedPreset = $('#copybot_preset_select').val();
            const editButton = $('#copybot_preset_edit');
            
            if (selectedPreset === '기본 프리셋') {
                // 기본 프리셋은 편집 버튼 비활성화
                editButton.addClass('disabled').attr('title', '기본 프리셋은 편집할 수 없습니다');
            } else if (selectedPreset) {
                // 다른 프리셋은 편집 가능
                editButton.removeClass('disabled').attr('title', '프리셋 편집 모드 시작');
            } else {
                // 선택된 프리셋이 없는 경우 (예외 상황)
                editButton.addClass('disabled').attr('title', '편집할 프리셋을 선택해야 합니다');
            }
        },

        // === 순서 변경 시스템 ===

        // 프리셋 순서 변경
        reorderPresets: function(newOrderNameArray) {
            const presets = this.getPresets();
            const defaultPreset = presets.find(p => p.name === '기본 프리셋');
            // 순서만 바꾼다 — 넘어온 이름 목록에 없는 프리셋(목록이 비어 왔거나, 이름이 같은 프리셋이 둘인 옛 저장본 등)도 지우지 않고 원래 순서대로 뒤에 둔다
            const others = presets.filter(p => p !== defaultPreset);
            const picked = new Set();
            const reorderedPresets = [];
            (Array.isArray(newOrderNameArray) ? newOrderNameArray : []).forEach(name => {
                const preset = others.find(p => p.name === name && !picked.has(p));
                if (preset) { picked.add(preset); reorderedPresets.push(preset); }
            });
            others.forEach(p => { if (!picked.has(p)) reorderedPresets.push(p); });

            // 기본 프리셋을 맨 앞에 추가하고 나머지 재정렬된 프리셋들을 뒤에 붙임
            const finalPresets = defaultPreset ? [defaultPreset, ...reorderedPresets] : reorderedPresets;
            this.savePresets(finalPresets);
        },

        // 순서 변경 UI 열기
        openReorderModal: function() {
            const presets = this.getPresets();
            // 기본 프리셋을 제외한 프리셋들만 순서변경 대상으로 처리
            const reorderablePresets = presets.filter(p => p.name !== '기본 프리셋');
            
            if (reorderablePresets.length <= 1) {
                if (window.toastr) toastr.info('순서를 변경할 수 있는 프리셋이 2개 이상 있어야 합니다.');
                return;
            }
            
            const list = $('#copybot_reorder_list').empty();
            reorderablePresets.forEach((preset, index) => {
                const isFirst = index === 0;
                const isLast = index === reorderablePresets.length - 1;
                const upButton = isFirst ? '' : '<button class="copybot_move_up" style="margin-right: 5px; padding: 2px 6px; font-size: 12px;">↑</button>';
                const downButton = isLast ? '' : '<button class="copybot_move_down" style="margin-left: 5px; padding: 2px 6px; font-size: 12px;">↓</button>';
                
                const item = $(`<li class="copybot_reorder_item" style="display: flex; align-items: center; justify-content: space-between;">
                    <span class="copybot_reorder_name">${this.escapeHtml(preset.name)}</span>
                    <div class="copybot_reorder_buttons">${upButton}${downButton}</div>
                </li>`);
                item.data('presetName', preset.name);
                list.append(item);
            });
            
            // 프롬프트 관련 요소들을 숨기고 순서 변경 UI를 표시
            $('#copybot_prompt_container > .copybot_settings_main, #copybot_ghostwrite_textbox, #copybot_ghostwrite_exclude_container').slideUp(200, function() {
                $('#copybot_reorder_overlay').slideDown(200);
            });
        },

        // 순서 변경 UI 닫기
        closeReorderModal: function() {
            // 순서 변경 UI를 숨기고 프롬프트 관련 요소들을 다시 표시
            $('#copybot_reorder_overlay').slideUp(200, function() {
                $('#copybot_prompt_container > .copybot_settings_main, #copybot_ghostwrite_textbox, #copybot_ghostwrite_exclude_container').slideDown(200);
            });
        },

        // === 내부 헬퍼 함수들 ===

        // 디버그 로그 (utils 모듈 사용)
        debugLog: function(...args) {
            if (window.CopyBotUtils) {
                window.CopyBotUtils.debugLog(window.copybot_debug_mode, ...args);
            }
        },

        // HTML 이스케이프 (utils 모듈 사용)
        escapeHtml: function(str) {
            if (window.CopyBotUtils) {
                return window.CopyBotUtils.escapeHtml(str);
            }
            return str || '';
        },

        // 편집 모드 상태 조회
        isEditMode: function() {
            return isPresetEditMode;
        }
    };

    if (window.copybot_debug_mode) {
        console.log('CopyBotPresets 모듈 로드 완료');
    }
})();