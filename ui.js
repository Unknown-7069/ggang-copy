// 깡갤 복사기 UI 이벤트 및 상호작용 관리 모듈
// 모든 UI 이벤트 핸들링, 동적 버튼 관리, 사용자 상호작용 제어
(function() {
    'use strict';

    // 모듈 내부 변수
    let dependencies = {};
    let isDebugMode = false;
    
    // 콜백 함수들 (의존성 주입으로 받을 예정)
    let callbacks = {
        // utils 모듈 함수들
        debugLog: null,
        escapeHtml: null,
        getLastMessageIndex: null,
        
        // settings 모듈 함수들
        saveSettings: null,
        removeResizeHandle: null,
        restoreResizeHandle: null,
        hidePlaceholder: null,
        restorePlaceholder: null,
        safeApplyPlaceholderSetting: null,
        
        // presets 모듈 함수들
        loadPreset: null,
        saveCurrentPreset: null,
        addNewPreset: null,
        deletePreset: null,
        renamePreset: null,
        copyCurrentPreset: null,
        setActivePreset: null,
        getActivePreset: null,
        updatePresetDropdown: null,
        enterPresetEditMode: null,
        exitPresetEditMode: null,
        updatePresetEditButtonState: null,
        openReorderModal: null,
        closeReorderModal: null,
        reorderPresets: null,
        
        // commands 모듈 함수들
        executeSimpleCommand: null,
        executeCopyCommand: null,
        removeTagsFromElement: null,
        copyTextboxContent: null,
        triggerCacheBustRegeneration: null,
        
        // icons 모듈 함수들
        safeUpdateInputFieldIcons: null,
        
        // profiles 모듈 함수들
        enableHighQualityProfiles: null,
        disableHighQualityProfiles: null,
        loadGhostwriteProfiles: null,
        
        // ghostwrite 모듈 함수들
        executeGhostwrite: null,
        addTempPromptField: null,
        updateTempPromptStyle: null,
        saveTempPrompt: null,
        loadTempPrompt: null,
        scheduleDebounceAutoSave: null,
        scheduleImmediateAutoSave: null,
        showStatusIcon: null,
        
        // messageOperations 모듈 함수들
        executeHideCommand: null,
        executeUnhideCommand: null,
        executeMultiDelete: null,
        getMessageRange: null,
        validateMessageIndices: null
    };

    // 전역 네임스페이스 생성
    window.CopyBotUI = {
        
        // === 모듈 초기화 ===
        init: function(deps) {
            try {
                dependencies = deps || {};
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
                
                if (isDeleteEnabled || isRegenEnabled) {
                    $('#copybot_confirm_delete_item').slideDown(200);
                } else {
                    $('#copybot_confirm_delete_item').slideUp(200);
                }
            } catch (error) {
                console.error('CopyBotUI: updateActionButtons 실패', error);
            }
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
                    const escapeHtml = callbacks.escapeHtml || ((str) => str);
                    toastr.success(`'${escapeHtml(oldName)}' -> '${escapeHtml(newName)}'(으)로 이름이 변경되었습니다.`);
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
                
                const escapeHtml = callbacks.escapeHtml || ((str) => str);
                if (confirm(`'${escapeHtml(nameToDelete)}' 프리셋을 정말 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
                    if (callbacks.deletePreset && callbacks.deletePreset(nameToDelete)) {
                        toastr.success(`'${escapeHtml(nameToDelete)}' 프리셋이 삭제되었습니다.`);
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

            // 대필이 진행중일 때 중단 버튼을 누르면 작동하는 코드
            $(document).off('click', '#send_but.generation_progress').on('click', '#send_but.generation_progress', () => {
                if (callbacks.isGhostwritingActive && callbacks.isGhostwritingActive()) {
                    if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '대필 중단 버튼 클릭 감지! 중단 신호 보냅니다.');
                    
                    if (callbacks.setGhostwritingActive) callbacks.setGhostwritingActive(false);

                    try {
                        if (typeof window.stopGeneration === 'function') {
                            window.stopGeneration();
                            if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, 'SillyTavern의 stopGeneration() 함수를 직접 호출했습니다.');
                        }
                    } catch (e) {
                        console.error('stopGeneration 호출 실패', e);
                    }
                    
                    const originalProfile = callbacks.getGhostwriteOriginalProfile ? callbacks.getGhostwriteOriginalProfile() : null;
                    if (originalProfile && callbacks.switchProfile) {
                        if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, `즉시 프로필 원복 시도: ${originalProfile}`);
                        callbacks.switchProfile(originalProfile, true);
                        toastr.info('대필을 중단하고 원래 프로필로 복원합니다.');
                    }
                }
            });
            
            const eventMap = {
                '#copybot_execute': () => {
                    let startPos = parseInt($("#copybot_start").val());
                    let endPos = parseInt($("#copybot_end").val());
                    
                    const startEmpty = isNaN(startPos) || $("#copybot_start").val().trim() === '';
                    const endEmpty = isNaN(endPos) || $("#copybot_end").val().trim() === '';
                    
                    if (startEmpty || endEmpty) {
                        if (startEmpty) $("#copybot_start").val(0);
                        if (endEmpty) $("#copybot_end").val(callbacks.getLastMessageIndex ? callbacks.getLastMessageIndex() : 0);
                        toastr.info(`범위가 지정되지않아 자동으로 전체 범위로 설정되었습니다. 다시 복사 버튼을 눌러주세요.`);
                        return;
                    }
                    
                    const actualLastIndex = callbacks.getLastMessageIndex ? callbacks.getLastMessageIndex() : 0;
                    if (endPos > actualLastIndex) {
                        endPos = actualLastIndex;
                        $("#copybot_end").val(endPos);
                        toastr.warning(`종료위치가 마지막 메시지(${actualLastIndex}번)로 자동 조정되었습니다.`);
                    }
                    
                    if (startPos > endPos) { toastr.error('시작위치는 종료위치보다 작아야 합니다.'); return; }
                    if (startPos < 0) { toastr.error('시작위치는 0 이상이어야 합니다.'); return; }
                    if (callbacks.executeCopyCommand) callbacks.executeCopyCommand(startPos, endPos);
                },
                '#copybot_hide_execute': () => {
                    const startPos = parseInt($("#copybot_hide_start").val());
                    const endPos = parseInt($("#copybot_hide_end").val());

                    if (isNaN(startPos) || isNaN(endPos)) {
                        toastr.error('올바른 시작위치와 종료위치를 숫자로 입력해주세요.');
                        return;
                    }
                    if (startPos < 0 || startPos > endPos) {
                        toastr.error('올바른 범위를 입력해주세요.');
                        return;
                    }

                    if (callbacks.executeHideCommand) {
                        callbacks.executeHideCommand(startPos, endPos);
                    } else {
                        toastr.error('메시지 숨기기 기능을 사용할 수 없습니다.');
                    }
                },
                '#copybot_unhide_execute': () => {
                    const startPos = parseInt($("#copybot_hide_start").val());
                    const endPos = parseInt($("#copybot_hide_end").val());

                    if (isNaN(startPos) || isNaN(endPos)) {
                        toastr.error('올바른 시작위치와 종료위치를 숫자로 입력해주세요.');
                        return;
                    }
                    if (startPos < 0 || startPos > endPos) {
                        toastr.error('올바른 범위를 입력해주세요.');
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
                    const startPos = parseInt($("#copybot_multi_delete_start").val());
                    const endPos = parseInt($("#copybot_multi_delete_end").val());

                    if (isNaN(startPos) || isNaN(endPos)) {
                        toastr.error('올바른 시작위치와 종료위치를 숫자로 입력해주세요.');
                        return;
                    }
                    if (startPos < 0 || startPos > endPos) {
                        toastr.error('올바른 범위를 입력해주세요.');
                        return;
                    }

                    const messageCount = endPos - startPos + 1;
                    if (confirm(`메시지 #${startPos}부터 #${endPos}까지, 총 ${messageCount}개를 영구적으로 삭제합니다.\n\n이 작업은 되돌릴 수 없습니다! 정말로 삭제하시겠습니까?`)) {
                        if (callbacks.executeSimpleCommand) callbacks.executeSimpleCommand(`/cut ${startPos}-${endPos}`, `메시지 ${startPos}~${endPos} 삭제 명령을 실행했습니다.`);
                    } else {
                        toastr.info('메시지 삭제가 취소되었습니다.');
                    }
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
                '#copybot_jump_first': () => {
                    if (confirm("첫 메시지로 이동합니다.\n\n채팅이 많을 경우 렉이 발생할 수 있습니다.\n정말 이동하시겠습니까?")) {
                        if (callbacks.executeSimpleCommand) callbacks.executeSimpleCommand('/chat-jump 0', '첫 메시지로 이동!');
                    } else {
                        toastr.info('이동이 취소되었습니다.');
                    }
                },
                '#copybot_jump_last': () => { if (callbacks.executeSimpleCommand) callbacks.executeSimpleCommand('/chat-jump {{lastMessageId}}', '마지막 메시지로 이동!'); },
                '#copybot_jump_to': () => {
                    const jumpNumber = parseInt($("#copybot_jump_number").val());
                    if (isNaN(jumpNumber) || jumpNumber < 0) { toastr.error('올바른 메시지 번호를 입력해주세요.'); return; }
                    if (callbacks.executeSimpleCommand) callbacks.executeSimpleCommand(`/chat-jump ${jumpNumber}`, `메시지 #${jumpNumber}로 이동!`);
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
                '#copybot_open_misc_button': (e) => { 
                    e.stopPropagation(); 
                    const isCurrentlyVisible = $('#copybot_misc_panel').is(':visible');
                    $('#copybot_ghostwrite_panel, #copybot_settings_panel, #copybot_message_operations_panel, #copybot_quickmenu_panel').slideUp(200); 
                    $('#copybot_misc_panel').slideToggle(200, () => { 
                        if (callbacks.saveSettings) callbacks.saveSettings(); 
                    });
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
						$('#copybot_ghostwrite_position_options, #copybot_ghostwrite_textbox, #copybot_ghostwrite_exclude_container, #copybot_ghostwrite_panel .copybot_description').slideToggle(newState);
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
                        'copybot_hq_profile_toggle': () => newState ? (callbacks.enableHighQualityProfiles && callbacks.enableHighQualityProfiles()) : (callbacks.disableHighQualityProfiles && callbacks.disableHighQualityProfiles()),
                        'copybot_remove_resize_toggle': () => newState ? (callbacks.removeResizeHandle && callbacks.removeResizeHandle()) : (callbacks.restoreResizeHandle && callbacks.restoreResizeHandle()),
                        'copybot_hide_placeholder_toggle': () => newState ? (callbacks.hidePlaceholder && callbacks.hidePlaceholder()) : (callbacks.restorePlaceholder && callbacks.restorePlaceholder()),
                        'copybot_confirm_delete_toggle': () => { /* 설정 저장만 수행하면 되므로 추가 동작 없음 */ },
                        'copybot_debug_mode_toggle': () => { 
                            isDebugMode = newState; 
                            $('#copybot_debug_info').slideToggle(newState);
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
                    };
                    const defaultAction = () => $(`#${button.attr('id').replace('_toggle', '_options')}`).slideToggle(newState);
                    (actions[button.attr('id')] || defaultAction)();
                    
                    // this 대신 window.CopyBotUI 직접 호출
                    if (window.CopyBotUI && window.CopyBotUI.updateActionButtons) {
                        window.CopyBotUI.updateActionButtons();
                    }
                    if (callbacks.safeUpdateInputFieldIcons) callbacks.safeUpdateInputFieldIcons();
                    if (callbacks.saveSettings) callbacks.saveSettings();
                },
                '.copybot_action_button': function() {
                    const actions = {
                        'copybot_action_remove_tags': () => { if (callbacks.removeTagsFromElement) callbacks.removeTagsFromElement('#send_textarea'); },
                        'copybot_action_delete_last': () => { if (callbacks.executeSimpleCommand) callbacks.executeSimpleCommand('/del 1', '마지막 메시지 1개를 삭제했습니다.'); },
                        'copybot_action_delete_regen': () => { if (callbacks.executeSimpleCommand) callbacks.executeSimpleCommand('/del 1', '마지막 메시지를 삭제하고 재생성합니다.', callbacks.triggerCacheBustRegeneration); }
                    };
                    const action = actions[$(this).attr('id')];
                    if (action) action();
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

			// ===== 퀵메뉴 설정 이벤트 핸들러 =====

			// 퀵메뉴 버튼 클릭 - 패널 토글
			$(document).off('click', '#copybot_open_quickmenu_button').on('click', '#copybot_open_quickmenu_button', function() {
				const $quickmenuPanel = $('#copybot_quickmenu_panel');
				const isVisible = $quickmenuPanel.is(':visible');
				
				// 모든 설정 패널 닫기
				$('.copybot_settings_panel').slideUp(200);
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

            // 하이브리드 자동저장 - 프로필 선택 드롭다운 이벤트 (피드백 기능 추가)
            $(document).off('change', '#copybot_ghostwrite_profile_select').on('change', '#copybot_ghostwrite_profile_select', function() {
                // 프로필 변경: 즉시 저장
                if (callbacks.scheduleImmediateAutoSave) callbacks.scheduleImmediateAutoSave('profile', 'change');
                
                // 🔥 9단계 신규: 프로필 변경 시 즉시 피드백 표시
                if (callbacks.showStatusIcon) callbacks.showStatusIcon('profile', false); // ✅ 표시 후 페이드아웃
                if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '프로필 변경됨, 피드백 표시');
                
                // 기존 일반 설정 저장도 유지
                if (callbacks.saveSettings) callbacks.saveSettings();
                
                // 프로필 변경 시 현재 활성 프리셋이 있다면 자동 저장할지 묻기 (선택사항)
                const activePreset = callbacks.getActivePreset ? callbacks.getActivePreset() : null;
                const currentPreset = $('#copybot_preset_select').val();
                if (activePreset && currentPreset && activePreset === currentPreset && currentPreset !== '기본 프리셋') {
                    if (isDebugMode && callbacks.debugLog) {
                        callbacks.debugLog(true, '프로필이 변경됨, 현재 활성 프리셋:', activePreset);
                    }
                }
            });

			// === 아이콘 피커 클릭 이벤트 (편의기능 3종) ===
            $(document).off('click', '.copybot_icon_picker').on('click', '.copybot_icon_picker', async function() {
                const $picker = $(this);
                const currentIcon = $picker.data('icon') || $picker.attr('data-default');
                const defaultIcon = $picker.attr('data-default');
                
                try {
                    // ST 내장 아이콘 피커 동적 import
                    const { showFontAwesomePicker } = await import('/scripts/utils.js');
                    
                    // 피커 열리면 "No Icon" 버튼을 "기본값"으로 변경
                    setTimeout(() => {
                        const noIconBtn = document.querySelector('.popup .popup-button-ok');
                        if (noIconBtn && noIconBtn.textContent.trim() === 'No Icon') {
                            noIconBtn.textContent = '기본값';
                        }
                    }, 50);
                    
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
							window.CopyBotWandMenu.registerWandMenu();
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
                }
            });

            $(document).off('click', '#copybot_settings_panel, #copybot_ghostwrite_panel, #copybot_message_operations_panel, #copybot_misc_panel').on('click', (e) => e.stopPropagation());


            if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, '깡갤 복사기: 이벤트 핸들러 설정 완료');
        },

        // === 내부 헬퍼 함수들 ===
        
        // 디버그 로그 (콜백 함수 사용) - 내부에서 this 사용 제거
        debugLog: function(...args) {
            if (callbacks.debugLog && isDebugMode) {
                callbacks.debugLog(true, ...args);
            }
        },

        // HTML 이스케이프 (콜백 함수 사용)
        escapeHtml: function(str) {
            return callbacks.escapeHtml ? callbacks.escapeHtml(str) : (str || '');
        },

        // 모듈 상태 확인
        isInitialized: function() {
            return !!callbacks.debugLog;
        },

        // 콜백 함수 등록 (동적 추가용)
        registerCallback: function(name, fn) {
            if (typeof fn === 'function') {
                callbacks[name] = fn;
                if (callbacks.debugLog && isDebugMode) callbacks.debugLog(true, `콜백 함수 등록됨: ${name}`);
            }
        }
    };

    if (window.copybot_debug_mode) {
        console.log('CopyBotUI 모듈 로드 완료');
    }
})();