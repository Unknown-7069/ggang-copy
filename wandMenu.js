// ===================================================================
// 📦 wandMenu.js - 마법봉 퀵메뉴 모듈
// ===================================================================
// 역할: Extensions 메뉴 내 깡갤 복사기 퀵메뉴 등록 및 관리
// 의존성: utils.js
// ===================================================================

(function() {
    'use strict';

    // 모듈 상태
    let isInitialized = false;
    let isDebugMode = false;
    let isPinned = false;
    let isMiniMode = false;
    let callbacks = {};
    
    // localStorage 키
    const STORAGE_KEY_PINNED = 'copybot_quick_menu_pinned';
    const STORAGE_KEY_MINI = 'copybot_quick_menu_mini';

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

    // ===================================================================
    // 💾 설정 저장/로드
    // ===================================================================

    /**
     * localStorage에서 설정 로드
     */
    function loadSettings() {
        try {
            const savedPinned = localStorage.getItem(STORAGE_KEY_PINNED);
            const savedMini = localStorage.getItem(STORAGE_KEY_MINI);
            
            isPinned = savedPinned === 'true';
            isMiniMode = savedMini === 'true';
            
            debugLog('설정 로드:', { isPinned, isMiniMode });
        } catch (e) {
            debugLog('설정 로드 실패:', e);
        }
    }

    /**
     * localStorage에 설정 저장
     */
    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY_PINNED, isPinned);
            localStorage.setItem(STORAGE_KEY_MINI, isMiniMode);
            debugLog('설정 저장:', { isPinned, isMiniMode });
        } catch (e) {
            debugLog('설정 저장 실패:', e);
        }
    }

    // ===================================================================
    // 🪄 마법봉 메뉴 등록
    // ===================================================================

    /**
     * 마법봉 메뉴에 깡갤 복사기 항목 등록
     */
    function registerWandMenu() {
        // Phase 1 설정 확인: 퀵메뉴 OFF 또는 마법봉 미선택 시 등록하지 않음
        const settings = callbacks.getQuickMenuSettings ? callbacks.getQuickMenuSettings() : null;
        if (settings && (!settings.enabled || !settings.accessWand)) {
            // 기존에 등록된 항목이 있으면 제거
            $('#copybot_wand_container').remove();
            debugLog('마법봉 메뉴 미등록 (설정: 퀵메뉴 OFF 또는 마법봉 미선택)');
            return false;
        }
        
        // 이미 등록되어 있으면 중복 방지
        if ($('#copybot_wand_container').length > 0) {
            debugLog('마법봉 메뉴 이미 등록됨');
            return true;
        }

        // Extensions 메뉴 팝업 찾기
        const $extensionsMenu = $('#extensionsMenu');
        if ($extensionsMenu.length === 0) {
            debugLog('Extensions 메뉴를 찾을 수 없음');
            return false;
        }

        // 깡갤 복사기 항목 생성 - 개인화 아이콘 적용
		const wandIconClass = $('#copybot_quickmenu_wand_icon_picker').data('icon') || 'fa-clipboard';
		const wandItemHtml = `
			<div id="copybot_wand_container" class="extension_container interactable" tabindex="0">
				<div id="copybot_wand_button" class="list-group-item flex-container flexGap5 interactable" tabindex="0" role="listitem" title="깡갤 복사기 퀵메뉴">
					<div class="fa-solid ${wandIconClass} extensionsMenuExtensionButton"></div>
					<span>깡갤 복사기</span>
				</div>
			</div>
		`;

        // Extensions 메뉴에 추가
        $extensionsMenu.append(wandItemHtml);
        debugLog('✅ 마법봉 메뉴 항목 등록 완료');

        // 퀵메뉴 팝업 생성 (body에 추가)
        createQuickMenuPopup();

        return true;
    }

    /**
     * 퀵메뉴 팝업 HTML 생성
     */
    function createQuickMenuPopup() {
		if ($('#copybot_quick_menu').length > 0) {
			return; // 이미 존재
		}

		// 편의기능에서 개인화된 아이콘 가져오기
		const tagRemoveIcon = getIconClass('copybot_tag_remove_icon_picker', 'fa-tags');
		const deleteIcon = getIconClass('copybot_delete_icon_picker', 'fa-trash');
		const deleteRegenIcon = getIconClass('copybot_delete_regenerate_icon_picker', 'fa-redo');

		const quickMenuHtml = `
			<div id="copybot_quick_menu" class="copybot_quick_menu_popup">
				<div class="copybot_quick_menu_content">
					<!-- 📍 이동 섹션 -->
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
							<input type="number" class="copybot_quick_input" id="copybot_quick_jump_num" placeholder="" min="0">
							<button class="copybot_quick_btn_mini" data-action="jump_to" title="해당 번호로 이동">
								<i class="fa-solid fa-arrow-right"></i><span class="copybot_btn_text">이동</span>
							</button>
						</div>
					</div>

					<!-- ✏️ 작성 섹션 -->
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

                    <!-- 📝 복사 섹션 -->
					<div class="copybot_quick_menu_section" data-section="copy">
						<div class="copybot_quick_menu_section_title">복사</div>
                        <div class="copybot_quick_row">
                            <input type="number" class="copybot_quick_input" id="copybot_quick_copy_start" placeholder="" min="0">
                            <span class="copybot_quick_separator">~</span>
                            <input type="number" class="copybot_quick_input" id="copybot_quick_copy_end" placeholder="" min="0">
                            <button class="copybot_quick_btn_small" data-action="copy_range" title="범위 복사">
                                <i class="fa-solid fa-copy"></i><span class="copybot_btn_text">복사</span>
                            </button>
                        </div>
                        <div class="copybot_quick_copy_hint" id="copybot_quick_copy_hint" style="font-size:10px; color:var(--SmartThemeQuoteColor); margin-top:4px; display:none;">
                            ※ 범위 미지정 시 전체 복사
                        </div>
                    </div>

                    <!-- 👁️ 메시지 관리 섹션 -->
					<div class="copybot_quick_menu_section" data-section="hide">
						<div class="copybot_quick_menu_section_title">숨기기/보이기</div>
                        <div class="copybot_quick_row copybot_quick_row_nowrap">
                            <input type="number" class="copybot_quick_input" id="copybot_quick_hide_start" placeholder="" min="0">
                            <span class="copybot_quick_separator">~</span>
                            <input type="number" class="copybot_quick_input" id="copybot_quick_hide_end" placeholder="" min="0">
                            <button class="copybot_quick_btn_small" data-action="hide_messages" title="메시지 숨기기">
                                <i class="fa-solid fa-eye-slash"></i><span class="copybot_btn_text">숨김</span>
                            </button>
                            <button class="copybot_quick_btn_small" data-action="unhide_messages" title="메시지 보이기">
                                <i class="fa-solid fa-eye"></i><span class="copybot_btn_text">보임</span>
                            </button>
                        </div>
                    </div>

                    <!-- 🗑️ 다중 삭제 섹션 -->
					<div class="copybot_quick_menu_section copybot_quick_menu_section_last" data-section="multi_delete">
						<div class="copybot_quick_menu_section_title">메시지 다중 삭제</div>
                        <div class="copybot_quick_row">
                            <input type="number" class="copybot_quick_input" id="copybot_quick_del_start" placeholder="" min="0">
                            <span class="copybot_quick_separator">~</span>
                            <input type="number" class="copybot_quick_input" id="copybot_quick_del_end" placeholder="" min="0">
                            <button class="copybot_quick_btn_small copybot_quick_btn_multi_delete" data-action="multi_delete" title="선택 범위 삭제">
                                <i class="fa-solid fa-trash"></i><span class="copybot_btn_text">삭제</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 하단 바 -->
                <div class="copybot_quick_menu_footer">
                    <div class="copybot_quick_footer_left">
                        <button class="copybot_quick_toggle" id="copybot_quick_pin" data-active="false" title="창 고정">고정</button>
                        <button class="copybot_quick_toggle" id="copybot_quick_mini" data-active="false" title="미니 모드 (준비 중)">미니</button>
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

        $('body').append(quickMenuHtml);
        debugLog('✅ 퀵메뉴 팝업 생성 완료');
    }


    // ===================================================================
    // 🎮 이벤트 핸들러
    // ===================================================================

    /**
     * 이벤트 핸들러 설정
     */
    function setupEvents() {
        // 마법봉 내 복사기 버튼 클릭 (내부 버튼 대상)
		$(document).off('click.copybot_wand').on('click.copybot_wand', '#copybot_wand_button', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleQuickMenu(this);
        });

        // 퀵메뉴 닫기 버튼
        $(document).off('click.copybot_quick_close').on('click.copybot_quick_close', '.copybot_quick_menu_close', function(e) {
            e.stopPropagation();
            hideQuickMenu();
        });

        // 퀵메뉴 버튼 클릭
        $(document).off('click.copybot_quick_btn').on('click.copybot_quick_btn', 
            '.copybot_quick_btn_small, .copybot_quick_btn_mini, .copybot_quick_btn_third', 
            function(e) {
            e.stopPropagation();
            const action = $(this).data('action');
            handleQuickAction(action);
        });

        // 외부 클릭시 퀵메뉴 닫기 (고정 모드면 안 닫힘)
        $(document).off('mousedown.copybot_quick_outside').on('mousedown.copybot_quick_outside', function(e) {
            const $menu = $('#copybot_quick_menu');
            if ($menu.is(':visible') && 
                !$(e.target).closest('#copybot_quick_menu').length && 
                !$(e.target).closest('#copybot_wand_container').length &&
                !$(e.target).closest('#extensionsMenu').length) {
                
                // 고정 모드가 아닐 때만 닫기
                if (!isPinned) {
                    hideQuickMenu();
                }
                // 고정 모드면 아무것도 안 함 (Observer가 drawer 감지해서 처리)
            }
        });
		
		// 고정/미니 토글 버튼
        $(document).off('click.copybot_quick_toggle').on('click.copybot_quick_toggle', '.copybot_quick_toggle', function(e) {
            e.stopPropagation();
            const $btn = $(this);
            const id = $btn.attr('id');
            
            // 토글 상태 변경
            const isActive = $btn.attr('data-active') === 'true';
            $btn.attr('data-active', !isActive);
            
            if (id === 'copybot_quick_pin') {
                isPinned = !isActive;
                debugLog('고정 모드:', isPinned);
            } else if (id === 'copybot_quick_mini') {
                isMiniMode = !isActive;
                $('#copybot_quick_menu').toggleClass('copybot_quick_menu_mini', isMiniMode);
                debugLog('미니 모드:', isMiniMode);
            }
            
            // 설정 저장
            saveSettings();
        });

        // 아이콘 버튼 (설정, 닫기)
        $(document).off('click.copybot_quick_icon').on('click.copybot_quick_icon', '.copybot_quick_icon_btn', function(e) {
            e.stopPropagation();
            const action = $(this).data('action');
            if (action === 'close_menu') {
                hideQuickMenu();
            } else {
                handleQuickAction(action);
            }
        });
		
		// 실리 메뉴 열림/닫힘 감지 (고정 모드일 때 퀵메뉴 복원)
        setupSillyTavernMenuObserver();
		
        // ESC 키로 닫기
        $(document).off('keydown.copybot_quick_esc').on('keydown.copybot_quick_esc', function(e) {
            if (e.key === 'Escape' && $('#copybot_quick_menu').is(':visible')) {
                hideQuickMenu();
            }
        });

        // 복사 범위 입력 변경 시 상태 초기화
        $(document).off('input.copybot_copy_range').on('input.copybot_copy_range', '#copybot_quick_copy_start, #copybot_quick_copy_end', function() {
            const $copyBtn = $('[data-action="copy_range"]');
            const $copyHint = $('#copybot_quick_copy_hint');
            
            // 범위가 입력되면 "전체 복사" 모드 해제
            $copyBtn.html('<i class="fa-solid fa-copy"></i> 복사');
            $copyBtn.removeAttr('data-mode');
            $copyHint.hide();
        });

        debugLog('✅ 마법봉 퀵메뉴 이벤트 핸들러 설정 완료');
    }


	// ===================================================================
    // 👁️ 실리 메뉴 감지 (고정 모드 복원용)
    // ===================================================================

    let sillyMenuObserver = null;
    let isMenuTemporarilyHidden = false;
    let lastVisibleDrawerCount = 0; // 마지막으로 확인된 열린 drawer 수

    /**
     * 실리타번 메뉴 열림/닫힘 감지
     * drawer-toggle 클릭 이벤트를 직접 감지하고 타이머로 상태 체크
     */
    function setupSillyTavernMenuObserver() {
        
        /**
         * 현재 열린 drawer 수 확인
         */
        function getOpenDrawerCount() {
            let count = 0;
            $('.drawer-content').each(function() {
                const $this = $(this);
                if (!$this.closest('#copybot_quick_menu').length && 
                    !$this.closest('#extensionsMenu').length &&
                    $this.is(':visible')) {
                    count++;
                }
            });
            return count;
        }
        
        /**
         * 퀵메뉴 상태 체크 및 복원
         */
        function checkAndRestoreIfNeeded() {
            if (!isPinned || !isMenuTemporarilyHidden) return;
            
            const currentCount = getOpenDrawerCount();
            debugLog('상태 체크:', { currentCount, isMenuTemporarilyHidden, isPinned });
            
            // 모든 drawer가 닫혔으면 퀵메뉴 복원
            if (currentCount === 0) {
                showQuickMenu();
                isMenuTemporarilyHidden = false;
                debugLog('🔼 퀵메뉴 복원됨');
            }
        }
        
        /**
         * 퀵메뉴 숨기기 (일시적)
         */
        function hideQuickMenuTemporarily() {
            if (!isPinned) return;
            
            const $quickMenu = $('#copybot_quick_menu');
            if ($quickMenu.is(':visible')) {
                isMenuTemporarilyHidden = true;
                $quickMenu.hide();
                debugLog('🔽 퀵메뉴 일시 숨김');
            }
        }
        
        // drawer-toggle 클릭 감지 (열기/닫기 모두)
        $(document).off('click.copybot_drawer_detect').on('click.copybot_drawer_detect', '.drawer-toggle', function() {
            if (!isPinned) return;
            
            const $quickMenu = $('#copybot_quick_menu');
            const isQuickMenuVisible = $quickMenu.is(':visible');
            
            // 현재 퀵메뉴가 보이면 → 잠시 후 drawer가 열렸는지 체크
            if (isQuickMenuVisible) {
                setTimeout(() => {
                    const openCount = getOpenDrawerCount();
                    if (openCount > 0) {
                        hideQuickMenuTemporarily();
                    }
                }, 150);
            }
            // 퀵메뉴가 숨겨진 상태면 → 잠시 후 drawer가 닫혔는지 체크
            else if (isMenuTemporarilyHidden) {
                setTimeout(checkAndRestoreIfNeeded, 300);
            }
        });
        
        // 화면 어디든 클릭 시 drawer 닫힘 체크 (drawer 외부 클릭으로 닫히는 경우)
        $(document).off('click.copybot_restore_check').on('click.copybot_restore_check', function(e) {
            if (!isPinned || !isMenuTemporarilyHidden) return;
            
            // drawer-toggle이나 drawer-content 클릭이 아니면
            if (!$(e.target).closest('.drawer-toggle').length && 
                !$(e.target).closest('.drawer-content').length) {
                // 잠시 후 체크 (drawer 닫히는 애니메이션 대기)
                setTimeout(checkAndRestoreIfNeeded, 300);
            }
        });
        
        // 초기 상태 기록
        lastVisibleDrawerCount = getOpenDrawerCount();
        
        debugLog('✅ 실리 메뉴 감지 설정 완료 (v4 - 클릭 이벤트 방식)');
    }


    /**
     * 퀵메뉴 복원 체크 (팝업용 - drawer는 Observer에서 처리)
     */
    function checkAndRestoreQuickMenu() {
        // 이 함수는 이제 팝업 닫힘 시에만 사용
        // drawer 감지는 setupSillyTavernMenuObserver에서 처리
    }

    // ===================================================================
    // 🔧 퀵메뉴 제어
    // ===================================================================

    /**
     * 퀵메뉴 토글
     */
    function toggleQuickMenu(triggerElement) {
        const $menu = $('#copybot_quick_menu');
        
        if ($menu.is(':visible')) {
            hideQuickMenu();
        } else {
            showQuickMenu(triggerElement);
        }
    }

    /**
     * 퀵메뉴 표시
     * @param {HTMLElement} triggerElement - 클릭된 요소 (사용하지 않음, 호환성 유지)
     */
    function showQuickMenu(triggerElement) {
        const $menu = $('#copybot_quick_menu');

        // UI 상태와 변수 동기화
        $('#copybot_quick_pin').attr('data-active', isPinned);
        $('#copybot_quick_mini').attr('data-active', isMiniMode);
        $menu.toggleClass('copybot_quick_menu_mini', isMiniMode);

        // 화면 좌상단 고정 위치
        $menu.css({
            position: 'fixed',
            top: 5,
            left: 5,
            transform: 'none',
            zIndex: 10001
        }).fadeIn(150);

        debugLog('퀵메뉴 열림');
    }

    /**
     * 퀵메뉴 숨기기
     * 설정(고정/미니)은 변경하지 않음 - 토글 버튼에서만 변경됨
     */
    function hideQuickMenu() {
        $('#copybot_quick_menu').fadeOut(100);
        debugLog('퀵메뉴 닫힘');
    }

    /**
     * 퀵메뉴 표시 여부
     */
    function isQuickMenuVisible() {
        return $('#copybot_quick_menu').is(':visible');
    }

    // ===================================================================
    // ⚡ 퀵액션 처리
    // ===================================================================

    /**
     * 퀵액션 실행
     */
    function handleQuickAction(action) {
        debugLog('퀵액션 실행:', action);
        
        // 메시지 범위 정보 가져오기
        const msgRange = callbacks.getMessageRange ? callbacks.getMessageRange() : { lastIndex: 0 };
        
        switch(action) {
            // === 📍 이동 ===
            case 'jump_first':
                if (confirm('첫 메시지로 이동합니다.\n\n채팅이 많을 경우 렉이 발생할 수 있습니다.\n정말 이동하시겠습니까?')) {
                    if (callbacks.executeSimpleCommand) {
                        callbacks.executeSimpleCommand('/chat-jump 0', '첫 메시지로 이동!');
                    }
                } else {
                    return; // 메뉴 닫지 않음
                }
                break;
                
            case 'jump_last':
                if (callbacks.executeSimpleCommand) {
                    callbacks.executeSimpleCommand('/chat-jump {{lastMessageId}}', '마지막 메시지로 이동!');
                }
                break;
                
            case 'jump_to':
                const jumpNum = $('#copybot_quick_jump_num').val();
                if (!jumpNum) {
                    toastr.warning('이동할 메시지 번호를 입력하세요');
                    return; // 메뉴 닫지 않음
                }
                if (callbacks.executeSimpleCommand) {
                    callbacks.executeSimpleCommand(`/chat-jump ${jumpNum}`, `메시지 #${jumpNum}로 이동!`);
                }
                $('#copybot_quick_jump_num').val(''); // 입력값 초기화
                break;
            
            // === ✏️ 작성 ===
            case 'remove_tags':
                if (callbacks.removeTagsFromElement) {
                    callbacks.removeTagsFromElement('#send_textarea');
                }
                break;
            
            case 'delete_last':
                if (callbacks.executeSimpleCommand) {
                    callbacks.executeSimpleCommand('/del 1', '마지막 메시지 삭제');
                }
                break;
                
            case 'delete_regen':
                if (callbacks.smartDeleteAndRegenerate) {
                    callbacks.smartDeleteAndRegenerate();
                }
                break;
            
            // === 📝 복사 ===
            case 'copy_range':
                const copyStart = $('#copybot_quick_copy_start').val();
                const copyEnd = $('#copybot_quick_copy_end').val();
                const $copyHint = $('#copybot_quick_copy_hint');
                const $copyBtn = $('[data-action="copy_range"]');
                
                // 범위가 지정되지 않은 상태에서 첫 번째 클릭 → 전체 범위 자동 설정
                if (!copyStart && !copyEnd && $copyBtn.attr('data-mode') !== 'all') {
                    $('#copybot_quick_copy_start').val('0');
                    $('#copybot_quick_copy_end').val(msgRange.lastIndex);
                    $copyHint.text('전체 범위 설정됨 - 다시 누르면 복사 실행').show();
                    $copyBtn.attr('data-mode', 'all');
                    return; // 메뉴 닫지 않음
                }
                
                // 복사 실행
                const actualStart = $('#copybot_quick_copy_start').val() || '0';
                const actualEnd = $('#copybot_quick_copy_end').val() || msgRange.lastIndex;
                
                // 전체 복사 모드 확인창
                if ($copyBtn.attr('data-mode') === 'all') {
                    if (!confirm('전체 메시지를 복사합니다.\n대화가 길 경우 잠시 멈출 수 있습니다.\n\n계속하시겠습니까?')) {
                        return; // 메뉴 닫지 않음
                    }
                }
                
                // 클립보드 복사 + 텍스트박스 삽입 (확장 패널 자동 열림 없음)
                if (callbacks.executeCopyCommand) {
                    callbacks.executeCopyCommand(actualStart, actualEnd);
                }
                
                // 상태 초기화
                $copyHint.hide();
                $copyBtn.html('<i class="fa-solid fa-copy"></i><span class="copybot_btn_text">복사</span>');
                $copyBtn.removeAttr('data-mode');
                $('#copybot_quick_copy_start').val('');
                $('#copybot_quick_copy_end').val('');
                break;
            
            // === 👁️ 숨기기/보이기 ===
            case 'hide_messages':
                const hideStart = $('#copybot_quick_hide_start').val();
                const hideEnd = $('#copybot_quick_hide_end').val();
                if (!hideStart && !hideEnd) {
                    toastr.warning('숨길 메시지 범위를 입력하세요');
                    return;
                }
                const hideStartNum = parseInt(hideStart) || 0;
                const hideEndNum = parseInt(hideEnd) || msgRange.lastIndex;
                if (callbacks.executeHideCommand) {
                    callbacks.executeHideCommand(hideStartNum, hideEndNum);
                }
                $('#copybot_quick_hide_start').val('');
                $('#copybot_quick_hide_end').val('');
                break;
                
            case 'unhide_messages':
                const unhideStart = $('#copybot_quick_hide_start').val();
                const unhideEnd = $('#copybot_quick_hide_end').val();
                if (!unhideStart && !unhideEnd) {
                    toastr.warning('보일 메시지 범위를 입력하세요');
                    return;
                }
                const unhideStartNum = parseInt(unhideStart) || 0;
                const unhideEndNum = parseInt(unhideEnd) || msgRange.lastIndex;
                if (callbacks.executeUnhideCommand) {
                    callbacks.executeUnhideCommand(unhideStartNum, unhideEndNum);
                }
                $('#copybot_quick_hide_start').val('');
                $('#copybot_quick_hide_end').val('');
                break;
            
            // === 🗑️ 다중 삭제 ===
            case 'multi_delete':
                const delStart = $('#copybot_quick_del_start').val();
                const delEnd = $('#copybot_quick_del_end').val();
                if (!delStart || !delEnd) {
                    toastr.warning('삭제할 메시지 범위를 입력하세요');
                    return;
                }
                // 확인창 (백업 경고 포함)
                if (confirm(`⚠️ 메시지 ${delStart}~${delEnd} 삭제\n\n삭제된 메시지는 복구할 수 없습니다!\n실행 전 반드시 채팅을 백업하세요.\n\n정말 삭제하시겠습니까?`)) {
                    if (callbacks.executeSimpleCommand) {
                        callbacks.executeSimpleCommand(`/cut ${delStart}-${delEnd}`, `메시지 ${delStart}~${delEnd} 삭제 완료`);
                    }
                    $('#copybot_quick_del_start').val('');
                    $('#copybot_quick_del_end').val('');
                } else {
                    return; // 메뉴 닫지 않음
                }
                break;
            
            // === ⚙️ 설정 ===
            case 'open_settings':
                openCopybotSettings();
                break;
                
            default:
                debugLog('알 수 없는 퀵액션:', action);
        }
        
        // 고정 모드가 아닐 때만 퀵메뉴 닫기
        if (!isPinned) {
            hideQuickMenu();
        }
    }

    /**
	 * 섹션 표시/숨김 적용
	 */
	function applySectionVisibility() {
		const sectionIds = ['jump', 'write', 'copy', 'hide', 'multi_delete'];
		
		sectionIds.forEach(sectionId => {
			const isVisible = $(`#copybot_qm_section_${sectionId}`).is(':checked');
			const $section = $(`#copybot_quick_menu [data-section="${sectionId}"]`);
			
			if (isVisible) {
				$section.show();
			} else {
				$section.hide();
			}
		});
		
		// 마지막 보이는 섹션에 _last 클래스 재적용
		updateLastSectionClass();
		
		debugLog('섹션 표시/숨김 적용 완료');
	}

	/**
	 * 마지막 보이는 섹션에 _last 클래스 적용 (테두리 처리)
	 */
	function updateLastSectionClass() {
		const $sections = $('#copybot_quick_menu .copybot_quick_menu_section:visible');
		
		// 기존 _last 클래스 제거
		$('#copybot_quick_menu .copybot_quick_menu_section').removeClass('copybot_quick_menu_section_last');
		
		// 마지막 보이는 섹션에 클래스 추가
		if ($sections.length > 0) {
			$sections.last().addClass('copybot_quick_menu_section_last');
		}
	}

	/**
	 * 퀵메뉴 팝업 내 아이콘 갱신 (편의기능 아이콘 변경 시 호출)
	 */
	function updateQuickMenuIcons() {
		const tagRemoveIcon = getIconClass('copybot_tag_remove_icon_picker', 'fa-tags');
		const deleteIcon = getIconClass('copybot_delete_icon_picker', 'fa-trash');
		const deleteRegenIcon = getIconClass('copybot_delete_regenerate_icon_picker', 'fa-redo');

		// 퀵메뉴 팝업 내 아이콘 업데이트
		$('#copybot_quick_menu [data-icon-type="tag_remove"]')
			.removeClass()
			.addClass(`fa-solid ${tagRemoveIcon}`)
			.attr('data-icon-type', 'tag_remove');
		
		$('#copybot_quick_menu [data-icon-type="delete"]')
			.removeClass()
			.addClass(`fa-solid ${deleteIcon}`)
			.attr('data-icon-type', 'delete');
		
		$('#copybot_quick_menu [data-icon-type="delete_regen"]')
			.removeClass()
			.addClass(`fa-solid ${deleteRegenIcon}`)
			.attr('data-icon-type', 'delete_regen');

		debugLog('퀵메뉴 아이콘 갱신 완료:', { tagRemoveIcon, deleteIcon, deleteRegenIcon });
	}

	/**
	 * 깡갤 복사기 설정 패널 열기
	 */
	function openCopybotSettings() {
        // Extensions 메뉴 닫기
        $('#extensionsMenu').hide();
        
        // 퀵메뉴 일시 숨김 (Observer가 drawer 열림을 감지하면 자동 처리됨)
        // 여기서 미리 숨기면 깜빡임 방지
        if (isPinned && $('#copybot_quick_menu').is(':visible')) {
            isMenuTemporarilyHidden = true;
            $('#copybot_quick_menu').hide();
        }
        
        // 사이드바에서 확장 프로그램 탭 열기
        const $extensionsDrawer = $('#extensions_settings2').closest('.drawer-content');
        const $drawerToggle = $extensionsDrawer.siblings('.drawer-toggle');
        
        if ($drawerToggle.length) {
            $drawerToggle.trigger('click');
        }
        
        // 깡갤 복사기 설정 패널로 스크롤 및 열기
        setTimeout(() => {
            const $copybotSettings = $('#copybot_settings');
            if ($copybotSettings.length) {
                // inline-drawer가 닫혀있으면 열기
                const $inlineDrawer = $copybotSettings.find('.inline-drawer-content');
                if (!$inlineDrawer.is(':visible')) {
                    $copybotSettings.find('.inline-drawer-header').trigger('click');
                }
                
                // 스크롤
                setTimeout(() => {
                    $copybotSettings[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
        }, 300);
        
        debugLog('설정 패널 열기');
    }

    // ===================================================================
    // 🚀 모듈 초기화
    // ===================================================================

    /**
     * 모듈 초기화
     */
    function init(options = {}) {
        if (isInitialized) {
            debugLog('WandMenu 모듈 이미 초기화됨');
            return;
        }

        isDebugMode = options.isDebugMode || false;
        callbacks = options.callbacks || {};

        debugLog('🪄 WandMenu 모듈 초기화 시작');

        // 저장된 설정 로드
        loadSettings();

        // 이벤트 핸들러 설정 (메뉴 등록 전에 설정)
        setupEvents();

        // 퀵메뉴 팝업 미리 생성 (입력필드 아이콘용 - 마법봉 없이도 사용 가능)
        createQuickMenuPopup();

        // Extensions 메뉴가 열릴 때마다 등록 시도
        $(document).off('click.copybot_wand_register').on('click.copybot_wand_register', '#extensionsMenuButton', function() {
            setTimeout(() => {
                registerWandMenu();
            }, 100);
        });

        // 퀵메뉴 설정 변경 시 마법봉 메뉴 등록/해제
        $(document).off('change.copybot_wand_settings').on('change.copybot_wand_settings', '#copybot_quickmenu_wand', function() {
            setTimeout(() => {
                registerWandMenu();
            }, 100);
        });
        
        // 퀵메뉴 토글 변경 시에도 처리
		$(document).off('click.copybot_wand_toggle').on('click.copybot_wand_toggle', '#copybot_quickmenu_toggle', function() {
			setTimeout(() => {
				registerWandMenu();
			}, 200);
		});


        isInitialized = true;
        debugLog('✅ WandMenu 모듈 초기화 완료');
    }

    /**
     * 콜백 업데이트 (나중에 기능 연동 시 사용)
     */
    function updateCallbacks(newCallbacks) {
        callbacks = { ...callbacks, ...newCallbacks };
        debugLog('콜백 업데이트됨:', Object.keys(newCallbacks));
    }

    // ===================================================================
    // 🌐 전역 공개
    // ===================================================================

    window.CopyBotWandMenu = {
		init: init,
		registerWandMenu: registerWandMenu,
		setupEvents: setupEvents,
		toggleQuickMenu: toggleQuickMenu,
		showQuickMenu: showQuickMenu,
		hideQuickMenu: hideQuickMenu,
		isQuickMenuVisible: isQuickMenuVisible,
		handleQuickAction: handleQuickAction,
		openCopybotSettings: openCopybotSettings,
		updateCallbacks: updateCallbacks,
		updateQuickMenuIcons: updateQuickMenuIcons,
		applySectionVisibility: applySectionVisibility
	};

    console.log('📦 CopyBotWandMenu 모듈 로드됨');

})();