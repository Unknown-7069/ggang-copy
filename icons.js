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
					debugLog('CopyBotIcons - executeGhostwrite 콜백이 없습니다');
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

        // 입력창 아이콘을 보여줄 설정이 하나라도 있는가 (없으면 실리 DOM 을 전혀 건드리지 않기 위한 사전 검사)
		anyIconConfigured: function() {
			try {
				if ($('#copybot_ghostwrite_toggle').attr('data-enabled') === 'true') return true;
				for (const base of ['copybot_tag_remove', 'copybot_delete', 'copybot_delete_regenerate']) {
					if ($(`#${base}_toggle`).attr('data-enabled') === 'true' && $(`#${base}_inputfield`).is(':checked')) return true;
				}
				if ($('#copybot_quickmenu_toggle').attr('data-enabled') === 'true' && $('#copybot_quickmenu_input_icon').is(':checked')) return true;
				if ((window.CopyBotActions?.getEnabledSlots?.() || []).some(slot => slot.inputfield)) return true;
			} catch (e) { /* 무시 */ }
			return false;
		},

        // 통합 아이콘 관리 함수 (index.js에서 이동)
		updateInputFieldIcons: function() {
			try {
				debugLog('아이콘 업데이트 시작');

        // 미사용 시 무영향: 보여줄 아이콘도 없고 이전에 붙인 아이콘도 없으면 실리 DOM·스타일을 전혀 건드리지 않음
        const hadIcons = document.querySelector('.copybot_input_field_icon, .copybot_independent_container') !== null;
        if (!hadIcons && !this.anyIconConfigured()) {
            window.copybot_refreshThemeWatch?.();
            return;
        }

        // 기존 아이콘들 제거
        document.querySelectorAll('.copybot_input_field_icon, .copybot_independent_container').forEach(el => el.remove());

        const rightSendForm = document.querySelector('#rightSendForm');
        const textarea = document.querySelector('#send_textarea');
        const leftSendForm = document.querySelector('#leftSendForm');

        // 우리가 바꿨던 #leftSendForm 인라인 스타일만 되돌림 (한 번도 안 바꿨으면 손대지 않음)
        if (leftSendForm && leftSendForm.dataset.copybotLayout === '1') {
            delete leftSendForm.dataset.copybotLayout;
            leftSendForm.style.flexWrap = '';
            leftSendForm.style.maxWidth = '';
            Array.from(leftSendForm.children).forEach(child => {
                if (!child.classList.contains('copybot_input_field_icon')) child.style.order = '';
            });
        }
        
        const referenceIcon = document.querySelector('#send_but');
        if (!referenceIcon) {
            debugLog('send_but 요소를 찾을 수 없어 아이콘 업데이트 중단');
            return;
        }

        const iconsByPosition = { right: [], left: [], bottom_right: [], bottom_left: [] };

        // 유저 우선순위(설정 '입력필드 아이콘 순서') → 숫자. 작을수록 앞. 커스텀 버튼은 그룹 안에서 슬롯 순서 유지
        const iconOrder = (window.CopyBotUI?.getIconOrder?.() || ['quickmenu', 'ghostwrite', 'tag_remove', 'delete', 'custom', 'delete_regenerate']);
        const priorityOf = (key, sub = 0) => { const i = iconOrder.indexOf(key); return (i === -1 ? iconOrder.length : i) * 10 + sub; };
        const ORDER_KEY_BY_TOGGLE = { copybot_ghostwrite_toggle: 'ghostwrite', copybot_tag_remove_toggle: 'tag_remove', copybot_delete_toggle: 'delete', copybot_delete_regenerate_toggle: 'delete_regenerate' };

        // 외부 함수들에 대한 안전한 참조 (콜백 방식으로 해결)
		const executeGhostwrite = callbacks?.executeGhostwrite || (() => console.error('executeGhostwrite 콜백을 찾을 수 없음'));
		const removeTagsFromElement = callbacks?.removeTagsFromElement || (() => console.error('removeTagsFromElement 콜백을 찾을 수 없음'));
		const executeSimpleCommand = callbacks?.executeSimpleCommand || (() => console.error('executeSimpleCommand 콜백을 찾을 수 없음'));
		const triggerCacheBustRegeneration = callbacks?.triggerCacheBustRegeneration || (() => console.error('triggerCacheBustRegeneration 콜백을 찾을 수 없음'));

        // 저장된 아이콘 또는 기본값 가져오기
        const getIconClass = (pickerId, defaultIcon) => {
            const $picker = $(`#${pickerId}`);
            return $picker.length > 0 ? ($picker.data('icon') || defaultIcon) : defaultIcon;
        };

        // 좆됨방지는 commands.js의 executeSimpleCommand에서 처리됨
        const allIconItems = [
            { type: 'ghostwrite', toggleId: 'copybot_ghostwrite_toggle', iconClass: getIconClass('copybot_ghostwrite_icon_picker', 'fa-user-edit'), title: '캐릭터에게 대필 요청', action: executeGhostwrite, group: 20 },
            { type: 'action', toggleId: 'copybot_tag_remove_toggle', iconClass: getIconClass('copybot_tag_remove_icon_picker', 'fa-tags'), title: '작성중인 메시지의 태그 제거', action: () => removeTagsFromElement('#send_textarea'), group: 20 },
            { type: 'action', toggleId: 'copybot_delete_toggle', iconClass: getIconClass('copybot_delete_icon_picker', 'fa-trash'), title: '마지막 메시지 삭제', action: () => (callbacks?.deleteLastMessage ? callbacks.deleteLastMessage() : executeSimpleCommand('/del 1', '마지막 메시지 1개를 삭제했습니다.')), group: 20 },
            { type: 'action', toggleId: 'copybot_delete_regenerate_toggle', iconClass: getIconClass('copybot_delete_regenerate_icon_picker', 'fa-redo'), title: '마지막 메시지 삭제 후 재생성', action: () => callbacks?.smartDeleteAndRegenerate?.() || console.error('smartDeleteAndRegenerate 콜백을 찾을 수 없음'), group: 30 }
        ];

		allIconItems.forEach(item => {
            const isToggleOn = $(`#${item.toggleId}`).attr('data-enabled') === 'true';
            
            // 편의기능 3종은 toggle ON + inputfield 체크박스 ON일 때만 아이콘 표시
            let shouldShowIcon = false;
            
            if (item.type === 'ghostwrite') {
                // 대필은 toggle ON이면 표시
                shouldShowIcon = isToggleOn;
            } else {
                // 편의기능 3종은 toggle ON + inputfield 체크박스 ON일 때만 표시
                const inputfieldCheckboxId = `#${item.toggleId.replace('_toggle', '_inputfield')}`;
                const isInputfieldChecked = $(inputfieldCheckboxId).is(':checked');
                shouldShowIcon = isToggleOn && isInputfieldChecked;
            }
            
            if (shouldShowIcon) {
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
                icon.dataset.cbPriority = String(priorityOf(ORDER_KEY_BY_TOGGLE[item.toggleId] || 'custom'));
                icon.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); item.action(); });

                iconsByPosition[targetPosition].push(icon);
            }
        });

        // === 커스텀 버튼 슬롯 아이콘 추가 (actions.js 레지스트리 공용) ===
        const customSlots = window.CopyBotActions?.getEnabledSlots?.() || [];
        customSlots.filter(slot => slot.inputfield).forEach(slot => {
            const icon = document.createElement('div');
            icon.className = `fa-solid ${slot.iconClass} copybot_input_field_icon copybot_custom_input_icon`;
            icon.title = slot.label;
            icon.dataset.action = slot.action;
            const currentStyle = window.getComputedStyle(referenceIcon);
            icon.style.fontSize = currentStyle.fontSize;
            icon.style.color = currentStyle.color;
            icon.dataset.cbPriority = String(priorityOf('custom', Math.min(9, slot.index)));
            icon.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.CopyBotActions?.run(slot.action);
            });
            const position = iconsByPosition[slot.position] ? slot.position : 'bottom_left';
            iconsByPosition[position].push(icon);
        });

        // === 퀵메뉴 입력필드 아이콘 추가 ===
        const isQuickMenuEnabled = $('#copybot_quickmenu_toggle').attr('data-enabled') === 'true';
        const isQuickMenuInputIconChecked = $('#copybot_quickmenu_input_icon').is(':checked');
        
        if (isQuickMenuEnabled && isQuickMenuInputIconChecked) {
            const quickMenuPosition = $('#copybot_quickmenu_icon_position').val() || 'bottom_left';
            const toggleQuickMenu = callbacks?.toggleQuickMenu || (() => console.error('toggleQuickMenu 콜백을 찾을 수 없음'));
            
            const quickMenuIconClass = getIconClass('copybot_quickmenu_input_icon_picker', 'fa-copy');
			const quickMenuIcon = document.createElement('div');
			quickMenuIcon.className = `fa-solid ${quickMenuIconClass} copybot_input_field_icon`;
            quickMenuIcon.title = '퀵메뉴 열기';
            quickMenuIcon.id = 'copybot_quickmenu_input_icon_btn';
            
            // 테마 스타일 적용
            const currentStyle = window.getComputedStyle(referenceIcon);
            quickMenuIcon.style.fontSize = currentStyle.fontSize;
            quickMenuIcon.style.color = currentStyle.color;
            quickMenuIcon.dataset.cbPriority = String(priorityOf('quickmenu'));
            
            quickMenuIcon.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleQuickMenu(e.currentTarget);
            });
            
            iconsByPosition[quickMenuPosition].push(quickMenuIcon);
            debugLog('퀵메뉴 입력필드 아이콘 추가됨, 위치:', quickMenuPosition);
        }

        for (const position in iconsByPosition) {
            const iconsToAdd = iconsByPosition[position];
            if (iconsToAdd.length === 0) continue;
            // 유저 우선순위대로 정렬 (DOM 삽입 순서 = 표시 순서; 좌하단은 flex order 로도 고정)
            iconsToAdd.sort((a, b) => Number(a.dataset.cbPriority || 0) - Number(b.dataset.cbPriority || 0));

            switch(position) {
                case 'bottom_left':
                case 'left':
                case 'right':
                    iconsToAdd.forEach(icon => icon.classList.add('interactable'));
                    if (position === 'bottom_left' && leftSendForm) {
                        leftSendForm.dataset.copybotLayout = '1';
                        Array.from(leftSendForm.children).forEach(child => { child.style.order = '10'; });
                        const originalWidth = leftSendForm.getBoundingClientRect().width;
                        if (originalWidth > 0) leftSendForm.style.maxWidth = `${originalWidth}px`;
                        leftSendForm.style.flexWrap = 'wrap';
                        iconsToAdd.forEach(icon => { icon.style.order = String(11 + Number(icon.dataset.cbPriority || 0)); leftSendForm.appendChild(icon); });
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
        window.copybot_refreshThemeWatch?.();
        debugLog('아이콘 업데이트 완료');
    } catch (error) {
        console.error('깡갤 복사기: 입력 필드 아이콘 업데이트 실패', error);
    }
},

        // 안전한 아이콘 업데이트 함수 (DOM 안정화 대기 포함) (index.js에서 이동)
		safeUpdateInputFieldIcons: async function() {
			try {
				debugLog('안전한 아이콘 업데이트 시작...');
				// 보여줄 아이콘도, 지울 아이콘도 없으면 DOM 안정화 대기(타이머)조차 돌리지 않음
				if (!document.querySelector('.copybot_input_field_icon, .copybot_independent_container') && !this.anyIconConfigured()) {
					return;
				}

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
			if (!self.anyIconConfigured()) {
				debugLog('입력창 아이콘 설정 없음 — 업데이트 스케줄 생략');
				return;
			}
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
					debugLog('최종 백업 시도에서도 DOM이 준비되지 않음');
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