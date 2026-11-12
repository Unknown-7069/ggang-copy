// 깡갤 복사기 아이콘 관리 모듈
// DOM 준비 상태 확인, 아이콘 업데이트, 레이아웃 안정화 처리
(function() {
    'use strict';

    // 내부 변수들
	let utils = null;
	let isDebugMode = false;
	let callbacks = null;

    window.CopyBotIcons?.disposeExecutionWatch?.(); // 핫리로드 때 이전 구독 해제
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
				if (this.isCompatIconsEnabled()) return true;   // 호환 옵션만 켜져 있어도 갱신은 돌아야 한다(다른 확장 아이콘을 재서 맞춤)
			} catch (e) { /* 무시 */ }
			return false;
		},

        // ── 입력필드 아이콘 호환 (기타 탭, 기본 OFF, 2026-10-26 유저 결정) ──
        // 다른 확장이 입력창(#send_textarea) 바로 옆 형제로 끼운 아이콘(예: Direction Manager Lite)은 세로 위치를 스스로 정하지 않고 실리의 가운데 정렬을 받는다.
        // 우리 아랫줄 때문에 입력 줄이 두 줄이 되면 그 아이콘만 한가운데 떠 보이므로, 전송 버튼(#send_but)을 재서 같은 줄·같은 크기·같은 배색으로 맞춘다.
        // 상대 코드·DOM 구조는 건드리지 않고 표식(data-copybot-compat-icon)과 CSS 변수만 얹는다(style.css). 끄면 표식·변수를 떼어 원래대로.
        // 감시 없음: 아이콘 갱신(설정 변경·테마 변경·채팅 전환)이 돌 때 1회 다시 잰다.
        isCompatIconsEnabled: function() {
            try { return $('#copybot_compat_input_icons_toggle').attr('data-enabled') === 'true'; } catch (e) { return false; }
        },
        clearCompatIcons: function() {
            ++compatSeq;
            compatPending = false;
            compatIdleLayout = null;
            try {
                const targets=[...document.querySelectorAll('[data-copybot-compat-icon]')];
                targets.forEach(el => unmarkCompat(el));
                // 호환을 끌 때 상대 테마의 복귀 애니메이션은 그대로 둔다.
                // 그 전환이 끝난 뒤 우리 별도 묶음의 위치만 한 번 다시 확인한다.
                if (targets.length && this.anyIconConfigured()) {
                    clearTimeout(compatReleaseTimer);
                    const settleMs=Math.max(0,...targets.map(transitionMs));
                    compatReleaseTimer=setTimeout(()=>{
                        compatReleaseTimer=0;
                        if (!this.isCompatIconsEnabled() && this.anyIconConfigured()) scheduleLayoutCheck();
                    },settleMs+50);
                }
            } catch (e) { /* 무시 */ }
        },
        refreshCompatIcons: function() {
            try {
                compatPending = false;
                if (!this.isCompatIconsEnabled()) { this.clearCompatIcons(); return; }
                clearTimeout(compatReleaseTimer);compatReleaseTimer=0;
                if (!usableInputViewport()) { ++compatSeq; deferredLayoutUpdate = true; return; }
                const textarea = document.querySelector('#send_textarea');
                const idleReference = document.getElementById('send_but');
                const idleRect = idleReference?.getBoundingClientRect();
                const idleStillAligned = executionState() === '00' && idleRect?.width > 0 &&
                    compatIdleLayout?.appearance === compatReferenceAppearance(idleReference) &&
                    compatIdleLayout.targets.every(el=>{const r=el.getBoundingClientRect();return Math.abs(r.top-idleRect.top)<=1.5&&Math.abs(r.width-idleRect.width)<=1.5&&Math.abs(r.height-idleRect.height)<=1.5});
                // 이미 맞춰 둔 평상시 배치는 실행 상태만 바뀌었다고 다시 맞추지 않는다.
                // 작은 생성 정지 버튼을 새 기준으로 삼으면 깃털 등이 작아지고 옆으로 밀린다.
                if ((executionState() !== '00' || idleStillAligned) && compatIdleLayout?.row === textarea?.parentElement &&
                    compatIdleLayout.signature === compatLayoutSignature() &&
                    compatIdleLayout.targets.every(el => el.isConnected && el.dataset.copybotCompatIcon === '1')) {
                    ++compatSeq; // 실행 직전에 예약된 재측정도 현재 배치를 덮지 않게 한다.
                    scheduleLayoutCheck();
                    return;
                }
                // 평상시 기준이 없는 경우에만 보이는 제어 버튼으로 초기 정렬한다.
                const dockSend=scriptDock&&document.getElementById('send_but');
                const dockReference=scriptDock?.placeholder||(dockSend?.getBoundingClientRect().width>0?dockSend:null);
                const ref = dockReference || ['send_but','mes_stop','stscript_pause','stscript_continue','stscript_stop']
                    .map(id => document.getElementById(id)).find(el => el && shown(el));
                const row = textarea?.parentElement;
                if (!row || typeof getComputedStyle !== 'function') return;
                if (!ref) { this.clearCompatIcons(); return; }
                const refRect = ref.getBoundingClientRect();
                if (refRect.width === 0 || refRect.height === 0) { this.clearCompatIcons(); return; } // 기준을 잃으면 우리 보정을 해제한다.
                const targets = [];
                const rowRect = row.getBoundingClientRect();
                Array.from(row.children).forEach(el => {
                    if (el === textarea || el.contains(ref)) return;                              // 입력창·전송 버튼(상자)
                    if (el.id === 'leftSendForm' || el.id === 'rightSendForm') return;           // 실리 버튼 상자
                    if (el.matches('.stscript_btn,#send_but,#mes_stop,#mes_impersonate,#mes_continue')) return;
                    if (/copybot/i.test(`${el.id || ''} ${typeof el.className === 'string' ? el.className : ''}`)) return;   // 우리 요소
                    if (/^(textarea|input|select|script|style|template)$/i.test(el.tagName)) return;
                    const cs = getComputedStyle(el);
                    if (cs.display === 'none' || /absolute|fixed|sticky/.test(cs.position)) return;   // 떠 있는 팝업 등은 대상 아님
                    const r = el.getBoundingClientRect();
                    if (r.width === 0 || r.height === 0) return;
                    // 아이콘이 아닌 큰 요소는 제외. 단 높이가 입력 줄과 같으면 세로 배치 테마(Azure·Dark V 등)가 늘려 놓은(stretch) 것이라 높이는 보지 않는다(2026-10-26 폰 확인)
                    const stretched = Math.abs(r.height - rowRect.height) <= 1;
                    if (r.width > refRect.width * 3 || (!stretched && r.height > refRect.height * 3)) return;
                    targets.push(el);
                });
                document.querySelectorAll('[data-copybot-compat-icon]').forEach(el => { if (!targets.includes(el)) unmarkCompat(el); });   // 대상이 아니게 된 것 정리
                if (!targets.length) return;
                compatPending = true;
                const rs = getComputedStyle(ref);
                // 반올림 금지: 전송 버튼이 28.5px 같은 소수 크기면 올림한 만큼 입력 줄이 1px 자란다(2026-10-26 폰 확인)
                const px = (n) => `${Math.round(n * 1000) / 1000}px`;
                const border = (rs.borderTopStyle && rs.borderTopStyle !== 'none') ? `${rs.borderTopWidth} ${rs.borderTopStyle} ${rs.borderTopColor}` : '0 none transparent';
                let referenceMargin = rs.margin || '0px';
                try {
                    // flex의 auto 여백은 현재 남은 공간만큼 px로 읽힌다. 그 숫자를
                    // 다른 부모의 아이콘에 고정하면 다음 정렬마다 줄 높이가 달라진다.
                    const typed = ref.computedStyleMap?.();
                    if (typed) referenceMargin = ['top','right','bottom','left'].map(side =>
                        String(typed.get(`margin-${side}`)) === 'auto' ? 'auto' : rs.getPropertyValue(`margin-${side}`)).join(' ');
                } catch (e) { /* Typed OM 미지원이면 기존 계산값을 유지한다. */ }
                const vars = {
                    '--copybot-compat-w': px(refRect.width),
                    '--copybot-compat-h': px(refRect.height),
                    '--copybot-compat-m': referenceMargin,
                    '--copybot-compat-pad': rs.padding || '0px',
                    '--copybot-compat-fs': rs.fontSize || 'inherit',
                    '--copybot-compat-color': rs.color || 'inherit',
                    '--copybot-compat-bg': rs.backgroundColor || 'transparent',
                    '--copybot-compat-border': border,
                    '--copybot-compat-radius': rs.borderRadius || '0',
                    '--copybot-compat-opacity': (scriptDock&&ref===dockSend?scriptReferenceSizes.get(ref)?.opacity:null) || rs.opacity || '1',
                    '--copybot-compat-filter': rs.filter || 'none'
                };
                targets.forEach(el => {
                    el.dataset.copybotCompatIcon = '1';
                    Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
                });
                // 세로 줄 맞추기는 여백이 아니라 "지금 실제로 어긋난 만큼" translateY 로 옮긴다(상태 기준, 테마 무관).
                // 테마가 입력 줄 자식의 margin 을 0 으로 고정하거나 정렬을 flex-end 로 잡아도(2026-10-26 폰에서 둘 다 있었음) 전송 버튼과의 차이를 잰 값은 그대로 유효하고,
                // 둘 다 같은 줄 안에서 같은 규칙으로 정렬되므로 입력창이 길어져 줄이 커져도 그 차이는 변하지 않는다(여러 줄에서도 전송 버튼과 같이 움직임).
                // 우리 규칙은 transition 을 끄지만 테마가 `.interactable { transition: .3s !important }` 처럼 강제하면 크기·위치가 그 시간 동안 변하는 중이라
                // (2026-10-26 폰 확인) 대상의 계산된 전환 시간을 읽어 0 이면 바로, 아니면 그만큼 지난 뒤 1회 타이머로 잰다(감시 아님: 적용당 최대 2번, 끝나면 없음).
                const seq = ++compatSeq;
                const settleMs = Math.max(0, ...targets.map(el => transitionMs(el)));
                const later = (fn) => { if (settleMs > 0) setTimeout(() => { if (seq === compatSeq) fn(); }, settleMs + 50); else fn(); };
                const finishCheck = () => {
                    if (!usableInputViewport()) { compatPending = false; deferredLayoutUpdate = true; return; }
                    // 1회 자가 검사: 전송 버튼과 같은 줄이 됐는지. 못 버티면(테마가 transform 까지 고정하는 등) 그 요소는 원래대로 둔다(물러남).
                    // 입력 줄 높이는 보지 않는다 — translateY 는 배치에 영향이 없고, 그 사이 유저가 글을 쳐서 입력창이 커진 것을 우리 탓으로 오판했었다(2026-10-26).
                    if (!ref.isConnected || !row.isConnected) { compatPending = false; return; }
                    const refTop2 = ref.getBoundingClientRect().top;
                    let kept = 0;
                    targets.forEach(el => {
                        if (!el.isConnected || el.dataset.copybotCompatIcon !== '1') return;
                        const off = Math.abs(refTop2 - el.getBoundingClientRect().top);
                        if (off > 1.5) { debugLog('입력필드 아이콘 호환: 자가 검사 실패 → 그 요소는 원래대로', el.className, { off }); unmarkCompat(el); }
                        else kept++;
                    });
                    compatPending = false;
                    if (executionState() === '00') compatIdleLayout = kept ? {
                        row, signature: compatLayoutSignature(), appearance: compatReferenceAppearance(ref),
                        targets: targets.filter(el => el.isConnected && el.dataset.copybotCompatIcon === '1')
                    } : null;
                    scheduleLayoutCheck();
                    if (!kept) return;
                    window.copybot_refreshThemeWatch?.();   // 표식이 생겼으니 테마(body class) 변경 때 다시 재도록
                    debugLog('입력필드 아이콘 호환 적용', kept, vars, settleMs ? `전환 ${settleMs}ms 대기` : '');
                };
                const measureShift = () => {
                    if (!usableInputViewport()) { compatPending = false; deferredLayoutUpdate = true; return; }
                    if (!ref.isConnected) { compatPending = false; return; }
                    const refTop = ref.getBoundingClientRect().top;
                    targets.forEach(el => {
                        if (!el.isConnected || el.dataset.copybotCompatIcon !== '1') return;
                        const previousShift = parseFloat(el.style.getPropertyValue('--copybot-compat-dy')) || 0;
                        el.style.setProperty('--copybot-compat-dy', px(previousShift + refTop - el.getBoundingClientRect().top));
                    });
                    later(finishCheck);
                };
                later(measureShift);
            } catch (error) {
                compatPending = false;
                debugLog('입력필드 아이콘 호환 적용 실패 — 그대로 둠', error);
            }
        },

        // 통합 아이콘 관리 함수 (index.js에서 이동)
		updateInputFieldIcons: function() {
			try {
				debugLog('아이콘 업데이트 시작');

        // 미사용 시 무영향: 보여줄 아이콘도 없고 이전에 붙인 아이콘도 없으면 실리 DOM·스타일을 전혀 건드리지 않음
        const OURS = '.copybot_input_field_icon, .copybot_independent_container, .copybot_overflow_container, .copybot_bl_break, .copybot_rb_spacer';
        const hadIcons = document.querySelector(`${OURS}, [data-copybot-pos="1"], [data-copybot-layout="1"], [data-copybot-break], [data-copybot-compat-icon]`) !== null;
        if (!hadIcons && !this.anyIconConfigured()) {
            this.disposeExecutionWatch();
            window.copybot_refreshThemeWatch?.();
            return;
        }
        // Android가 화면 전환 중 1×1을 보고할 때 정상 배치를 실패로 판정하지 않는다.
        // 기능 OFF의 원복은 화면 크기와 무관하게 진행한다.
        if (this.anyIconConfigured() && !usableInputViewport()) {
            this.refreshExecutionWatch();
            deferredLayoutUpdate = true;
            return;
        }
        deferredLayoutUpdate = false;

        const renderSignature = inputRenderSignature();
        if (executionState() !== '00' && renderSignature && renderedInput?.signature === renderSignature &&
            renderedInput.host === document.querySelector('#send_form') && renderedInput.icons.length &&
            renderedInput.icons.every(el=>el.isConnected) &&
            renderedInput.icons.length === document.querySelectorAll('.copybot_input_field_icon').length) {
            // 실행 상태만 바뀐 중복 갱신은 정상 아이콘을 없앴다 다시 만들지 않는다.
            // 설정·테마·크기가 실제 바뀐 갱신은 아래의 정규 재구성을 그대로 수행한다.
            this.refreshExecutionWatch(); this.refreshCompatIcons(); this.verifyInputLayout();
            return;
        }

        restoreExecutionWidths();
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
            delete el.dataset.copybotBreak;
            delete el.dataset.copybotSpacer;
            delete el.dataset.copybotOverflow;
            delete el.dataset.copybotFallback;
        });
        document.querySelectorAll('[data-copybot-break]').forEach(el => { delete el.dataset.copybotBreak; });
        document.querySelectorAll('[data-copybot-spacer]').forEach(el => { delete el.dataset.copybotSpacer; });
        document.querySelectorAll('[data-copybot-pos="1"]').forEach(el => {
            el.style.position = '';
            delete el.dataset.copybotPos;
        });

        const referenceIcon = document.querySelector('#send_but');
        if (!referenceIcon) {
            debugLog('send_but 요소를 찾을 수 없어 아이콘 업데이트 중단');
            return;
        }

        const inputRow = textarea?.closest('#nonQRFormItems');
        inputBaseline = inputRow ? {row: inputRow, height: inputRow.getBoundingClientRect().height} : null;

        // 위치 값: left(실리 왼쪽 버튼 옆) / right(전송 버튼 앞) / bottom_left(왼쪽 상자 아랫줄) / right_bottom(전송 버튼 상자 아랫줄, 2026-10-25 추가)
        // / bottom_right(= 설정의 "우상단": 입력창 위에 떠 있는 상자. 이름은 예전 값이라 저장본 호환 때문에 그대로 둔다)
        const iconsByPosition = { right: [], left: [], bottom_right: [], bottom_left: [], right_bottom: [] };

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

                (iconsByPosition[targetPosition] || iconsByPosition.right).push(icon);   // 모르는 저장값이면 기본(우측)
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
            
            (iconsByPosition[quickMenuPosition] || iconsByPosition.bottom_left).push(quickMenuIcon);
            debugLog('퀵메뉴 입력필드 아이콘 추가됨, 위치:', quickMenuPosition);
        }

        // #leftSendForm 이 없는 테마: 좌측·좌하단 아이콘을 우측(전송 버튼 앞) 그룹으로 합친다
        if (!leftSendForm && (iconsByPosition.left.length || iconsByPosition.bottom_left.length)) {
            debugLog('#leftSendForm 없음 — 좌측/좌하단 아이콘을 우측 그룹으로 합침');
            iconsByPosition.right.push(...iconsByPosition.left, ...iconsByPosition.bottom_left);
            iconsByPosition.left = [];
            iconsByPosition.bottom_left = [];
        }
        // 우하단 = 전송 버튼이 든 상자(보통 #rightSendForm)의 아랫줄. 그 상자가 입력창까지 품고 있으면(전송 버튼이 #send_form 바로 아래로 옮겨진 테마)
        // 줄바꿈이 입력창을 밀어내므로 그때는 우측(전송 버튼 앞) 그룹으로 합친다
        const rightSendForm = (referenceIcon.parentElement && !(textarea && referenceIcon.parentElement.contains(textarea))) ? referenceIcon.parentElement : null;
        if (!rightSendForm && iconsByPosition.right_bottom.length) {
            debugLog('전송 버튼 상자를 따로 못 찾음 — 우하단 아이콘을 우측 그룹으로 합침');
            iconsByPosition.right.push(...iconsByPosition.right_bottom);
            iconsByPosition.right_bottom = [];
        }

        for (const position in iconsByPosition) {
            const iconsToAdd = iconsByPosition[position];
            if (iconsToAdd.length === 0) continue;
            // 유저 우선순위대로 정렬 (DOM 삽입 순서 = 표시 순서)
            iconsToAdd.sort((a, b) => Number(a.dataset.cbPriority || 0) - Number(b.dataset.cbPriority || 0));
            iconsToAdd.forEach(icon => { icon.dataset.copybotInputPosition = position; });

            switch(position) {
                case 'bottom_left':
                case 'right_bottom':
                case 'left':
                case 'right':
                    iconsToAdd.forEach(icon => icon.classList.add('interactable'));
                    if (position === 'bottom_left' || position === 'right_bottom') {
                        // 좌하단 = 왼쪽 상자(#leftSendForm) 아랫줄, 우하단 = 전송 버튼 상자(#rightSendForm) 아랫줄. 방법은 같다.
                        const form = position === 'bottom_left' ? leftSendForm : rightSendForm;
                        // 실리 자식 요소는 건드리지 않는다: 줄바꿈 허용 + "줄바꿈용 빈 상자" 뒤에 아이콘을 붙여 아랫줄로 내림
                        // (order 는 우리 요소에만 — 테마가 실리 버튼에 order 를 줘도 우리 줄이 맨 뒤에 오게)
                        // 같은 상자가 두 위치(좌하단·우하단)로 잡히는 테마면 상자 준비는 한 번만 (원복값을 'wrap' 으로 덮지 않게)
                        if (form.dataset.copybotLayout !== '1') {
                            form.dataset.copybotLayout = '1';
                            form.dataset.copybotFlexWrap = form.style.flexWrap || '';
                            // 테마가 원래부터 상자를 넘치게 그리는 경우(Azure 등: 36px 버튼을 33px 상자에)가 있어, 자가 검사의 "잘림"은 이 기준선보다 더 넘칠 때만 센다
                            form.dataset.copybotOverflow = `${Math.max(0, form.scrollWidth - form.clientWidth)}x${Math.max(0, form.scrollHeight - form.clientHeight)}`;
                            // 상자의 폭은 아이콘을 넣기 "전" 폭으로 묶어 둔다 → 아이콘이 많아도 상자가 넓어져 입력창을 밀지 않고 아랫줄에서 접힘 (폰에서 검증된 예전 겉모습 유지)
                            // 전송 버튼이 작은 정지 버튼으로 바뀐 동안에도 우리 줄의 기준 폭은 유지한다.
                            // 테마가 명시한 전송 버튼 폭을 읽을 수 없으면 아래 실행 시 폭 양보 경로를 쓴다.
                            const replacementDelta = generationReplacementDelta(form, referenceIcon);
                            const widthBefore = form.getBoundingClientRect().width + (replacementDelta || 0);
                            if (widthBefore > 0) {
                                form.dataset.copybotMaxWidth = form.style.maxWidth || '';
                                form.style.maxWidth = `${Math.ceil(widthBefore)}px`;
                            }
                            form.style.flexWrap = 'wrap';
                            // 줄바꿈용 칸은 진짜 요소가 아니라 가상 요소(style.css `[data-copybot-break]::after/::before`)로 만든다 (2026-10-25).
                            // 테마의 `#leftSendForm > *` 같은 "상자 안 칸 전부" 크기 규칙이 가상 요소엔 닿지 않아 빈 줄이 생기지 않는다(조화 원칙 §7).
                            // 테마가 그 자리를 장식용으로 이미 쓰고 있으면 비어 있는 반대쪽을 쓰고, 둘 다 차 있으면 예전처럼 진짜 칸으로 물러난다.
                            const breakSide = pickBreakSide(form);
                            if (breakSide) {
                                form.dataset.copybotBreak = breakSide;
                            } else {
                                const lineBreak = document.createElement('div');
                                lineBreak.className = 'copybot_bl_break';
                                lineBreak.setAttribute('aria-hidden', 'true');
                                lineBreak.style.cssText = `flex:0 1 calc(100% + 1px);width:0;min-width:0;height:0;min-height:0;margin:0;padding:0;border:0;order:${ORDER_BREAK};pointer-events:none;`;
                                form.appendChild(lineBreak);
                            }
                        }
                        iconsToAdd.forEach(icon => { icon.style.order = String(ORDER_ICONS); form.appendChild(icon); });
                        // 우하단은 전송 버튼 아래(오른쪽 끝)에 맞춰 정렬: 아랫줄 맨 앞에 "늘어나는 빈 칸"을 두어 아이콘을 오른쪽으로 민다.
                        // 아이콘 자체의 margin-left:auto 는 테마가 `#rightSendForm > div { margin:0 !important }` 를 주면 무시되므로(2026-10-26 폰 확인: Monopress 계열)
                        // 테마의 자식 규칙이 닿지 않는 가상 요소(::before, style.css `[data-copybot-spacer]`)를 쓰고, 테마가 그 자리를 쓰면 div 가 아닌 span 으로 물러난다.
                        if (position === 'right_bottom' && iconsToAdd.length && !form.dataset.copybotSpacer && !form.querySelector('.copybot_rb_spacer')) {
                            if (form.dataset.copybotBreak !== 'before' && pseudoFree(form, '::before')) {
                                form.dataset.copybotSpacer = 'before';
                            } else {
                                const spacer = document.createElement('span');
                                spacer.className = 'copybot_rb_spacer';
                                spacer.setAttribute('aria-hidden', 'true');
                                spacer.style.cssText = `flex:1 1 0;width:0;height:0;min-width:0;min-height:0;margin:0;padding:0;border:0;order:${ORDER_ICONS};pointer-events:none;`;
                                form.appendChild(spacer);
                                iconsToAdd.forEach(icon => form.appendChild(icon));   // 빈 칸 뒤에 다시 붙여 같은 order 안에서 빈 칸이 앞에 오게
                            }
                        }
                        // 한 프레임 뒤 수치로 자가 검사 → 못 버티는 테마면 한 단계씩 물러남 (1회성, 감시 아님)
                        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => this.verifyBottomRowLayout(form, referenceIcon));
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
                        independentContainer.style.cssText = `position:absolute;top:0;right:${minimalOffset}px;transform:translateY(calc(-100% - 4px));display:flex;flex-wrap:wrap;gap:6px;align-items:center;background:var(--SmartThemeBlurTintColor, rgba(40,40,40,.85));border-radius:6px;padding:4px 8px;border:1px solid var(--SmartThemeBorderColor, rgba(128,128,128,.4));box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:1000;box-sizing:border-box;max-width:calc(100vw - 16px);`;
                        textareaParent.appendChild(independentContainer);
                    }
                    break;
            }
        }
        window.copybot_refreshThemeWatch?.();
        this.refreshExecutionWatch();
        renderedInput = {signature:renderSignature,host:document.querySelector('#send_form'),icons:[...document.querySelectorAll('.copybot_input_field_icon')]};
        // 입력필드 아이콘 호환: 우리 줄이 다 잡힌 다음 프레임에 전송 버튼을 잰다(아랫줄 자가 검사 rAF 가 먼저 등록돼 있어 그 결과까지 반영된 뒤).
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { this.refreshCompatIcons(); this.verifyInputLayout(); });
        else this.refreshCompatIcons();
        debugLog('아이콘 업데이트 완료');
    } catch (error) {
        console.error('깡갤 복사기: 입력 필드 아이콘 업데이트 실패', error);
    }
},

        // 아랫줄(좌하단·우하단) 아이콘 자가 검사 (아이콘을 넣은 다음 프레임에 1회). 세 가지만 본다: ① 전부 상자 안에 있나 ② 잘리지 않았나 ③ 실리 버튼 아랫줄에 있나.
        // 못 버티는 테마(줄바꿈 금지 !important·격자·세로 배치·고정 높이·자식 숨김)면 테마를 고치지 않고 우리가 물러난다:
        //   1단계 줄바꿈 포기(폭 묶기·가상 요소 해제 → 실리 버튼 옆줄) → 2단계 오른쪽 묶음(전송 버튼 앞)으로 이동.
        // leftSendForm 인자 = 검사할 상자(좌하단이면 #leftSendForm, 우하단이면 전송 버튼 상자)
        verifyBottomRowLayout: function(leftSendForm, referenceIcon) {
            try {
                if (!usableInputViewport()) return;
                if (!leftSendForm?.isConnected || leftSendForm.dataset.copybotLayout !== '1') return;
                // 아랫줄 아이콘만 본다(order 가 아랫줄 값인 것). 같은 상자에 '좌측'/'우측'으로 들어간 우리 아이콘은 실리 버튼과 같은 줄이라 검사 대상이 아니다
                // (2026-10-25 폰 확인: 우측 아이콘까지 세어 "줄바꿈 안 됨"으로 오판 → 멀쩡한 우하단이 옆줄로 물러났음)
                const icons = Array.from(leftSendForm.querySelectorAll('.copybot_input_field_icon')).filter(i => i.style.order === String(ORDER_ICONS));
                if (!icons.length) return;
                const box = leftSendForm.getBoundingClientRect();
                if (box.width === 0 && box.height === 0) return;   // 상자 자체가 안 그려진 상태(탭 숨김 등): 판단 보류
                // 폭 0의 오른쪽 정렬 칸에도 flex gap은 붙는다. 테마 간격 때문에
                // 한 줄에 들어갈 버튼이 갈라지면 우리 빈 칸만 포기한다.
                // 테마의 gap/버튼 크기는 그대로 두고, 실제 줄 수가 줄어들 때만 유지한다.
                const spacerSide=leftSendForm.dataset.copybotSpacer;
                const spacer=leftSendForm.querySelector('.copybot_rb_spacer');
                const layoutStyle=getComputedStyle(leftSendForm);
                if ((spacerSide || spacer) && layoutStyle.display.includes('flex') &&
                    layoutStyle.flexDirection==='row' && parseFloat(layoutStyle.columnGap)>0) {
                    const rowCount=()=>{
                        const rows=[];
                        icons.map(el=>el.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0)
                            .sort((a,b)=>a.top-b.top).forEach(r=>{
                                const row=rows.find(x=>Math.min(x.bottom,r.bottom)-Math.max(x.top,r.top)>1.5);
                                if(row){row.top=Math.max(row.top,r.top);row.bottom=Math.min(row.bottom,r.bottom);}
                                else rows.push({top:r.top,bottom:r.bottom});
                            });
                        return rows.length;
                    };
                    const beforeRows=rowCount();
                    if (beforeRows>1) {
                        const next=spacer?.nextSibling;
                        delete leftSendForm.dataset.copybotSpacer;
                        spacer?.remove();
                        if (rowCount()>=beforeRows) {
                            if (spacerSide) leftSendForm.dataset.copybotSpacer=spacerSide;
                            if (spacer) leftSendForm.insertBefore(spacer,next||null);
                        }
                    }
                }
                const measure = () => {
                    const cs = getComputedStyle(leftSendForm);
                    const b = leftSendForm.getBoundingClientRect();
                    const stRects = Array.from(leftSendForm.children)
                        .filter(c => !icons.includes(c) && !c.classList.contains('copybot_bl_break') && !c.classList.contains('copybot_rb_spacer'))
                        .filter(c => !(scriptDock?.box === leftSendForm && /^stscript_(pause|continue|stop)$/.test(c.id)))
                        // 생성 정지는 빈 전송 칸의 중앙에 겹쳐 있다. 줄 높이는 그 빈 칸으로 잰다.
                        .filter(c => !(scriptDock?.box === leftSendForm && c.id === 'mes_stop' && getComputedStyle(c).position === 'fixed'))
                        .map(c => c.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
                    const stBottom = stRects.length ? Math.max(...stRects.map(r => r.bottom)) : null;
                    const rects = icons.map(i => i.getBoundingClientRect());
                    const shown = rects.filter(r => r.width > 0 && r.height > 0);
                    const inside = shown.every(r => r.top >= b.top - 1 && r.bottom <= b.bottom + 1 && r.left >= b.left - 1 && r.right <= b.right + 1);
                    // 잘림은 아이콘을 넣기 전 기준선(테마 자체의 넘침)보다 더 넘칠 때만
                    const base = String(leftSendForm.dataset.copybotOverflow || '0x0').split('x').map(n => Number(n) || 0);
                    const clipped = (/auto|scroll|hidden|clip/.test(cs.overflowY) && (leftSendForm.scrollHeight - leftSendForm.clientHeight) > base[1] + 1) ||
                        (/auto|scroll|hidden|clip/.test(cs.overflowX) && (leftSendForm.scrollWidth - leftSendForm.clientWidth) > base[0] + 1);
                    const wrapped = (stBottom === null || !shown.length) ? true : Math.min(...shown.map(r => r.top)) >= stBottom - 1;
                    const flexOk = cs.display.includes('flex') && cs.flexWrap === 'wrap' && cs.flexDirection === 'row';
                    return { allShown: shown.length === icons.length, inside, clipped, wrapped, flexOk };
                };
                let m = measure();
                if (m.allShown && m.inside && !m.clipped && m.wrapped) return;   // 정상
                debugLog('아랫줄 아이콘 자가 검사 실패 → 1단계(줄바꿈 포기)', leftSendForm.id, m);
                // 1단계: 줄바꿈 포기 — 가상 요소·폭 묶기 해제, 아이콘은 실리 버튼 옆줄에 그대로
                delete leftSendForm.dataset.copybotBreak;
                delete leftSendForm.dataset.copybotSpacer;
                leftSendForm.querySelectorAll('.copybot_bl_break, .copybot_rb_spacer').forEach(el => el.remove());
                if ('copybotMaxWidth' in leftSendForm.dataset) leftSendForm.style.maxWidth = leftSendForm.dataset.copybotMaxWidth || '';
                leftSendForm.dataset.copybotFallback = 'inline';
                m = measure();
                if (m.allShown && m.inside && !m.clipped) return;
                // 2단계: 오른쪽 묶음(전송 버튼 앞)으로 이동 — #leftSendForm 이 없는 테마와 같은 처리
                if (!referenceIcon?.parentElement) return;
                debugLog('아랫줄 아이콘 자가 검사 실패 → 2단계(오른쪽 묶음으로 이동)', leftSendForm.id, m);
                icons.forEach(icon => { icon.style.order = ''; referenceIcon.parentElement.insertBefore(icon, referenceIcon); });
                leftSendForm.style.flexWrap = leftSendForm.dataset.copybotFlexWrap || '';
                leftSendForm.dataset.copybotFallback = 'right';
            } catch (error) {
                debugLog('아랫줄 아이콘 자가 검사 중 오류 — 그대로 둠', error);
            }
        },

        // 상대의 레이아웃을 고치지 않는다. 맞지 않는 우리 아이콘만 별도 줄로 물러난다.
        verifyInputLayout: function() {
            if (!usableInputViewport()) return;
            if (compatPending) return; // 테마 전환 중간 좌표를 충돌로 오판하지 않는다.
            syncScriptControls();
            syncExecutionWidths();
            const textarea = document.querySelector('#send_textarea');
            const host = textarea?.closest('#send_form');
            if (!host) return;
            const own = [...host.querySelectorAll('.copybot_input_field_icon')];
            if (!own.length) return;
            spaceOverflowTray(host);
            positionIndependentContainers(host);
            const inline = own.filter(el => !el.closest('.copybot_independent_container, .copybot_overflow_container'));
            if (!inline.length) return;
            const native = [...host.querySelectorAll('#leftSendForm > div, #rightSendForm > div, #send_but, #mes_stop, .stscript_btn, .dm-compact--button')]
                .filter(el => !el.classList.contains('copybot_input_field_icon') && shown(el));
            const badParents = new Set();
            const taRect = textarea.getBoundingClientRect();
            // QR도 입력칸 안에 놓일 공간은 필요하다. 실행 중 재갱신으로 우리 버튼이
            // 입력칸을 눌러 기본 제어 버튼까지 화면 밖으로 밀면 우리 쪽이 먼저 물러난다.
            const crowded = taRect.width < Math.min(96, innerWidth / 4);
            inline.forEach((el, i) => {
                const r = el.getBoundingClientRect();
                if (crowded || !shown(el) || outsideViewport(r) || clippedByParent(el) ||
                    native.some(other => rectanglesOverlap(r, other.getBoundingClientRect())) ||
                    inline.slice(i + 1).some(other => shown(other) && rectanglesOverlap(r, other.getBoundingClientRect()))) badParents.add(el.parentElement);
            });
            // 좁은 옆 상자에 우리 버튼만 세로로 쌓이면 잘림 없이도 입력부가
            // 커다란 빈 상자로 늘어난다. 추가 전 높이 + 버튼 한 줄을 넘고,
            // 실제 우리 버튼도 여러 줄을 차지할 때 기존 별도 줄로 양보한다.
            if (inputBaseline?.row === textarea.closest('#nonQRFormItems')) {
                const parents = new Set(inline.map(el => el.parentElement));
                parents.forEach(box => {
                    const children = inline.filter(el => el.parentElement === box && shown(el));
                    if (children.length < 2) return;
                    const rects = children.map(el => el.getBoundingClientRect());
                    const buttonHeight = Math.max(...rects.map(r => r.height));
                    const gap = parseFloat(getComputedStyle(box).rowGap) || 0;
                    const span = Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top));
                    if (box.getBoundingClientRect().height > inputBaseline.height + buttonHeight + gap + 1.5 &&
                        span > buttonHeight + gap + 1.5) badParents.add(box);
                });
            }
            if (!badParents.size) return;
            const displaced = inline.filter(el => badParents.has(el.parentElement));
            let tray = host.querySelector('.copybot_overflow_container');
            if (!tray) {
                tray = document.createElement('div');
                tray.className = 'copybot_overflow_container';
                tray.style.cssText = 'display:flex;flex-wrap:wrap;flex:0 0 auto;gap:4px;align-items:center;align-self:stretch;justify-content:flex-end;box-sizing:border-box;width:100%;max-width:100%;max-height:40vh;overflow:auto;padding:4px;';
                host.appendChild(tray);
            }
            const reference = document.querySelector('#send_but');
            const refRect = reference?.getBoundingClientRect();
            const refStyle = getComputedStyle(reference || textarea);
            const cachedReference = scriptReferenceSizes.get(reference);
            const idleWidth = referenceSizeMatches(cachedReference, refStyle) ? cachedReference.width : 0;
            const size = Math.max(24, Math.min(48, refRect?.width || idleWidth || parseFloat(refStyle.fontSize) || 32));
            displaced.sort((a,b) => Number(a.dataset.cbPriority || 0) - Number(b.dataset.cbPriority || 0)).forEach(el => {
                el.style.order = '';
                el.style.flex = '0 0 auto';
                el.style.width = `${size}px`;
                el.style.height = `${size}px`;
                el.style.display = 'flex';
                el.style.alignItems = 'center';
                el.style.justifyContent = 'center';
                const side = /^(left|bottom_left)$/.test(el.dataset.copybotInputPosition) ? 'left' : 'right';
                let group = tray.querySelector(`[data-copybot-overflow-side="${side}"]`);
                if (!group) {
                    group = document.createElement('div');
                    group.className = 'copybot_overflow_group';
                    group.dataset.copybotOverflowSide = side;
                    group.style.cssText = 'display:flex;flex-wrap:wrap;flex:0 1 auto;gap:4px;align-items:center;min-width:0;max-width:100%;';
                    group.style.justifyContent = side === 'left' ? 'flex-start' : 'flex-end';
                    if (side === 'left') { group.style.marginRight = 'auto'; tray.prepend(group); }
                    else tray.appendChild(group);
                }
                group.appendChild(el);
            });
            tray.querySelectorAll('.copybot_overflow_group').forEach(group => {
                [...group.children].sort((a,b)=>Number(a.dataset.cbPriority||0)-Number(b.dataset.cbPriority||0)).forEach(el=>group.appendChild(el));
            });
            badParents.forEach(box => {
                if (box.dataset.copybotLayout !== '1' || box.querySelector('.copybot_input_field_icon')) return;
                if ('copybotMaxWidth' in box.dataset) box.style.maxWidth = box.dataset.copybotMaxWidth;
                box.style.flexWrap = box.dataset.copybotFlexWrap || '';
                box.querySelectorAll('.copybot_bl_break,.copybot_rb_spacer').forEach(el => el.remove());
                for (const key of ['copybotLayout','copybotMaxWidth','copybotFlexWrap','copybotBreak','copybotSpacer','copybotOverflow','copybotFallback']) delete box.dataset[key];
                executionWidths.delete(box);
            });
            // 우리 아이콘을 뺀 뒤 넓어진 입력칸을 기준으로 QR 위치를 다시 정한다.
            syncScriptControls();
            syncExecutionWidths();
            spaceOverflowTray(host);
            positionIndependentContainers(host);
            // 우리 아이콘이 줄에서 빠지면 상대 아이콘의 가운데 정렬 기준도 달라진다.
            // 평상시 새 줄 높이로 호환 정렬을 마무리해야 첫 QR 때 재정렬되지 않는다.
            if (executionState() === '00' && this.isCompatIconsEnabled()) this.refreshCompatIcons();
            debugLog('입력부 공간 부족 — 복사기 아이콘만 별도 줄로 이동', displaced.length);
        },

        // 특정 실행 상태만 관찰한다. 아이콘/호환 기능을 끄면 해제하며 폴링하지 않는다.
        refreshExecutionWatch: function() {
            if (!this.anyIconConfigured()) { this.disposeExecutionWatch(); return; }
            const host = document.querySelector('#form_sheld');
            if (!host || typeof MutationObserver === 'undefined') return;
            if (executionHost !== host) {
                this.disposeExecutionWatch();
                executionHost = host;
                executionObserver = new MutationObserver(() => {
                    const state = executionState();
                    const signal = state + (host.classList.contains('script_paused') ? '1' : '0');
                    if (signal === lastExecutionState) return;
                    lastExecutionState = signal;
                    // 실행 종료는 설정 변경이 아니다. 정상 배치와 공간 부족으로 물러난
                    // 배치를 모두 유지하고 임시 제어 버튼의 스타일만 원복한다.
                    syncScriptControls(); syncExecutionWidths(); this.refreshCompatIcons(); scheduleLayoutCheck();
                });
                executionObserver.observe(host, { attributes: true, attributeFilter: ['class'] });
                executionObserver.observe(document.body, { attributes: true, attributeFilter: ['data-generating'] });
                window.addEventListener('resize', scheduleLayoutCheck);
                window.visualViewport?.addEventListener('resize', scheduleLayoutCheck);
            }
            lastExecutionState = executionState() + (host.classList.contains('script_paused') ? '1' : '0');
            const select=document.querySelector('#themes');
            if (layoutThemeSelect !== select) {
                if (layoutThemeSelect) $(layoutThemeSelect).off('change.copybotInputLayout');
                layoutThemeSelect=select;
                if (select) $(select).on('change.copybotInputLayout',()=>{
                    clearTimeout(layoutThemeTimer);
                    // 같은 body class를 쓰는 테마끼리도 선택 변경은 명시적으로 온다.
                    // 실리의 테마 적용 핸들러가 끝난 뒤 한 번만 다시 배치한다.
                    layoutThemeTimer=setTimeout(()=>{layoutThemeTimer=0;this.updateInputFieldIcons();},100);
                });
            }
            syncScriptControls();
            syncExecutionWidths();
        },
        disposeExecutionWatch: function() {
            clearTimeout(compatReleaseTimer);compatReleaseTimer=0;
            clearTimeout(layoutThemeTimer);layoutThemeTimer=0;
            if (layoutThemeSelect) $(layoutThemeSelect).off('change.copybotInputLayout');
            layoutThemeSelect=null;
            executionObserver?.disconnect();
            executionObserver = null;
            executionHost = null;
            window.removeEventListener('resize', scheduleLayoutCheck);
            window.visualViewport?.removeEventListener('resize', scheduleLayoutCheck);
            if (layoutFrame) cancelAnimationFrame(layoutFrame);
            layoutFrame = 0;
            deferredLayoutUpdate = false;
            restoreExecutionWidths();
            restoreScriptControls();
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
					if (!document.querySelector('.copybot_input_field_icon, .copybot_independent_container, .copybot_bl_break, [data-copybot-compat-icon]') && !this.anyIconConfigured()) {
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
    let executionObserver = null, executionHost = null, lastExecutionState = '00';
    const executionWidths = new Map();
    let scriptDock = null;
    const scriptReferenceSizes = new WeakMap();
    let layoutFrame = 0;
    let deferredLayoutUpdate = false;
    let renderedInput = null;
    let inputBaseline = null;
    function inputRenderSignature() {
        try {
            const values=['tag_remove','delete','delete_regenerate','quickmenu','ghostwrite'].map(key=>{
                const id='#copybot_'+key;
                return [$(id+'_toggle').attr('data-enabled'),$(id+(key==='quickmenu'?'_input_icon':'_inputfield')).prop('checked'),
                    key==='ghostwrite'?$('input[name="copybot_ghostwrite_position"]:checked').val():$(id+(key==='quickmenu'?'_icon_position':'_position')).val(),$(id+'_icon_picker').data('icon')];
            });
            return JSON.stringify([innerWidth,innerHeight,document.querySelector('#themes')?.value,
                document.querySelector('#custom-style')?.textContent,$('#copybot_compat_input_icons_toggle').attr('data-enabled'),
                values,window.CopyBotUI?.getIconOrder?.(),window.CopyBotActions?.getEnabledSlots?.()]);
        } catch { return null; }
    }
    function usableInputViewport() {
        // 버튼 하나도 놓을 수 없는 전환 중간값에서는 읽기·배치 변경을 보류한다.
        // 기존 resize/실행 상태 알림에서 다시 확인하며 타이머나 반복 프레임을 만들지 않는다.
        const viewport = window.visualViewport;
        return innerWidth >= 32 && innerHeight >= 32 &&
            (!viewport || (viewport.width >= 32 && viewport.height >= 32));
    }
    function scheduleLayoutCheck() {
        if (layoutFrame) return;
        layoutFrame = requestAnimationFrame(() => {
            layoutFrame = 0;
            if (!usableInputViewport()) return;
            if (deferredLayoutUpdate) { deferredLayoutUpdate = false; window.CopyBotIcons.updateInputFieldIcons(); }
            else window.CopyBotIcons.verifyInputLayout();
        });
    }
    function shown(el) {
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    }
    function unobstructedInInput(el, x, y) {
        // QR 메뉴·팝업이 잠시 입력부를 덮는 것은 입력부 자체의 배치 실패가 아니다.
        // 메뉴를 닫거나 위로 뚫지 않고, 같은 입력부 안의 겹침·잘림만 판정한다.
        const host = el.closest('#send_form');
        const stack = document.elementsFromPoint?.(x, y) || [document.elementFromPoint(x, y)];
        const hit = stack.find(node => node && host?.contains(node));
        return !!hit && el.contains(hit);
    }
    function outsideViewport(r) { return r.left < -1.5 || r.right > innerWidth + 1.5 || r.top < -1.5 || r.bottom > innerHeight + 1.5; }
    function clippedByParent(el) {
        const r = el.getBoundingClientRect();
        for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            const s = getComputedStyle(parent), b = parent.getBoundingClientRect();
            if (/auto|scroll|hidden|clip/.test(s.overflowX) && (r.left < b.left-1.5 || r.right > b.right+1.5)) return true;
            if (/auto|scroll|hidden|clip/.test(s.overflowY) && (r.top < b.top-1.5 || r.bottom > b.bottom+1.5)) return true;
        }
        return false;
    }
    function rectanglesOverlap(a,b) { return Math.min(a.right,b.right)-Math.max(a.left,b.left)>1.5 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1.5; }
    function spaceOverflowTray(host) {
        const tray = host.querySelector('.copybot_overflow_container');
        const row = host.querySelector('#nonQRFormItems');
        if (!tray || !row) return;
        tray.style.paddingTop = '4px';tray.style.paddingBottom = '4px';
        const r = tray.getBoundingClientRect(), line = row.getBoundingClientRect();
        const other = [...row.querySelectorAll('#leftSendForm > div,#rightSendForm > div,.dm-compact--button')]
            .filter(el=>!el.classList.contains('copybot_input_field_icon')&&shown(el)).map(el=>el.getBoundingClientRect());
        if (!other.length) return;
        if (r.top < line.top) tray.style.paddingBottom = `${4+Math.max(0,line.top-Math.min(...other.map(x=>x.top)))}px`;
        else tray.style.paddingTop = `${4+Math.max(0,Math.max(...other.map(x=>x.bottom))-line.bottom)}px`;
    }
    function positionIndependentContainers(host) {
        const parentRect = host.getBoundingClientRect();
        const obstacles = [...host.querySelectorAll('#nonQRFormItems, #leftSendForm > div, #rightSendForm > div, .dm-compact--button')].filter(shown).map(el=>el.getBoundingClientRect());
        const top = Math.min(parentRect.top,...obstacles.map(r=>r.top));
        const bottom = Math.max(parentRect.bottom,...obstacles.map(r=>r.bottom));
        host.querySelectorAll('.copybot_independent_container').forEach(box => {
            if (box.dataset.copybotInFlow === '1') return;
            const usableWidth = Math.max(32, Math.min(parentRect.width, innerWidth - 16));
            // auto 폭은 right 보정 때마다 shrink-to-fit 폭이 늘어 줄이 바뀐다.
            // 우리 묶음의 내용 폭을 기준으로 하고 실제 사용 가능 폭에서만 줄인다.
            box.style.width = 'max-content';
            box.style.maxWidth = `${usableWidth}px`;
            box.style.maxHeight = '40vh';
            box.style.overflow = 'auto';
            const r = box.getBoundingClientRect();
            const above = top >= r.height + 8;
            if (!above && innerHeight - bottom < r.height + 8) {
                // 공간이 없으면 우리 상자만 일반 흐름으로 물러난다.
                box.style.position = 'relative';box.style.top = '';box.style.right = '';box.style.left = '';box.style.transform = 'none';
                box.dataset.copybotInFlow = '1';
                return;
            }
            box.style.transform = 'none';
            box.style.top = `${(above ? top-r.height-4 : bottom+4)-parentRect.top}px`;
            const current = box.getBoundingClientRect();
            const shift = current.left < 8 ? 8-current.left : current.right > innerWidth-8 ? innerWidth-8-current.right : 0;
            if (shift) box.style.right = `${(parseFloat(box.style.right)||0)-shift}px`;
            if (clippedByParent(box)) {
                box.style.position = 'relative';box.style.top = '';box.style.right = '';box.style.left = '';box.style.transform = 'none';
                box.dataset.copybotInFlow = '1';
            }
        });
    }
    function executionState() {
        return (document.querySelector('#form_sheld')?.classList.contains('isExecutingCommandsFromChatInput') ? '1' : '0') +
            (document.body?.dataset.generating === 'true' ? '1' : '0');
    }
    // QR 제어 버튼은 원래 DOM/이벤트/색상을 유지한 채 입력칸의 빈 공간에만 잠시 놓는다.
    // 격자·클리핑·불명확한 크기에서는 테마를 덮어쓰지 않고 기존 배치로 양보한다.
    function restoreScriptControls() {
        if (!scriptDock) return;
        const dock = scriptDock; scriptDock = null;
        dock.styles.forEach((props, el) => props.forEach((saved, name) => {
            if (el.style.getPropertyValue(name) !== saved.applied || el.style.getPropertyPriority(name)) return;
            if (saved.value) el.style.setProperty(name, saved.value, saved.priority);
            else el.style.removeProperty(name);
        }));
        dock.originalStyleAttrs.forEach((value,el)=>{if(value===null&&!el.getAttribute('style'))el.removeAttribute('style')});
        dock.placeholder?.remove();
    }
    function syncScriptControls() {
        if (!document.querySelector('.copybot_input_field_icon')) { restoreScriptControls(); return; }
        if (!usableInputViewport()) return;
        const textarea = document.querySelector('#send_textarea'), send = document.querySelector('#send_but');
        const box = send?.parentElement;
        const state = executionState();
        if (state === '00') {
            restoreScriptControls();
            if (send && shown(send)) { const r=send.getBoundingClientRect(),style=getComputedStyle(send);scriptReferenceSizes.set(send,{width:r.width,height:r.height,opacity:style.opacity,viewportWidth:innerWidth,signature:scriptReferenceSignature(style)}); }
            return;
        }
        if (!textarea || !box || !send || send.parentElement !== box || !box.parentElement?.contains(textarea)) { restoreScriptControls(); return; }
        const cs = getComputedStyle(box), rs = getComputedStyle(send);
        const controls = ['stscript_pause','stscript_continue','stscript_stop'].map(id=>document.getElementById(id));
        const generationStop = box.querySelector('#mes_stop');
        if (!/flex|grid/.test(cs.display) || cs.transform !== 'none' || !generationStop || controls.some(el=>!el || el.parentElement!==box)) { restoreScriptControls(); return; }
        const px = value => parseFloat(value) || 0;
        const dimension = (style, name) => {
            if (!/^\d+(?:\.\d+)?px$/.test(style[name])) return null;
            const sides = name === 'width' ? ['Left','Right'] : ['Top','Bottom'];
            return px(style[name]) + (style.boxSizing==='border-box' ? 0 : sides.reduce((n,side)=>n+px(style['padding'+side])+px(style['border'+side+'Width']),0));
        };
        const cached=scriptReferenceSizes.get(send);
        const cachedSize=referenceSizeMatches(cached,rs)?cached:null;
        const sendWidth = cachedSize?.width || dimension(rs,'width'), sendHeight = cachedSize?.height || dimension(rs,'height');
        const visible = controls.filter(shown);
        if (!sendWidth || !sendHeight || (visible.length!==0 && visible.length!==2)) { restoreScriptControls(); return; }
        const sizes = visible.map(el=>el.getBoundingClientRect());
        if (sizes.some(r=>!r.width||!r.height)) { restoreScriptControls(); return; }
        // 제어 버튼을 원래 줄에서 뺀 뒤의 입력칸으로 공간을 판단한다.
        // 아직 줄을 차지한 상태의 좁은 입력칸으로 판단하면 스스로 도킹을 막는다.
        if (scriptDock?.box !== box) restoreScriptControls();
        if (!scriptDock) {
            scriptDock = {box,styles:new Map(),placeholder:null,originalStyleAttrs:new Map([...controls,generationStop,send].map(el=>[el,el.getAttribute('style')]))};
        }
        const dock=scriptDock;
        const write=(el,name,value)=>{
            let props=dock.styles.get(el);if(!props){props=new Map();dock.styles.set(el,props)}
            let saved=props.get(name);if(!saved){saved={value:el.style.getPropertyValue(name),priority:el.style.getPropertyPriority(name),applied:null};props.set(name,saved)}
            el.style.setProperty(name,value);saved.applied=el.style.getPropertyValue(name);
        };
        // 숨겨진 0크기 전송 요소도 셀/간격 하나를 차지한다. 별도 칸을 더 만들지
        // 않고 그 숨겨진 칸의 기존 크기만 유지한다. 테마의 important 크기는 건드리지 않는다.
        if (rs.display !== 'none' && rs.visibility === 'hidden') {
            for (const [name,value] of [['width',sendWidth],['height',sendHeight]]) {
                const sides=name==='width'?['Left','Right']:['Top','Bottom'];
                const extra=rs.boxSizing==='border-box'?0:sides.reduce((n,side)=>n+px(rs['padding'+side])+px(rs['border'+side+'Width']),0);
                const size=Math.max(0,value-extra);
                // border가 있으면 0으로 접힌 칸도 계산상 2px가 될 수 있다.
                if (!send.style.getPropertyPriority(name) && px(rs[name]) < size) write(send,name,`${size}px`);
            }
        }
        const sendRect=send.getBoundingClientRect();
        const sendKeepsSpace=sendRect.width>0&&sendRect.height>0&&!/absolute|fixed/.test(rs.position);
        // QR은 전송 칸만 0×0으로 접고 ::before 글리프는 남긴다. 그 보이지 않는
        // 글리프가 오른쪽 상자의 가로 스크롤을 늘리므로, 접힌 요소 안에서만 자른다.
        const foldedSend = sendRect.width === 0 && sendRect.height === 0 && rs.visibility === 'hidden';
        for (const [name,key] of [['overflow-x','overflowX'],['overflow-y','overflowY']]) {
            const props=dock.styles.get(send),saved=props?.get(name);
            if(saved&&(send.style.getPropertyValue(name)!==saved.applied||send.style.getPropertyPriority(name))){props.delete(name);continue;}
            if(foldedSend){
                if(!saved&&(rs[key]!=='visible'||send.style.getPropertyPriority(name)))continue;
                write(send,name,'clip');
            }else if(saved){
                if(saved.value)send.style.setProperty(name,saved.value,saved.priority);else send.style.removeProperty(name);
                props.delete(name);
            }
        }
        if (!sendKeepsSpace) {
            if (!dock.placeholder) {
                const placeholder=document.createElement('span');placeholder.className='copybot_qr_placeholder';placeholder.setAttribute('aria-hidden','true');
                placeholder.style.cssText='display:block;position:static;flex:0 0 auto;visibility:hidden;pointer-events:none;box-sizing:border-box;';
                dock.placeholder=placeholder;
            }
            Object.assign(dock.placeholder.style,{width:`${sendWidth}px`,height:`${sendHeight}px`,margin:rs.margin,order:rs.order,fontSize:rs.fontSize,color:rs.color,backgroundColor:rs.backgroundColor,border:rs.border,borderRadius:rs.borderRadius,padding:rs.padding,opacity:cachedSize?.opacity||'1'});
            // 크기 없는 요소를 먼저 붙이면 테마의 transition이 0→크기를 애니메이션한다.
            // 완성된 자리표시를 붙여 첫 검사부터 실제 칸 크기를 쓰게 한다.
            if (!dock.placeholder.isConnected) box.insertBefore(dock.placeholder,send);
        } else { dock.placeholder?.remove();dock.placeholder=null; }
        // fixed는 오른쪽 상자의 overflow를 바꾸지 않고 그 바깥 입력칸에 그리기 위한 것뿐이다.
        controls.forEach(el=>write(el,'position','fixed'));
        write(generationStop,'position','fixed');
        // 테마가 입력칸에 층을 지정했으면 그 칸에 놓는 제어 버튼도 같은 층을 쓴다.
        // 전역 최상위 값이나 !important로 팝업 위에 올라가지 않는다.
        const inputLayer = getComputedStyle(textarea).zIndex;
        if (inputLayer === 'auto' || /^\d+$/.test(inputLayer)) {
            [...controls,generationStop].forEach(el=>{
                const beforeInput=!!(el.compareDocumentPosition(textarea)&Node.DOCUMENT_POSITION_FOLLOWING);
                const layer=Math.max(1,Number(inputLayer)||0)+(beforeInput&&Number(inputLayer)>0?1:0);
                if (getComputedStyle(el).zIndex === 'auto' && !el.style.getPropertyPriority('z-index')) write(el,'z-index',String(layer));
            });
        }
        // 생성 정지 버튼의 크기가 달라도 전송 버튼이 차지하던 자리는 그대로 둔다.
        // 세로 배치에서도 뒤쪽 아이콘이 작은 정지 버튼만큼 당겨지지 않는다.
        const slot = (dock.placeholder || send).getBoundingClientRect();
        const place = (el,x,y) => {
            const style=getComputedStyle(el);
            // blur/transform 조상은 fixed의 좌표 기준도 된다. 화면 좌표를 그 기준으로
            // 한 번만 변환한다. 두 번 쓰고 실측 보정하면 테마의 transition 중간값을
            // 읽어 부모 높이만큼 잘못 더하는 문제가 생긴다.
            const parent=el.offsetParent;
            const origin=parent?.getBoundingClientRect();
            const scaleX=origin&&parent.offsetWidth?origin.width/parent.offsetWidth:1;
            const scaleY=origin&&parent.offsetHeight?origin.height/parent.offsetHeight:1;
            const left=origin?(x-origin.left)/scaleX-parent.clientLeft+parent.scrollLeft:x;
            const top=origin?(y-origin.top)/scaleY-parent.clientTop+parent.scrollTop:y;
            write(el,'left',`${left-px(style.marginLeft)}px`);write(el,'top',`${top-px(style.marginTop)}px`);
        };
        // 전송 버튼을 계속 보여 주는 테마에서는 같은 칸을 정지 버튼과 겹쳐 쓰지 않는다.
        let generationInInput = shown(generationStop) && shown(send) && Number(rs.opacity) > 0;
        let generationSlotFailed = false;
        if (shown(generationStop) && !generationInInput) {
            const stopRect=generationStop.getBoundingClientRect();
            // 중심을 맞추므로 크기 차이의 절반이 각 변으로 나온다(변당 허용 오차 1.5px).
            generationSlotFailed=stopRect.width>slot.width+3||stopRect.height>slot.height+3;
            if(!generationSlotFailed){
                place(generationStop,slot.left+(slot.width-stopRect.width)/2,slot.top+(slot.height-stopRect.height)/2);
                const r=generationStop.getBoundingClientRect();
                generationSlotFailed=outsideViewport(r)||!unobstructedInInput(generationStop,r.left+r.width/2,r.top+r.height/2);
            }
            if(generationSlotFailed){
                generationInInput = true;
            }
        }
        const inInput = [...visible, ...(generationInInput ? [generationStop] : [])];
        if (!inInput.length) return;
        // our max-width stays in place while the controls leave normal flow.
        const input=textarea.getBoundingClientRect();
        const placedSizes=inInput.map(el=>el.getBoundingClientRect());
        const placedWidth=placedSizes.reduce((sum,r)=>sum+r.width,0)+4*(inInput.length-1),placedHeight=Math.max(...placedSizes.map(r=>r.height));
        if(input.width<placedWidth+12||input.height<placedHeight){restoreScriptControls();return}
        const start=input.right-placedWidth-6, top=input.top+(input.height-placedHeight)/2;
        let nextX=start;
        inInput.forEach((el,index)=>{
            place(el,nextX,top);
            nextX+=placedSizes[index].width+4;
        });
        const failed=inInput.some(el=>{
            const r=el.getBoundingClientRect();
            // 둥근 버튼의 잘려 나간 네모 모서리는 클릭 영역이 아니다. 버튼 안쪽을 확인한다.
            const points=[[.25,.25],[.75,.75],[.5,.5]].map(([x,y])=>[r.left+r.width*x,r.top+r.height*y]);
            return getComputedStyle(el).position!=='fixed'||outsideViewport(r)||r.left<input.left-1||r.right>input.right+1||r.top<input.top-1||r.bottom>input.bottom+1||points.some(([x,y])=>!unobstructedInInput(el,x,y));
        });
        if (failed) restoreScriptControls();
    }
    function scriptReferenceSignature(style) {
        return [style.fontSize,style.lineHeight,style.padding,style.border,document.querySelector('#themes')?.value||''].join('|');
    }
    function referenceSizeMatches(cached, style) {
        // 폰의 CSS 픽셀 반올림(411↔412)만으로 실행 중 전송 칸의 기준을 버리지 않는다.
        // 테마·글꼴·여백·테두리가 바뀌거나 실제 폭 차이가 더 크면 재사용하지 않는다.
        return !!cached && cached.signature === scriptReferenceSignature(style) &&
            Math.abs(cached.viewportWidth - innerWidth) <= 1;
    }
    function generationReplacementDelta(box, reference) {
        if (!reference || reference.parentElement !== box || shown(reference)) return null;
        if (scriptDock?.box===box && scriptDock.placeholder) return 0;
        if (executionState() !== '01' && !(executionState()==='11'&&scriptDock?.box===box)) return null;
        const stop = box.querySelector('#mes_stop');
        if (!stop || !shown(stop)) return null;
        const rs = getComputedStyle(reference), ss = getComputedStyle(stop);
        const width = parseFloat(rs.width);
        // QR은 전송 버튼을 0px로 접기도 한다. 같은 테마에서 직전에 실측한 값만 재사용한다.
        if (rs.transform !== 'none' || ss.transform !== 'none') return null;
        const px = value => parseFloat(value) || 0;
        const cached=scriptReferenceSizes.get(reference);
        const measured=scriptDock?.box===box&&referenceSizeMatches(cached,rs)?cached.width:null;
        const refWidth = /^\d+(?:\.\d+)?px$/.test(rs.width)&&Number.isFinite(width)&&width>0 ? width + (rs.boxSizing === 'border-box' ? 0 : px(rs.paddingLeft)+px(rs.paddingRight)+px(rs.borderLeftWidth)+px(rs.borderRightWidth)) : measured;
        if (!refWidth) return null;
        const delta = refWidth + px(rs.marginLeft)+px(rs.marginRight) - stop.getBoundingClientRect().width - px(ss.marginLeft)-px(ss.marginRight);
        return Math.max(0, delta);
    }
    function restoreExecutionWidths() {
        executionWidths.forEach((saved, box) => {
            // 다른 코드가 바꿨으면 그 값을 덮어쓰지 않는다.
            if (box.style.maxWidth === saved.released) box.style.maxWidth = saved.limit;
        });
        executionWidths.clear();
    }
    function syncExecutionWidths() {
        if (!usableInputViewport()) return;
        restoreExecutionWidths();
        if (executionState() === '00') return;
        document.querySelectorAll('[data-copybot-layout="1"]').forEach(box => {
            if (scriptDock?.box===box) return;
            const controls = [...box.querySelectorAll('#stscript_pause,#stscript_continue,#stscript_stop,#mes_stop')];
            if (!controls.some(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; })) return;
            if (!('copybotMaxWidth' in box.dataset) || box.dataset.copybotFallback) return;
            // 일반 생성은 전송 버튼 자리를 유지한다. QR처럼 새 제어 버튼이 추가될 때만 넓힌다.
            if (generationReplacementDelta(box, document.querySelector('#send_but')) !== null) return;
            // QR·생성 중에는 입력 공간을 사용하도록 우리 최대 폭만 해제한다.
            // 생성 중 더 작은 정지 버튼을 기준으로 재계산한 폭에 하단 아이콘이 갈라지지 않게 한다.
            // 테마의 width/max-width/배치 방향, 네이티브 버튼 순서는 건드리지 않는다.
            const saved = { limit: box.style.maxWidth, released: box.dataset.copybotMaxWidth || '' };
            box.style.maxWidth = saved.released;
            executionWidths.set(box, saved);
        });
    }

    // 좌하단 줄: 우리 요소끼리의 순서값(우리 요소에만 준다). 테마가 실리 버튼에 큰 order 를 줘도 우리 줄이 맨 뒤에 오게 정수 최댓값 근처를 쓴다
    const ORDER_BREAK = 2147483646;
    const ORDER_ICONS = 2147483647;
    // 줄바꿈 가상 요소를 어느 쪽에 둘지: 테마가 안 쓰는 쪽(::after 우선). 둘 다 쓰고 있으면 null(진짜 칸으로 물러남)
    // style.css 의 가상 요소 규칙은 #leftSendForm·#rightSendForm 에만 있으므로 다른 상자(전송 버튼이 옮겨진 테마)는 진짜 칸을 쓴다
    function pickBreakSide(el) {
        try {
            if (el.id !== 'leftSendForm' && el.id !== 'rightSendForm') return null;
            if (typeof getComputedStyle !== 'function') return 'after';
            if (pseudoFree(el, '::after')) return 'after';
            if (pseudoFree(el, '::before')) return 'before';
            return null;
        } catch (e) { return 'after'; }
    }
    // 그 가상 요소 자리를 테마가 안 쓰고 있는가 (우리 style.css 규칙은 data- 표식이 있을 때만 켜지므로, 표식 전엔 테마 것만 보인다)
    function pseudoFree(el, which) {
        try {
            if (el.id !== 'leftSendForm' && el.id !== 'rightSendForm') return false;
            if (typeof getComputedStyle !== 'function') return false;
            const c = getComputedStyle(el, which).content;
            return !c || c === 'none' || c === 'normal';
        } catch (e) { return false; }
    }

    // 입력필드 아이콘 호환이 다른 확장 요소에 얹는 CSS 변수 이름(style.css 규칙과 짝). 뗄 때는 이것만 지우고 그 요소의 다른 인라인 스타일은 손대지 않는다
    const COMPAT_VARS = ['--copybot-compat-w', '--copybot-compat-h', '--copybot-compat-m', '--copybot-compat-dy',
        '--copybot-compat-pad', '--copybot-compat-fs', '--copybot-compat-color', '--copybot-compat-bg', '--copybot-compat-border', '--copybot-compat-radius',
        '--copybot-compat-opacity', '--copybot-compat-filter'];
    function unmarkCompat(el) {
        try {
            delete el.dataset.copybotCompatIcon;
            COMPAT_VARS.forEach(v => el.style.removeProperty(v));
        } catch (e) { /* 무시 */ }
    }
    let compatSeq = 0;   // 호환 적용 회차 — 늦게 깨어난 1회 타이머가 더 새 적용을 덮지 않게
    let compatPending = false;
    let compatReleaseTimer = 0;
    let layoutThemeSelect = null;
    let layoutThemeTimer = 0;
    let compatIdleLayout = null;
    function compatLayoutSignature() {
        return [document.querySelector('#themes')?.value || '', innerWidth,
            getComputedStyle(document.documentElement).fontSize].join('|');
    }
    function compatReferenceAppearance(el) {
        const s=getComputedStyle(el);
        return ['fontSize','lineHeight','padding','margin','border','borderRadius','color','backgroundColor','opacity','filter'].map(k=>s[k]).join('|');
    }
    // 배치에 영향을 주는 전환의 duration+delay만 기다린다. 색상 전환까지
    // 기다리면 이미 안정된 배치 정리가 첫 응답 시점으로 밀릴 수 있다.
    function transitionMs(el) {
        try {
            const cs = getComputedStyle(el);
            if (cs.transitionProperty === 'none') return 0;
            const toMs = (s) => { const v = parseFloat(s); if (!isFinite(v)) return 0; return /ms$/.test(s.trim()) ? v : v * 1000; };
            const durs = String(cs.transitionDuration || '0s').split(','), delays = String(cs.transitionDelay || '0s').split(',');
            let max = 0;
            const paintOnly = /^(color|opacity|background(?:-.+)?|border(?:-(?:top|right|bottom|left))?-color|box-shadow|text-shadow)$/;
            String(cs.transitionProperty).split(',').forEach((property, i) => {
                if (paintOnly.test(property.trim())) return;
                max = Math.max(max, toMs(durs[i % durs.length] || '0s') + toMs(delays[i % delays.length] || '0s'));
            });
            return Math.min(max, 2000);
        } catch (e) { return 0; }
    }

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
