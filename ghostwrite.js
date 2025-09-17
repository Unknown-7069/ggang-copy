// 깡갤 복사기 대필 및 자동저장 시스템 모듈
// 대필 실행, 프로필 전환, 하이브리드 자동저장, 임시 프롬프트 관리
(function() {
    'use strict';

    // 전역 네임스페이스 생성
    window.CopyBotGhostwrite = {
        
        // === 모듈 초기화 ===
        init: function(dependencies) {
            this.dependencies = dependencies || {};
            
            // 자동저장용 상태 변수 초기화
            this._lastSavedValues = {
                basicPrompt: '',
                excludePrompt: '',
                profile: 'default'
            };
            
            // 디바운싱 타이머 상태 변수
            this._debounceTimers = {
                basicPrompt: null,
                excludePrompt: null,
                profile: null
            };
            
            // 자동저장 진행 상태 변수
            this._isSaving = {
                basicPrompt: false,
                excludePrompt: false,
                profile: false
            };
            
            // 대필 상태 변수
            this._isGhostwritingActive = false;
            this._ghostwriteOriginalProfile = null;
            
            if (window.copybot_debug_mode) {
                console.log('CopyBotGhostwrite 모듈 초기화 완료');
            }
            return true;
        },

        // === 임시 프롬프트 관리 ===
        
        // 임시 프롬프트 저장 함수
        saveTempPrompt: function() {
            try {
                const tempPrompt = $('#copybot_temp_prompt').val();
                sessionStorage.setItem('copybot_temp_prompt', tempPrompt);
            } catch (error) {
                console.warn('깡갤 복사기: 임시 프롬프트 저장 실패', error);
            }
        },

        // 임시 프롬프트 로드 함수
        loadTempPrompt: function() {
            try {
                const savedTempPrompt = sessionStorage.getItem('copybot_temp_prompt');
                if (savedTempPrompt) {
                    $('#copybot_temp_prompt').val(savedTempPrompt);
                }
            } catch (error) {
                console.warn('깡갤 복사기: 임시 프롬프트 로드 실패', error);
            }
        },

        // === 상태 관리 ===
        
        // 안전한 초기값 동기화 (DOM 준비 확인 + 에러 핸들링 + 재시도)
        syncInitialValues: function(retryCount = 0) {
            const maxRetries = 3;
            const retryDelay = 200;

            try {
                // DOM 요소 준비 상태 확인
                const basicElement = $('#copybot_ghostwrite_textbox');
                const excludeElement = $('#copybot_ghostwrite_exclude_textbox');
                const profileElement = $('#copybot_ghostwrite_profile_select');

                // DOM이 준비되지 않았으면 재시도
                if (basicElement.length === 0 || excludeElement.length === 0 || profileElement.length === 0) {
                    if (retryCount < maxRetries) {
                        if (this.dependencies && this.dependencies.utils) {
                            this.dependencies.utils.debugLog(window.copybot_debug_mode, 
                                `DOM 요소 대기 중... 재시도 ${retryCount + 1}/${maxRetries}`);
                        }
                        setTimeout(() => this.syncInitialValues(retryCount + 1), retryDelay);
                        return;
                    } else {
                        // 최대 재시도 후에도 실패하면 기본값 유지하고 경고
                        if (this.dependencies && this.dependencies.utils) {
                            this.dependencies.utils.debugLog(window.copybot_debug_mode, 
                                '⚠️ DOM 요소를 찾을 수 없어 기본값 유지, 기본 기능은 정상 작동');
                        }
                        return;
                    }
                }

                // 안전한 값 추출 (전체 삭제 감지를 위한 실제 UI 값 사용)
                const actualBasicPrompt = basicElement.val() || '';
                const actualExcludePrompt = excludeElement.val() || '';
                const actualProfile = profileElement.val() || 'default';

                // 초기값 설정
                this._lastSavedValues.basicPrompt = actualBasicPrompt;
                this._lastSavedValues.excludePrompt = actualExcludePrompt;
                this._lastSavedValues.profile = actualProfile;

                if (this.dependencies && this.dependencies.utils) {
                    this.dependencies.utils.debugLog(window.copybot_debug_mode, 
                        '✅ 안전한 초기값 동기화 성공',
                        'basicPrompt:', actualBasicPrompt,
                        'excludePrompt:', actualExcludePrompt,
                        'profile:', actualProfile
                    );
                }

            } catch (error) {
                // 에러가 발생해도 기본 기능은 유지
                console.warn('깡갤 복사기: 초기값 동기화 실패, 기본값 유지하며 정상 작동', error);
                
                // Fallback: 빈 값으로라도 초기화하여 기본 동작 보장
                this._lastSavedValues.basicPrompt = '';
                this._lastSavedValues.excludePrompt = '';
                this._lastSavedValues.profile = 'default';
                
                if (this.dependencies && this.dependencies.utils) {
                    this.dependencies.utils.debugLog(window.copybot_debug_mode, 
                        '🔧 Fallback 초기화 완료, 기본 기능은 정상 작동');
                }
            }
        },

        // === 상태 아이콘 시스템 ===
        
        // 상태 아이콘 표시/숨김 함수
        showStatusIcon: function(fieldName, isLoading = true) {
            const selectorMap = {
                'basicPrompt': '#copybot_basic_prompt_status',
                'excludePrompt': '#copybot_exclude_prompt_status', 
                'profile': '#copybot_profile_status'
            };
            
            const selector = selectorMap[fieldName];
            if (!selector) {
                console.warn(`알 수 없는 필드명: ${fieldName}`);
                return;
            }
            
            const statusElement = $(selector);
            if (this.dependencies && this.dependencies.utils) {
                this.dependencies.utils.debugLog(window.copybot_debug_mode, `상태 아이콘 ${isLoading ? '⏳' : '✅'} 표시 시도:`, selector, `요소 발견: ${statusElement.length > 0}`);
            }
            
            if (statusElement.length) {
                statusElement.text(isLoading ? '⏳' : '✅').show();
                if (this.dependencies && this.dependencies.utils) {
                    this.dependencies.utils.debugLog(window.copybot_debug_mode, `${fieldName} 상태 아이콘 ${isLoading ? '로딩' : '완료'} 표시됨`);
                }
                
                if (!isLoading) {
                    setTimeout(() => {
                        statusElement.fadeOut(2000);
                        if (this.dependencies && this.dependencies.utils) {
                            this.dependencies.utils.debugLog(window.copybot_debug_mode, `${fieldName} 상태 아이콘 페이드아웃 시작`);
                        }
                    }, 2000); // 2초 표시 후 2초 페이드아웃 (총 4초)
                }
            } else {
                console.warn(`상태 아이콘 요소를 찾을 수 없음: ${selector}`);
            }
        },

// === 값 변경 감지 ===
        
        // 값 변경 감지 래퍼 함수
        hasValueChanged: function(fieldName, currentValue) {
            return window.CopyBotUtils ? 
                window.CopyBotUtils.hasValueChanged(this._lastSavedValues, fieldName, currentValue) :
                this._lastSavedValues[fieldName] !== currentValue;
        },

        // === 임시 프롬프트 스타일 관리 ===
        
        // 임시 프롬프트 창 스타일 업데이트 함수
        updateTempPromptStyle: function() {
		try {
			const tempPromptInput = document.querySelector('#copybot_temp_prompt');
			const sendTextarea = document.querySelector('#send_textarea');
			
			if (!tempPromptInput || !sendTextarea) return;
			
			// send_textarea의 최신 스타일 가져오기
			const originalStyles = window.getComputedStyle(sendTextarea);
			tempPromptInput.style.cssText = `
				width: 100%;
				border: ${originalStyles.border};
				border-top: none;
				border-radius: 0 0 5px 5px;
				background: ${originalStyles.backgroundColor};
				color: ${originalStyles.color};
				font-family: ${originalStyles.fontFamily};
				font-size: ${originalStyles.fontSize};
				padding: ${originalStyles.padding};
				resize: vertical;
				min-height: 35px;
				max-height: 100px;
				box-sizing: border-box;
				outline: none;
				margin: 0;
			`;
			
			if (this.dependencies && this.dependencies.utils) {
				this.dependencies.utils.debugLog(window.copybot_debug_mode, '깡갤 복사기: 임시 프롬프트 창 스타일 업데이트 완료');
			}
		} catch (error) {
			console.error('깡갤 복사기: 임시 프롬프트 창 스타일 업데이트 실패', error);
		}
	},

	// 임시대필칸 제거 함수
	removeTempPromptField: function() {
		try {
			const existingContainers = document.querySelectorAll('.copybot_temp_prompt_below');
			if (existingContainers.length > 0) {
				existingContainers.forEach(container => {
					container.remove();
				});
				
				// send_textarea의 border-radius 원복
				const sendTextarea = document.querySelector('#send_textarea');
				if (sendTextarea) {
					sendTextarea.style.borderRadius = '';
				}
				
				if (this.dependencies && this.dependencies.utils) {
					this.dependencies.utils.debugLog(window.copybot_debug_mode, '임시대필칸 제거 완료');
				}
			}
		} catch (error) {
			console.error('임시대필칸 제거 실패:', error);
		}
	},

	// 임시대필칸 강제 새로고침 함수  
	refreshTempPromptField: function() {
		if (this.dependencies && this.dependencies.utils) {
			this.dependencies.utils.debugLog(window.copybot_debug_mode, '임시대필칸 강제 새로고침 시작');
		}
		this.removeTempPromptField();
		setTimeout(() => {
			this.addTempPromptField();
		}, 100);
	},

        // === 하이브리드 자동저장 시스템 ===
        
        // 3가지 트리거 조합 & 중복 방지 로직이 포함된 하이브리드 자동저장
        executeHybridAutoSave: async function(fieldName, triggerType = 'unknown') {
            try {
                // 이미 저장 중이면 중복 실행 방지
                if (this._isSaving[fieldName]) {
                    if (this.dependencies && this.dependencies.utils) {
                        this.dependencies.utils.debugLog(window.copybot_debug_mode, `${fieldName} 이미 저장 중이므로 중복 실행 방지 (${triggerType})`);
                    }
                    return;
                }

                let currentValue = '';
                let presetNeedsUpdate = false;
                
                switch(fieldName) {
                    case 'basicPrompt':
                        currentValue = $('#copybot_ghostwrite_textbox').val() || '';
                        presetNeedsUpdate = true;
                        break;
                    case 'excludePrompt':
                        currentValue = $('#copybot_ghostwrite_exclude_textbox').val() || '';
                        presetNeedsUpdate = true;
                        break;
                    case 'profile':
                        currentValue = $('#copybot_ghostwrite_profile_select').val() || 'default';
                        presetNeedsUpdate = true;
                        break;
                }
                
                // 프리셋 관련 필드라면 현재 선택된 프리셋 정보도 함께 체크
                if (presetNeedsUpdate) {
                    window.currentFieldBeingUpdated = fieldName;
                    window.currentFieldValue = currentValue;
                }

                // 중복 방지: 값이 변경되지 않았으면 저장 건너뛰기
                if (!this.hasValueChanged(fieldName, currentValue)) {
                    if (this.dependencies && this.dependencies.utils) {
                        this.dependencies.utils.debugLog(window.copybot_debug_mode, `${fieldName} 값이 변경되지 않아 저장 건너뛰기 (${triggerType})`);
                    }
                    return;
                }

                // 저장 상태 시작
                this._isSaving[fieldName] = true;
                this.showStatusIcon(fieldName, true); // ⏳ 표시
                if (this.dependencies && this.dependencies.utils) {
                    this.dependencies.utils.debugLog(window.copybot_debug_mode, `${fieldName} 하이브리드 자동저장 시작 (트리거: ${triggerType})`);
                }

                // 프리셋 저장 (통합된 방식으로 중복 제거)
                if (window.CopyBotPresets && window.CopyBotPresets.saveCurrentPreset) {
                    window.CopyBotPresets.saveCurrentPreset(true);
                } else if (window.saveCurrentPreset) {
                    window.saveCurrentPreset(true);
                } else {
                    console.error('saveCurrentPreset 함수를 찾을 수 없음');
                }
                
                if (this.dependencies && this.dependencies.utils) {
                    this.dependencies.utils.debugLog(window.copybot_debug_mode, `${fieldName} 프리셋 자동저장 및 다중 백업 완료`);
                }
                
                // 개선된 저장값 동기화: 저장 직전 값 보존 + 타이밍 안전장치
                const valueToSave = currentValue; // 저장에 사용된 정확한 값 보존
                
                // 저장 완료 후 검증과 함께 업데이트 (기존 200ms 유지하되 검증 강화)
                setTimeout(() => {
                    // 저장 완료 후 UI 값과 저장값 비교 검증
                    let currentUiValue = '';
                    switch(fieldName) {
                        case 'basicPrompt':
                            currentUiValue = $('#copybot_ghostwrite_textbox').val() || '';
                            break;
                        case 'excludePrompt':
                            currentUiValue = $('#copybot_ghostwrite_exclude_textbox').val() || '';
                            break;
                        case 'profile':
                            currentUiValue = $('#copybot_ghostwrite_profile_select').val() || 'default';
                            break;
                    }
                    
                    // 안전장치: UI 값이 변경되었으면 경고하고 저장된 값 사용
                    if (currentUiValue !== valueToSave) {
                        if (this.dependencies && this.dependencies.utils) {
                            this.dependencies.utils.debugLog(window.copybot_debug_mode, `⚠️  ${fieldName} UI 값 변경 감지! 저장값: "${valueToSave}", 현재값: "${currentUiValue}"`);
                        }
                        this._lastSavedValues[fieldName] = valueToSave; // 저장된 값으로 동기화
                    } else {
                        this._lastSavedValues[fieldName] = currentUiValue; // UI 값으로 동기화
                    }
                    
                    if (this.dependencies && this.dependencies.utils) {
                        this.dependencies.utils.debugLog(window.copybot_debug_mode, `${fieldName} 최종 저장값 안전 동기화:`, this._lastSavedValues[fieldName]);
                    }
                }, 200);
                
                // 저장 완료 표시
                this.showStatusIcon(fieldName, false); // ✅ 표시 후 페이드아웃

                if (this.dependencies && this.dependencies.utils) {
                    this.dependencies.utils.debugLog(window.copybot_debug_mode, `${fieldName} 하이브리드 자동저장 완료 (트리거: ${triggerType})`);
                }

            } catch (error) {
                console.error(`깡갤 복사기: ${fieldName} 하이브리드 자동저장 실패 (${triggerType})`, error);
                // 에러 발생 시 상태 아이콘 숨기기
                this.showStatusIcon(fieldName, false);
            } finally {
                // 저장 상태 해제 (500ms 후)
                setTimeout(() => {
                    this._isSaving[fieldName] = false;
                }, 500);
            }
        },

        // === 디바운싱 자동저장 시스템 ===
        
        // 디바운싱 자동저장 함수
        scheduleDebounceAutoSave: function(fieldName, delay = 500) {
            // 기존 타이머 취소
            if (this._debounceTimers[fieldName]) {
                clearTimeout(this._debounceTimers[fieldName]);
            }
            
            // 새 타이머 설정
            this._debounceTimers[fieldName] = setTimeout(() => {
                this.executeHybridAutoSave(fieldName, 'debounce');
            }, delay);
        },

        // 즉시 자동저장 함수 (blur, change 이벤트용)
        scheduleImmediateAutoSave: function(fieldName, triggerType) {
            if (this.dependencies && this.dependencies.utils) {
                this.dependencies.utils.debugLog(window.copybot_debug_mode, `scheduleImmediateAutoSave 호출됨: ${fieldName}, ${triggerType}`);
            }
            
            // 디바운싱 타이머가 있다면 취소 (즉시 저장이 우선)
            if (this._debounceTimers[fieldName]) {
                if (this.dependencies && this.dependencies.utils) {
                    this.dependencies.utils.debugLog(window.copybot_debug_mode, `${fieldName} 기존 디바운싱 타이머 취소`);
                }
                clearTimeout(this._debounceTimers[fieldName]);
                this._debounceTimers[fieldName] = null;
            }
            
            // 즉시 실행
            if (this.dependencies && this.dependencies.utils) {
                this.dependencies.utils.debugLog(window.copybot_debug_mode, `${fieldName} 50ms 후 executeHybridAutoSave 실행 예약`);
            }
            setTimeout(() => {
                if (this.dependencies && this.dependencies.utils) {
                    this.dependencies.utils.debugLog(window.copybot_debug_mode, `${fieldName} executeHybridAutoSave 실행 시작`);
                }
                this.executeHybridAutoSave(fieldName, triggerType);
            }, 50); // 최소한의 지연으로 UI 업데이트 완료 대기
        },

        // === 임시 프롬프트 DOM 조작 ===
        
        // 대필 임시 프롬프트 입력칸을 채팅 입력창 바로 아래에 붙여서 추가하는 함수
        addTempPromptField: function() {
            try {
                if (this.dependencies && this.dependencies.utils) {
                    this.dependencies.utils.debugLog(window.copybot_debug_mode, '깡갤 복사기: 임시 프롬프트 입력칸 추가 시작');
                }
                
                // 대필기능과 임시 대필칸 사용 설정 확인
				const ghostwriteEnabled = $('#copybot_ghostwrite_toggle').attr('data-enabled') === 'true';
				const useTempField = $('#copybot_temp_field_toggle').attr('data-enabled') === 'true';

				// 대필기능이 꺼져있거나 임시 대필칸 사용이 꺼져있으면 기존 칸 제거 후 종료
				if (!ghostwriteEnabled || !useTempField) {
					this.removeTempPromptField(); // 기존 칸 제거
					if (this.dependencies && this.dependencies.utils) {
						this.dependencies.utils.debugLog(window.copybot_debug_mode, '깡갤 복사기: 대필기능 꺼짐 또는 임시 대필칸 사용 안함 - 기존 임시대필칸 제거');
					}
					return;
				}

				// 기존 임시 프롬프트 제거 (정상 진행 시에만)
				document.querySelectorAll('.copybot_temp_prompt_below').forEach(el => el.remove());
                
                const sendTextarea = document.querySelector('#send_textarea');
                if (!sendTextarea) {
                    if (this.dependencies && this.dependencies.utils) {
                        this.dependencies.utils.debugLog(window.copybot_debug_mode, '깡갤 복사기: send_textarea를 찾을 수 없음');
                    }
                    return;
                }

                // send_textarea의 부모와 조부모 찾기
                const textareaParent = sendTextarea.parentElement; // nonQRFormItems
                const grandParent = textareaParent.parentElement; // send_form
                
                if (!grandParent) {
                    if (this.dependencies && this.dependencies.utils) {
                        this.dependencies.utils.debugLog(window.copybot_debug_mode, '깡갤 복사기: send_form을 찾을 수 없음');
                    }
                    return;
                }

                // 임시 대필칸 생성 (완전히 새로운 컨테이너로)
                const tempPromptContainer = document.createElement('div');
                tempPromptContainer.className = 'copybot_temp_prompt_below';
                tempPromptContainer.style.cssText = `
                    width: 100%;
                    margin: 0;
                    padding: 0;
                    order: 999;
                `;
                
                const tempPromptInput = document.createElement('textarea');
                tempPromptInput.id = 'copybot_temp_prompt';
                
                // CSS 기반이므로 항상 기본 placeholder 설정 (CSS에서 숨김 처리)
                tempPromptInput.placeholder = '대필 임시 지시문...';
                tempPromptInput.rows = 1;
                
                // send_textarea와 같은 스타일 복사
                const originalStyles = window.getComputedStyle(sendTextarea);
                tempPromptInput.style.cssText = `
                    width: 100%;
                    border: ${originalStyles.border};
                    border-top: none;
                    border-radius: 0 0 5px 5px;
                    background: ${originalStyles.backgroundColor};
                    color: ${originalStyles.color};
                    font-family: ${originalStyles.fontFamily};
                    font-size: ${originalStyles.fontSize};
                    padding: ${originalStyles.padding};
                    resize: vertical;
                    min-height: 35px;
                    max-height: 100px;
                    box-sizing: border-box;
                    outline: none;
                    margin: 0;
                `;

                // 자동 높이 조절 기능 추가
                const autoResize = () => {
                    tempPromptInput.style.height = 'auto';
                    const scrollHeight = tempPromptInput.scrollHeight;
                    const maxHeight = 100; // 최대 높이 제한
                    const minHeight = 35; // 최소 높이
                    
                    if (scrollHeight > maxHeight) {
                        tempPromptInput.style.height = maxHeight + 'px';
                        tempPromptInput.style.overflowY = 'auto';
                    } else {
                        tempPromptInput.style.height = Math.max(scrollHeight, minHeight) + 'px';
                        tempPromptInput.style.overflowY = 'hidden';
                    }
                };

                // 입력 시 자동 저장 및 높이 조절
                const self = this;
                tempPromptInput.addEventListener('input', () => {
                    autoResize();
                    if (self.saveTempPrompt) {
                        self.saveTempPrompt();
                    }
                });

                // 초기 높이 설정
                setTimeout(autoResize, 100);
                
                tempPromptContainer.appendChild(tempPromptInput);
                
                // send_textarea의 border-radius 수정 (연결된 느낌)
                sendTextarea.style.borderRadius = '5px 5px 0 0';
                
                // 안전한 방법: send_form의 맨 마지막에 추가 (기존 레이아웃 건드리지 않음)
                grandParent.appendChild(tempPromptContainer);

                if (this.dependencies && this.dependencies.utils) {
                    this.dependencies.utils.debugLog(window.copybot_debug_mode, '깡갤 복사기: 임시 프롬프트 입력칸 추가 완료');
                }

            } catch (error) {
                console.error('깡갤 복사기: 임시 프롬프트 입력칸 추가 실패', error);
            }
        },

        // === 프로필 전환 시스템 ===
        
        // 프로필 전환 함수 (비동기 처리 및 타이밍 이슈 주의)
        switchProfile: async function(targetProfileId, isRestore = false) {
            try {
                const connectionDropdown = document.querySelector('#connection_profiles');
                if (!connectionDropdown) {
                    if (this.dependencies && this.dependencies.utils) {
                        this.dependencies.utils.debugLog(window.copybot_debug_mode, '연결 프로필 드롭다운을 찾을 수 없음');
                    }
                    return false;
                }

                if (connectionDropdown.value === targetProfileId) {
                    if (this.dependencies && this.dependencies.utils) {
                        this.dependencies.utils.debugLog(window.copybot_debug_mode, `이미 ${targetProfileId} 프로필에 연결됨`);
                    }
                    return true;
                }

                if (this.dependencies && this.dependencies.utils) {
                    this.dependencies.utils.debugLog(window.copybot_debug_mode, `프로필 전환 시도: ${connectionDropdown.value} -> ${targetProfileId}`);
                }
                
                connectionDropdown.value = targetProfileId;
                const changeEvent = new Event('change', { bubbles: true });
                connectionDropdown.dispatchEvent(changeEvent);

                // [최종 안정화] SillyTavern 서버가 프로필을 완전히 로드할 때까지 1.5초간 대기합니다.
                // 이 방식이 가장 단순하고 확실하게 타이밍 문제를 해결합니다.
                const waitTime = 1500;
                if (this.dependencies && this.dependencies.utils) {
                    this.dependencies.utils.debugLog(window.copybot_debug_mode, `프로필 안정화를 위해 ${waitTime}ms 대기...`);
                }
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                const actionText = isRestore ? '복원' : '전환';
                if (this.dependencies && this.dependencies.utils) {
                    this.dependencies.utils.debugLog(window.copybot_debug_mode, `프로필 ${actionText} 완료된 것으로 간주: ${targetProfileId}`);
                }
                return true;

            } catch (error) {
                console.error('깡갤 복사기: 프로필 전환 실패', error);
                return false;
            }
        },

        // === 대필 실행 시스템 ===
        
        // 상태 조회 함수들
        isGhostwritingActive: function() {
            return this._isGhostwritingActive;
        },

        setGhostwritingActive: function(active) {
            this._isGhostwritingActive = active;
        },

        getGhostwriteOriginalProfile: function() {
            return this._ghostwriteOriginalProfile;
        },

        // 안전한 최우선순위 방식: 100% 안전한 대필 실행 함수 (사용자 설정 건드리지 않음 + 토큰 절약)
        executeGhostwrite: async function() {
            let originalProfile = null;
            let profileChangeAttempted = false;
            
            const sendButton = document.querySelector('#send_but');
            const sendIcon = sendButton ? sendButton.querySelector('i.fa-solid') : null;
            
            const rightSendForm = document.querySelector('#rightSendForm');		

            try {
                this._isGhostwritingActive = true;
                this._ghostwriteOriginalProfile = null;

                const promptText = ($('#copybot_ghostwrite_textbox').val() || '').trim();
                const excludeText = ($('#copybot_ghostwrite_exclude_textbox').val() || '').trim();
                const useTempField = $('#copybot_temp_field_toggle').attr('data-enabled') === 'true';
                
                let finalPrompt = '';

                if (useTempField) {
                    const tempPromptText = ($('#copybot_temp_prompt').val() || '').trim();
                    const parts = [];
                    if (promptText) parts.push(promptText);
                    if (tempPromptText) parts.push(tempPromptText);
                    finalPrompt = parts.join(', ');
                } else {
                    const chatInputText = ($('#send_textarea').val() || '').trim();
                    const parts = [];
                    if (promptText) parts.push(promptText);
                    if (chatInputText) parts.push(chatInputText);
                    finalPrompt = parts.join(', ');
                }

                let requestMessage = finalPrompt.trim() ? `"${finalPrompt.substring(0, 100)}..."로 대필 요청합니다.` : '빈 프롬프트로 대필 요청합니다.';
                toastr.info(requestMessage);

                if (this.dependencies && this.dependencies.utils) {
                    this.dependencies.utils.debugLog(window.copybot_debug_mode, '🎭 깡갤 복사기: 대필 시작');
                }
                
                if (rightSendForm) {
                    const formWidth = rightSendForm.getBoundingClientRect().width;
                    if (formWidth > 0) {
                        rightSendForm.style.minWidth = `${formWidth}px`;
                    }
                }
                if (sendButton && sendIcon) {
                    sendButton.disabled = true;
                    sendIcon.style.display = 'none';
                    const spinner = document.createElement('i');
                    spinner.className = 'fa-solid fa-spinner fa-spin';
                    spinner.style.fontSize = window.getComputedStyle(sendIcon).fontSize;
                    spinner.style.color = window.getComputedStyle(sendIcon).color;
                    sendButton.appendChild(spinner);
                }

                const selectedProfile = $('#copybot_ghostwrite_profile_select').val();
                const selectedProfileName = $('#copybot_ghostwrite_profile_select option:selected').text();

                if (selectedProfile && selectedProfile !== 'default') {
                    const connectionDropdown = document.querySelector('#connection_profiles');
                    if (connectionDropdown) {
                        originalProfile = connectionDropdown.value;
                        this._ghostwriteOriginalProfile = originalProfile; 

                        if (originalProfile !== selectedProfile) {
                            profileChangeAttempted = true;
                            await this.switchProfile(selectedProfile);
                            if (window.copybot_debug_mode) {
                                toastr.success(`대필 전용 프로필 '${selectedProfileName}'로 전환되었습니다.`);
                            }
                        }
                    }
                }

                if (!this._isGhostwritingActive) {
                    throw new Error('User cancelled during profile switch.');
                }
                
                const context = window.SillyTavern?.getContext();

                if (!context || !context.generateQuietPrompt) {
                    toastr.error('SillyTavern 컨텍스트를 찾을 수 없습니다.');
                    return;
                }

                let exclusionInstruction = excludeText ? `\n[Exclusion Instructions]\nCRITICAL: The following elements must be completely avoided in the response. Do not use these words, phrases, tones, or concepts:\n${excludeText}\n` : '';

                const overridePrompt = finalPrompt.trim() ? `<OVERRIDE>
                    Apply the following instructions with priority over existing settings:
                    1. Write only {{user}}'s reactions and responses
                    2. Follow {{user}}'s character settings and personality
                    3. Do not use system messages
                    4. Do not repeat or quote sentences or expressions from previous responses
                    5. Use appropriate paragraph breaks, but merge consecutive dialogue without actions or descriptions into single sentences
                    6. Before writing, briefly recall {{user}}'s established personality, speech patterns, and their relationship with the other character to ensure perfect consistency.
                    7. Prioritize weaving the character's emotions and intentions into their 'dialogue'. Use action descriptions (narration) to describe the atmosphere or specific situations that are difficult to convey with dialogue alone, seeking a natural harmony between the two.
                    ${exclusionInstruction}
                    [User's Core Intent]
                    The following is the user's core intent, possibly written as a brief memo or keyword. Interpret this intent, expand upon it, and express it as natural dialogue and actions from {{user}}'s perspective.
                    Core Intent: ${finalPrompt}
                    </OVERRIDE>` : `<OVERRIDE>
                    Apply the following instructions with priority over existing settings:
                    1. Write only {{user}}'s reactions and responses
                    2. Follow {{user}}'s character settings and personality
                    3. Do not use system messages
                    4. Do not repeat or quote sentences or expressions from previous responses
                    5. Use appropriate paragraph breaks, but merge consecutive dialogue without actions or descriptions into single sentences
                    6. Before writing, briefly recall {{user}}'s established personality, speech patterns, and their relationship with the other character to ensure perfect consistency.
                    7. Prioritize weaving the character's emotions and intentions into their 'dialogue'. Use action descriptions (narration) to describe the atmosphere or specific situations that are difficult to convey with dialogue alone, seeking a natural harmony between the two.
                    ${exclusionInstruction}
                    </OVERRIDE>`;
                
                if (this.dependencies && this.dependencies.utils) {
                    this.dependencies.utils.debugLog(window.copybot_debug_mode, '🔹 AI에 전송할 최종 명령어:', overridePrompt);
                }

                let result;
                // 프로필 전환 여부에 따라 재시도 횟수 결정
                const maxRetries = profileChangeAttempted ? 3 : 1;
                const retryDelay = 1500;

                for (let i = 0; i < maxRetries; i++) {
                    if (!this._isGhostwritingActive) {
                        throw new Error('User cancelled before API call.');
                    }
                    try {
                        if (this.dependencies && this.dependencies.utils) {
                            this.dependencies.utils.debugLog(window.copybot_debug_mode, `대필 요청 시도 (${i + 1}/${maxRetries})...`);
                        }
                        result = await context.generateQuietPrompt(overridePrompt, false, true);
                        if (this.dependencies && this.dependencies.utils) {
                            this.dependencies.utils.debugLog(window.copybot_debug_mode, '✅ 대필 요청 성공!');
                        }
                        break;
                    } catch (error) {
                        const errorMessage = String(error);
                        console.warn(`대필 시도 ${i + 1} 실패:`, errorMessage);

                        if (!this._isGhostwritingActive || errorMessage.includes('Clicked stop button')) {
                            throw error;
                        }

                        if (i === maxRetries - 1) {
                            throw error;
                        }
                        if (this.dependencies && this.dependencies.utils) {
                            this.dependencies.utils.debugLog(window.copybot_debug_mode, `${retryDelay}ms 후 재시도...`);
                        }
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    }
                }

                if (this.dependencies && this.dependencies.utils) {
                    this.dependencies.utils.debugLog(window.copybot_debug_mode, '✅ 대필 원본 결과 받음:', result);
                }

                let cleanedResult = result;
                if (cleanedResult) {
                    cleanedResult = cleanedResult.replace(/<OVERRIDE>|제목:|주제:/gi, '').replace(/<\/OVERRIDE>/gi, '').replace(/\{\{user\}\} POV only[^\n]*/gi, '').replace(/<Override Primary Directive>/gi, '').replace(/<CRITICAL_SYSTEM_OVERRIDE>/gi, '').replace(/\[System Override[^\]]*\]/gi, '').replace(/^\s*\n+/, '').trim();
                    if (this.dependencies && this.dependencies.utils) {
                        this.dependencies.utils.debugLog(window.copybot_debug_mode, '🧹 정리된 대필 결과:', cleanedResult);
                    }
                    if (cleanedResult.trim()) {
                        $('#send_textarea').val(cleanedResult).trigger('input');
                        if (this.dependencies && this.dependencies.utils) {
                            this.dependencies.utils.debugLog(window.copybot_debug_mode, '깡갤 복사기: 대필 결과 입력창 삽입 완료');
                        }
                    } else {
                        toastr.warning('대필 결과가 비어있습니다. 다시 시도해주세요.');
                    }
                } else if (this._isGhostwritingActive) {
                    toastr.warning('대필 결과를 받지 못했습니다. 다시 시도해주세요.');
                }
                
                if (useTempField && this.saveTempPrompt) {
                    this.saveTempPrompt();
                }

            } catch (error) {
                const errorString = String(error);
                
                if (errorString.includes('User cancelled') || errorString.includes('Clicked stop button')) {
                    if (this.dependencies && this.dependencies.utils) {
                        this.dependencies.utils.debugLog(window.copybot_debug_mode, '🚫 깡갤 복사기: 대필 작업이 사용자에 의해 중단되었습니다.');
                    }
                    toastr.info('대필 요청이 중단되었습니다.');
                } else {
                    console.error('깡갤 복사기: 대필 실행 중 최종 오류', error);
                    toastr.error('대필에 최종적으로 실패했습니다.');
                }
            } finally {
                if (profileChangeAttempted && originalProfile) {
                    try {
                        if (this.dependencies && this.dependencies.utils) {
                            this.dependencies.utils.debugLog(window.copybot_debug_mode, `프로필 원복 시도: ${originalProfile}`);
                        }
                        await this.switchProfile(originalProfile, true);
                        
                        const originalProfileName = $(`#connection_profiles option[value="${originalProfile}"]`).text();
                        if (window.copybot_debug_mode) {
                            toastr.success(`원래 프로필 '${originalProfileName}'로 복원되었습니다.`);
                        }
                    } catch (restoreError) {
                        console.error('!!! 치명적 오류: 프로필 원복에 실패했습니다 !!!', restoreError);
                        toastr.error('프로필이 원래대로 복원되지 않았습니다! 수동으로 확인해주세요.');
                    }
                }

                if (rightSendForm) {
                    rightSendForm.style.minWidth = '';
                }

                this._isGhostwritingActive = false;
                this._ghostwriteOriginalProfile = null;
                
                if (sendButton) {
                    sendButton.disabled = false;
                    const spinner = sendButton.querySelector('i.fa-spinner');
                    if (spinner) spinner.remove();
                    if (sendIcon) sendIcon.style.display = '';
                }
            }
        }
    };

    if (window.copybot_debug_mode) {
        console.log('CopyBotGhostwrite 모듈 로드 완료');
    }
})();