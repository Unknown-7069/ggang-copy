// 깡갤 복사기 아이콘 관리 모듈
// DOM 준비 상태 확인, 아이콘 업데이트, 레이아웃 안정화 처리
(function() {
    'use strict';

    // 내부 변수들
	let utils = null;
	let isDebugMode = false;
	let callbacks = null;

    // 전역 네임스페이스 생성
    window.CopyBotIcons = {
        // 모듈 초기화 함수
		init: function(dependencies) {
			try {
				utils = dependencies.utils || window.CopyBotUtils;
				isDebugMode = dependencies.isDebugMode || false;
				callbacks = dependencies.callbacks || {};
				
				if (!utils) {
					console.error('깡갤 복사기: CopyBotIcons - utils 의존성이 없습니다');
					return false;
				}
				
				if (!callbacks.executeGhostwrite) {
					console.warn('깡갤 복사기: CopyBotIcons - executeGhostwrite 콜백이 없습니다');
				}
				
				debugLog('CopyBotIcons 모듈 초기화 완료');
				return true;
			} catch (error) {
				console.error('깡갤 복사기: CopyBotIcons 초기화 실패', error);
				return false;
			}
		},

        // 디버그 모드 설정
        setDebugMode: function(enabled) {
            isDebugMode = enabled;
            debugLog('아이콘 모듈 디버그 모드:', enabled ? 'ON' : 'OFF');
        },

        // DOM 준비 상태 확인 함수 (index.js에서 이동)
		isInputFieldReady: function() {
			const rightSendForm = document.querySelector('#rightSendForm');
			const leftSendForm = document.querySelector('#leftSendForm');
			const textarea = document.querySelector('#send_textarea');
			const sendButton = document.querySelector('#send_but');
			
			// 더 엄격한 체크: 모든 요소가 존재하고 실제로 DOM에 연결되어 있는지 확인
			const allElementsExist = !!(rightSendForm && leftSendForm && textarea && sendButton);
			const allElementsConnected = !!(
				rightSendForm && rightSendForm.isConnected &&
				leftSendForm && leftSendForm.isConnected &&
				textarea && textarea.isConnected &&
				sendButton && sendButton.isConnected
			);
			
			// 요소들이 실제로 화면에 렌더링되었는지 확인
			const hasLayout = !!(
				textarea && textarea.offsetParent &&
				rightSendForm && rightSendForm.offsetParent
			);
			
			const isReady = allElementsExist && allElementsConnected && hasLayout;
			
			if (!isReady) {
				debugLog('깡갤 복사기: DOM 준비 상태 체크 실패:', {
					allElementsExist,
					allElementsConnected,
					hasLayout,
					rightSendForm: !!rightSendForm,
					leftSendForm: !!leftSendForm,
					textarea: !!textarea,
					sendButton: !!sendButton
				});
			}
			
			return isReady;
		},

        // 레이아웃 안정화까지 기다리는 함수 (index.js에서 이동)
		waitForLayoutStabilization: function() {
			const self = this;
			return new Promise((resolve) => {
				let attempts = 0;
				const maxAttempts = 20; // 최대 20번 시도 (10초)
				
				const checkStability = () => {
					attempts++;
					
					if (self.isInputFieldReady()) {
						// 추가로 200ms 더 기다려서 레이아웃이 완전히 안정되도록 함
						setTimeout(() => {
							if (self.isInputFieldReady()) {
								debugLog(`DOM 안정화 완료 (${attempts}번째 시도)`);
								resolve(true);
							} else {
								if (attempts < maxAttempts) {
									setTimeout(checkStability, 500);
								} else {
									debugLog('깡갤 복사기: DOM 안정화 타임아웃');
									resolve(false);
								}
							}
						}, 200);
					} else {
						if (attempts < maxAttempts) {
							setTimeout(checkStability, 500);
						} else {
							debugLog('깡갤 복사기: DOM 안정화 실패 - 타임아웃');
							resolve(false);
						}
					}
				};
				
				checkStability();
			});
		},

        // 통합 아이콘 관리 함수 (index.js에서 이동)
		updateInputFieldIcons: function() {
			try {
				debugLog('아이콘 업데이트 시작');
        
        // 기존 아이콘들 제거
        document.querySelectorAll('.copybot_input_field_icon, .copybot_independent_container').forEach(el => el.remove());

        const rightSendForm = document.querySelector('#rightSendForm');
        const textarea = document.querySelector('#send_textarea');
        const leftSendForm = document.querySelector('#leftSendForm');

        if (leftSendForm) { 
            leftSendForm.style.flexWrap = ''; 
            leftSendForm.style.maxWidth = '';
            Array.from(leftSendForm.children).forEach(child => {
                if (!child.classList.contains('copybot_input_field_icon')) child.style.order = '';
            });
        }
        
        const referenceIcon = document.querySelector('#send_but');
        if (!referenceIcon) {
            console.warn('깡갤 복사기: send_but 요소를 찾을 수 없어 아이콘 업데이트 중단');
            return;
        }

        const iconsByPosition = { right: [], left: [], bottom_right: [], bottom_left: [] };

        // 외부 함수들에 대한 안전한 참조 (콜백 방식으로 해결)
		const executeGhostwrite = callbacks?.executeGhostwrite || (() => console.error('executeGhostwrite 콜백을 찾을 수 없음'));
		const removeTagsFromElement = callbacks?.removeTagsFromElement || (() => console.error('removeTagsFromElement 콜백을 찾을 수 없음'));
		const executeSimpleCommand = callbacks?.executeSimpleCommand || (() => console.error('executeSimpleCommand 콜백을 찾을 수 없음'));
		const triggerCacheBustRegeneration = callbacks?.triggerCacheBustRegeneration || (() => console.error('triggerCacheBustRegeneration 콜백을 찾을 수 없음'));

        const allIconItems = [
            { type: 'ghostwrite', toggleId: 'copybot_ghostwrite_toggle', iconClass: 'fa-user-edit', title: '캐릭터에게 대필 요청', action: executeGhostwrite, group: 20 },
            { type: 'action', toggleId: 'copybot_tag_remove_toggle', iconClass: 'fa-tags', title: '작성중인 메시지의 태그 제거', action: () => removeTagsFromElement('#send_textarea'), group: 20 },
            { type: 'action', toggleId: 'copybot_delete_toggle', iconClass: 'fa-trash', title: '마지막 메시지 삭제', action: () => executeSimpleCommand('/del 1', '마지막 메시지 1개를 삭제했습니다.'), group: 20 },
            { type: 'action', toggleId: 'copybot_delete_regenerate_toggle', iconClass: 'fa-redo', title: '마지막 메시지 삭제 후 재생성', action: () => callbacks?.smartDeleteAndRegenerate?.() || console.error('smartDeleteAndRegenerate 콜백을 찾을 수 없음'), group: 30 }
        ];

		allIconItems.forEach(item => {
            const isToggleOn = $(`#${item.toggleId}`).attr('data-enabled') === 'true';
            const isIconChecked = item.type === 'ghostwrite' ? true : $(`#${item.toggleId.replace('toggle', 'icon')}`).is(':checked');

            if (isToggleOn && isIconChecked) {
                // 각 기능별 개별 위치 설정 읽기
                let targetPosition = 'right'; // 기본값
                
                if (item.type === 'ghostwrite') {
                    // 대필은 기존 라디오 버튼 방식 유지
                    targetPosition = $('input[name="copybot_ghostwrite_position"]:checked').val() || 'right';
                } else {
                    // 편의기능 3종은 각각의 드롭다운에서 위치 읽기
                    const positionSelectId = `#${item.toggleId.replace('_toggle', '_position')}`;
                    targetPosition = $(positionSelectId).val() || 'right';
                }
                
                const icon = document.createElement('div');
                icon.className = `fa-solid ${item.iconClass} copybot_input_field_icon`;
                icon.title = item.title;
                // 매번 최신 테마 스타일 적용
                const currentStyle = window.getComputedStyle(referenceIcon);
                icon.style.fontSize = currentStyle.fontSize;
                icon.style.color = currentStyle.color;
                icon.style.order = item.group;
                icon.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); item.action(); });
                
                iconsByPosition[targetPosition].push(icon);
            }
        });

        for (const position in iconsByPosition) {
            const iconsToAdd = iconsByPosition[position];
            if (iconsToAdd.length === 0) continue;

            switch(position) {
                case 'bottom_left':
                case 'left':
                case 'right':
                    iconsToAdd.forEach(icon => icon.classList.add('interactable'));
                    if (position === 'bottom_left' && leftSendForm) {
                        Array.from(leftSendForm.children).forEach(child => { child.style.order = '10'; });
                        const originalWidth = leftSendForm.getBoundingClientRect().width;
                        if (originalWidth > 0) leftSendForm.style.maxWidth = `${originalWidth}px`;
                        leftSendForm.style.flexWrap = 'wrap';
                        iconsToAdd.forEach(icon => leftSendForm.appendChild(icon));
                    } else if (position === 'left' && leftSendForm) {
                        iconsToAdd.forEach(icon => { icon.style.order = ''; leftSendForm.appendChild(icon); });
                    } else if (position === 'right' && rightSendForm) {
                        const sendButton = rightSendForm.querySelector('#send_but');
                        if (sendButton) iconsToAdd.forEach(icon => { icon.style.order = ''; rightSendForm.insertBefore(icon, sendButton); });
                    }
                    break;
                
                case 'bottom_right':
                    const textareaParent = textarea.closest('#send_form') || textarea.parentElement;
                    if (textareaParent) {
                        // 최신 테마 색상 다시 가져오기
                        const currentStyle = window.getComputedStyle(referenceIcon);
                        const currentThemeColor = currentStyle.color;
                        const { r, g, b } = rgbStringToObj(currentThemeColor);
                        const { h, s } = rgbToHsl(r, g, b);
                        const hoverColor = `hsl(${h}, ${s}%, 35%)`;
                        const activeColor = `hsl(${h}, ${s}%, 25%)`;
                        
                        let iconSize = Math.max(referenceIcon.offsetWidth, referenceIcon.offsetHeight, 32);
                        const minimalOffset = (iconSize * 2) + 8 - 10;
                        const independentContainer = document.createElement('div');
                        independentContainer.className = 'copybot_independent_container';
                        
                        iconsToAdd.forEach(icon => {
                            icon.style.margin = '0 3px';
                            icon.style.transition = 'color 0.2s ease';
                            icon.addEventListener('mouseenter', () => { icon.style.color = hoverColor; });
                            icon.addEventListener('mouseleave', () => { icon.style.color = currentThemeColor; });
                            icon.addEventListener('mousedown', () => { icon.style.color = activeColor; });
                            icon.addEventListener('mouseup', () => { icon.style.color = hoverColor; });
                            independentContainer.appendChild(icon);
                        });
                        
                        textareaParent.style.position = 'relative';
                        independentContainer.style.cssText = `position:absolute!important;top:0!important;right:${minimalOffset}px!important;transform:translateY(calc(-100% - 4px))!important;display:flex!important;gap:6px!important;align-items:center!important;background:rgba(var(--bg-color-rgb),0.8)!important;backdrop-filter:blur(5px)!important;border-radius:6px!important;padding:4px 8px!important;border:1px solid var(--border-color)!important;box-shadow:0 2px 8px rgba(0,0,0,0.15)!important;z-index:1000!important;`;
                        textareaParent.appendChild(independentContainer);
                    }
                    break;
            }
        }
        debugLog('아이콘 업데이트 완료');
    } catch (error) {
        console.error('깡갤 복사기: 입력 필드 아이콘 업데이트 실패', error);
    }
},

        // 안전한 아이콘 업데이트 함수 (DOM 안정화 대기 포함) (index.js에서 이동)
		safeUpdateInputFieldIcons: async function() {
			try {
				debugLog('안전한 아이콘 업데이트 시작...');
				
				// DOM이 안정화될 때까지 기다림
				const isStabilized = await this.waitForLayoutStabilization();
				
				if (!isStabilized) {
					debugLog('깡갤 복사기: DOM 안정화 실패, 아이콘 업데이트 건너뜀');
					return;
				}
				
				debugLog('DOM 안정화 확인됨, 아이콘 업데이트 진행');
				this.updateInputFieldIcons();
				
			} catch (error) {
				console.error('깡갤 복사기: 안전한 아이콘 업데이트 실패', error);
			}
		},

        // 강화된 다중 시점 아이콘 업데이트 스케줄러 (index.js에서 이동)
		scheduleIconUpdates: function() {
			const self = this;
			debugLog('다중 시점 아이콘 업데이트 스케줄링 시작');
			
			// 첫 번째 시도: 즉시 시도 (DOM이 이미 준비되어 있을 수 있음)
			self.safeUpdateInputFieldIcons();
			
			// 추가 시도들: 점진적으로 늘어나는 간격으로 재시도
			const updateTimings = [200, 500, 1000, 2000, 3000]; // 마지막에 3초 추가
			
			updateTimings.forEach((timing, index) => {
				setTimeout(() => {
					debugLog(`${index + 2}번째 아이콘 업데이트 시도 (${timing}ms 후)`);
					self.safeUpdateInputFieldIcons();
				}, timing);
			});

			// 최종 백업 시도: 10초 후 강제 업데이트 (DOM 안정화 대기 없이)
			setTimeout(() => {
				debugLog('최종 백업 아이콘 업데이트 시도');
				if (self.isInputFieldReady()) {
					self.updateInputFieldIcons();
				} else {
					console.warn('깡갤 복사기: 최종 백업 시도에서도 DOM이 준비되지 않음');
				}
			}, 10000);
		}
    };

    // 내부 헬퍼 함수들
    
    // 디버그 로그 함수 (utils 모듈 사용)
    function debugLog(...args) {
        if (utils && utils.debugLog) {
            utils.debugLog(isDebugMode, ...args);
        } else if (isDebugMode) {
            console.log('🐞 깡갤 복사기 [Icons]:', ...args);
        }
    }

    // 색상 변환을 위한 헬퍼 함수들 (utils 모듈 사용)
    function rgbStringToObj(rgbStr) {
        return utils ? 
            utils.rgbStringToObj(rgbStr) :
            { r: 0, g: 0, b: 0, a: 1 };
    }

    function rgbToHsl(r, g, b) {
        return utils ? 
            utils.rgbToHsl(r, g, b) :
            { h: 0, s: 0, l: 0 };
    }

    if (window.copybot_debug_mode) {
        console.log('CopyBotIcons 모듈 로드 완료');
    }
})();