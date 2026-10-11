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
			// 필수는 입력창(#send_textarea)·전송 버튼(#send_but) 둘뿐. #leftSendForm/#rightSendForm 은 테마에 따라 없을 수 있어 선택(없으면 삽입 폴백)
			const textarea = document.querySelector('#send_textarea');
			const sendButton = document.querySelector('#send_but');

			const allElementsExist = !!(textarea && sendButton);
			const allElementsConnected = !!(textarea && textarea.isConnected && sendButton && sendButton.isConnected);

			// 입력창이 실제로 화면에 렌더링되었는지 확인
			const hasLayout = !!(textarea && textarea.offsetParent);

			const isReady = allElementsExist && allElementsConnected && hasLayout;

			if (!isReady) {
				debugLog('깡갤 복사기: DOM 준비 상태 체크 실패:', {
					allElementsExist,
					allElementsConnected,
					hasLayout,
					rightSendForm: !!document.querySelector('#rightSendForm'),
					leftSendForm: !!document.querySelector('#leftSendForm'),
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
        const OURS = '.copybot_input_field_icon, .copybot_independent_container, .copybot_bl_break';
        const hadIcons = document.querySelector(`${OURS}, [data-copybot-pos="1"], [data-copybot-layout="1"]`) !== null;
        if (!hadIcons && !this.anyIconConfigured()) {
            window.copybot_refreshThemeWatch?.();
            return;
        }

        // 기존 아이콘들 제거 (좌하단 줄바꿈 상자 포함)
        document.querySelectorAll(OURS).forEach(el => el.remove());

        const textarea = document.querySelector('#send_textarea');
        const leftSendForm = document.querySelector('#leftSendForm');

        // 우리가 바꿨던 인라인 스타일만 되돌림 (한 번도 안 바꿨으면 손대지 않음). 실리 자식 요소의 스타일은 애초에 건드리지 않는다
        document.querySelectorAll('[data-copybot-layout="1"]').forEach(el => {
            if (!('copybotFlexWrap' in el.dataset)) {   // 구버전 코드가 같은 페이지에서 남긴 흔적(핫리로드): 폭 고정·자식 order 를 한 번 되돌림
                el.style.maxWidth = '';
                Array.from(el.children).forEach(child => { if (child.style.order === '10') child.style.order = ''; });
            }
            el.style.flexWrap = el.dataset.copybotFlexWrap || '';
            if ('copybotMaxWidth' in el.dataset) el.style.maxWidth = el.dataset.copybotMaxWidth || '';
            delete el.dataset.copybotLayout;
            delete el.dataset.copybotFlexWrap;
            delete el.dataset.copybotMaxWidth;
        });
        document.querySelectorAll('[data-copybot-pos="1"]').forEach(el => {
            el.style.position = '';
            delete el.dataset.copybotPos;
        });

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
		// 태그 제거·삭제·재생성은 actions.js 레지스트리 한 곳으로 (설정 패널·퀵메뉴·플로팅·커스텀 버튼과 같은 구현 — 창구만 다르고 동작은 하나)
		const runRegistry = (id) => {
			if (window.CopyBotActions?.run) return window.CopyBotActions.run(id);
			console.error('깡갤 복사기: 동작 레지스트리(actions.js)를 찾을 수 없음');
		};

        // 저장된 아이콘 또는 기본값 가져오기
        const getIconClass = (pickerId, defaultIcon) => {
            const $picker = $(`#${pickerId}`);
            return $picker.length > 0 ? ($picker.data('icon') || defaultIcon) : defaultIcon;
        };

        // 좆됨방지는 commands.js의 executeSimpleCommand에서 처리됨
        const allIconItems = [
            { type: 'ghostwrite', toggleId: 'copybot_ghostwrite_toggle', iconClass: getIconClass('copybot_ghostwrite_icon_picker', 'fa-user-edit'), title: '캐릭터에게 대필 요청', action: executeGhostwrite, group: 20 },
            { type: 'action', toggleId: 'copybot_tag_remove_toggle', iconClass: getIconClass('copybot_tag_remove_icon_picker', 'fa-tags'), title: '작성중인 메시지의 태그 제거', action: () => runRegistry('remove_tags'), group: 20 },
            { type: 'action', toggleId: 'copybot_delete_toggle', iconClass: getIconClass('copybot_delete_icon_picker', 'fa-trash'), title: '마지막 메시지 삭제', action: () => runRegistry('delete_last'), group: 20 },
            { type: 'action', toggleId: 'copybot_delete_regenerate_toggle', iconClass: getIconClass('copybot_delete_regenerate_icon_picker', 'fa-redo'), title: '마지막 메시지 삭제 후 재생성', action: () => runRegistry('delete_regen'), group: 30 }
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
                window.CopyBotActions?.run(slot.action, slot.index, e.currentTarget);
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

        // #leftSendForm 이 없는 테마: 좌측·좌하단 아이콘을 우측(전송 버튼 앞) 그룹으로 합친다
        if (!leftSendForm && (iconsByPosition.left.length || iconsByPosition.bottom_left.length)) {
            debugLog('#leftSendForm 없음 — 좌측/좌하단 아이콘을 우측 그룹으로 합침');
            iconsByPosition.right.push(...iconsByPosition.left, ...iconsByPosition.bottom_left);
            iconsByPosition.left = [];
            iconsByPosition.bottom_left = [];
        }

        for (const position in iconsByPosition) {
            const iconsToAdd = iconsByPosition[position];
            if (iconsToAdd.length === 0) continue;
            // 유저 우선순위대로 정렬 (DOM 삽입 순서 = 표시 순서)
            iconsToAdd.sort((a, b) => Number(a.dataset.cbPriority || 0) - Number(b.dataset.cbPriority || 0));

            switch(position) {
                case 'bottom_left':
                case 'left':
                case 'right':
                    iconsToAdd.forEach(icon => icon.classList.add('interactable'));
                    if (position === 'bottom_left') {
                        // 실리 자식 요소는 건드리지 않는다: 줄바꿈 허용 + "줄바꿈용 빈 상자" 뒤에 아이콘을 붙여 아랫줄로 내림
                        // (order 는 우리 요소에만 — 테마가 실리 버튼에 order 를 줘도 우리 줄이 맨 뒤에 오게)
                        leftSendForm.dataset.copybotLayout = '1';
                        leftSendForm.dataset.copybotFlexWrap = leftSendForm.style.flexWrap || '';
                        // 왼쪽 상자의 폭은 아이콘을 넣기 "전" 폭으로 묶어 둔다 → 아이콘이 많아도 상자가 넓어져 입력창을 밀지 않고 아랫줄에서 접힘 (폰에서 검증된 예전 겉모습 유지)
                        const widthBefore = leftSendForm.getBoundingClientRect().width;
                        if (widthBefore > 0) {
                            leftSendForm.dataset.copybotMaxWidth = leftSendForm.style.maxWidth || '';
                            leftSendForm.style.maxWidth = `${Math.ceil(widthBefore)}px`;
                        }
                        leftSendForm.style.flexWrap = 'wrap';
                        const lineBreak = document.createElement('div');
                        lineBreak.className = 'copybot_bl_break';
                        lineBreak.setAttribute('aria-hidden', 'true');
                        lineBreak.style.cssText = 'flex-basis:100%;width:100%;height:0;min-height:0;margin:0;padding:0;border:0;order:9998;pointer-events:none;';
                        leftSendForm.appendChild(lineBreak);
                        iconsToAdd.forEach(icon => { icon.style.order = '9999'; leftSendForm.appendChild(icon); });
                    } else if (position === 'left') {
                        iconsToAdd.forEach(icon => { icon.style.order = ''; leftSendForm.appendChild(icon); });
                    } else if (referenceIcon.parentElement) {
                        // right: #rightSendForm 유무와 상관없이 "전송 버튼 바로 앞"에 넣는다 (전송 버튼이 다른 상자로 옮겨진 테마 대응)
                        iconsToAdd.forEach(icon => { icon.style.order = ''; referenceIcon.parentElement.insertBefore(icon, referenceIcon); });
                    }
                    break;

                case 'bottom_right':
                    if (!textarea) {
                        debugLog('#send_textarea 없음 — 우하단 아이콘 그룹 건너뜀');
                        break;
                    }
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
                        
                        // 기준 상자가 원래 static 일 때만 relative 로 바꾸고 표식을 남김 → 다음 갱신(정리 블록)에서 원복
                        if (window.getComputedStyle(textareaParent).position === 'static') {
                            textareaParent.style.position = 'relative';
                            textareaParent.dataset.copybotPos = '1';
                        }
                        independentContainer.style.cssText = `position:absolute!important;top:0!important;right:${minimalOffset}px!important;transform:translateY(calc(-100% - 4px))!important;display:flex!important;gap:6px!important;align-items:center!important;background:var(--SmartThemeBlurTintColor, rgba(40,40,40,.85))!important;border-radius:6px!important;padding:4px 8px!important;border:1px solid var(--SmartThemeBorderColor, rgba(128,128,128,.4))!important;box-shadow:0 2px 8px rgba(0,0,0,0.15)!important;z-index:1000!important;`;
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
		// 반환: true = 갱신했거나 할 일이 없음 / false = 이번엔 못 함(진행 중인 갱신에 합류했거나 DOM 미준비)
		safeUpdateInputFieldIcons: async function() {
			// 이미 한 번 돌고 있으면 대기 체인을 또 만들지 않고 "끝나면 한 번 더" 표시만 남긴다 (설정 연타 시 타이머·재그리기 중복 방지)
			if (iconUpdateInFlight) {
				iconUpdateDirty = true;
				return false;
			}
			iconUpdateInFlight = true;
			let updated = false;
			try {
				do {
					iconUpdateDirty = false;
					debugLog('안전한 아이콘 업데이트 시작...');
					// 보여줄 아이콘도, 지울 아이콘도 없으면 DOM 안정화 대기(타이머)조차 돌리지 않음
					if (!document.querySelector('.copybot_input_field_icon, .copybot_independent_container, .copybot_bl_break') && !this.anyIconConfigured()) {
						updated = true;
						continue;
					}

					// DOM이 안정화될 때까지 기다림
					const isStabilized = await this.waitForLayoutStabilization();

					if (!isStabilized) {
						debugLog('깡갤 복사기: DOM 안정화 실패, 아이콘 업데이트 건너뜀');
						updated = false;
						continue;
					}

					debugLog('DOM 안정화 확인됨, 아이콘 업데이트 진행');
					this.updateInputFieldIcons();
					updated = true;
				} while (iconUpdateDirty);
			} catch (error) {
				console.error('깡갤 복사기: 안전한 아이콘 업데이트 실패', error);
				updated = false;
			} finally {
				iconUpdateInFlight = false;
				iconUpdateDirty = false;
			}
			return updated;
		},

        // 다중 시점 아이콘 업데이트 스케줄러: 0 / 0.5 / 3초에 시도하고, 한 번 성공하면 남은 시도는 취소. 10초 뒤 최종 폴백 1회
		scheduleIconUpdates: function() {
			const self = this;
			if (!self.anyIconConfigured()) {
				debugLog('입력창 아이콘 설정 없음 — 업데이트 스케줄 생략');
				return;
			}
			debugLog('다중 시점 아이콘 업데이트 스케줄링 시작');
			clearIconTimers();   // 이전 스케줄이 남아 있으면 겹치지 않게 정리

			[0, 500, 3000].forEach((timing, index) => {
				iconUpdateTimers.push(setTimeout(async () => {
					debugLog(`${index + 1}번째 아이콘 업데이트 시도 (${timing}ms 후)`);
					const ok = await self.safeUpdateInputFieldIcons();
					if (ok) clearIconTimers();   // 첫 성공 → 남은 시도·폴백 취소
				}, timing));
			});

			// 최종 폴백: 10초 후 (DOM 안정화 대기 없이) 한 번
			iconUpdateTimers.push(setTimeout(() => {
				iconUpdateTimers = [];
				debugLog('최종 백업 아이콘 업데이트 시도');
				if (self.isInputFieldReady()) {
					self.updateInputFieldIcons();
				} else {
					debugLog('최종 백업 시도에서도 DOM이 준비되지 않음');
				}
			}, 10000));
		}
    };

    // 내부 헬퍼 함수들

    // 아이콘 갱신 중복 방지 상태
    let iconUpdateInFlight = false;   // safeUpdateInputFieldIcons 가 돌고 있는가
    let iconUpdateDirty = false;      // 도는 동안 또 요청이 왔는가 (끝나면 한 번 더)
    let iconUpdateTimers = [];        // scheduleIconUpdates 가 건 타이머 id
    function clearIconTimers() {
        iconUpdateTimers.forEach(id => clearTimeout(id));
        iconUpdateTimers = [];
    }

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