// 깡갤 복사기 확장프로그램
// SillyTavern용 자동 메시지 복사 도구

(function() {
    'use strict';

    console.log('🔥 깡갤 복사기: 스크립트 로드 시작!');

    let isInitialized = false;

    // settings.html 내용을 직접 포함 (404 오류 해결)
    const settingsHTML = `
    <div id="copybot_settings" class="extension_settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>📋 깡갤 복사기</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="copybot_panel">
                    <!-- 입력 섹션 -->
                    <div class="copybot_section">
                        <h5>📥 메시지 범위 입력</h5>
                        <small>메세지 범위 입력 후 단순 복사 버튼을 클릭하면 클립보드에 자동 복사&아래 텍스트박스에 해당 내용이 삽입됩니다.</small>
                        
                        <div class="copybot_input_row">
                            <div class="copybot_input_group">
                                <label for="copybot_start">시작위치:</label>
                                <input type="number" id="copybot_start" value="1" min="1" class="text_pole">
                            </div>
                            
                            <div class="copybot_input_group">
                                <label for="copybot_end">종료위치:</label>
                                <input type="number" id="copybot_end" value="10" min="1" class="text_pole">
                            </div>
                            
                            <button id="copybot_execute" class="menu_button" title="메시지를 클립보드에 복사하고 아래 텍스트박스에 표시">
                                단순 복사
                            </button>
                        </div>
                    </div>
                    
                    <!-- 결과 섹션 -->
                    <div class="copybot_section">
                        <div class="copybot_section_header">
                            <h5>📤 복사 결과 및 편집</h5>
                            <div class="copybot_header_buttons">
                                <button id="copybot_copy_content" class="copybot_small_button" title="현재 텍스트박스 내용을 클립보드에 복사" disabled>
                                    아래 내용 복사
                                </button>
                                <button id="copybot_remove_tags" class="copybot_small_button" title="텍스트박스에서 태그 제거" disabled>
                                    태그 제거
                                </button>
                            </div>
                        </div>
                        <textarea id="copybot_textbox" placeholder="복사된 내용이 여기에 표시됩니다..." readonly></textarea>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    // 메시지 복사 명령 실행 함수 (기존 방식 유지)
    async function executeCopyCommand(start, end) {
        try {
            // SillyTavern 명령어 구성
            const command = `/messages names=off ${start}-${end} | /copy`;
            
            console.log(`깡갤 복사기: 실행 중인 명령어 - ${command}`);
            
            // 방법 1: 채팅 입력창에 직접 입력하고 전송
            const chatInput = $('#send_textarea');
            if (chatInput.length > 0) {
                // 기존 텍스트 백업
                const originalText = chatInput.val();
                
                // 명령어 입력
                chatInput.val(command);
                chatInput.trigger('input');
                
                // 전송 버튼 클릭
                setTimeout(() => {
                    $('#send_but').click();
                    
                    // 원래 텍스트 복원 (명령어 실행 후)
                    setTimeout(() => {
                        if (originalText) {
                            chatInput.val(originalText);
                        }
                    }, 500);
                }, 100);
                
                toastr.success(`메시지 ${start}-${end} 복사 명령 실행!`);
                
                // 추가: 복사 완료 후 클립보드에서 내용을 읽어와서 텍스트박스에 표시
                setTimeout(async () => {
                    try {
                        // 클립보드에서 텍스트 읽기
                        const clipboardText = await navigator.clipboard.readText();
                        
                        if (clipboardText && clipboardText.trim()) {
                            // 텍스트박스에 원본 내용 표시 (태그 제거하지 않음)
                            $('#copybot_textbox').val(clipboardText);
                            $('#copybot_remove_tags').prop('disabled', false);
                            $('#copybot_copy_content').prop('disabled', false);
                            
                            console.log('깡갤 복사기: 텍스트박스에 내용 표시 완료');
                        }
                        
                    } catch (error) {
                        console.log('깡갤 복사기: 클립보드 읽기 실패 (권한 문제일 수 있음)', error);
                        // 클립보드 읽기 실패해도 기본 복사는 성공했으므로 에러 표시 안 함
                    }
                }, 2000); // 2초 후 클립보드 확인
                
            } else {
                toastr.error('채팅 입력창을 찾을 수 없습니다.');
                console.error('깡갤 복사기: #send_textarea 요소를 찾을 수 없음');
            }
            
        } catch (error) {
            console.error('깡갤 복사기 오류:', error);
            toastr.error('메시지 복사 중 오류가 발생했습니다.');
        }
    }

    // 텍스트박스 내용을 클립보드에 복사하는 함수 (간단한 버전)
    async function copyTextboxContent() {
        try {
            const textboxContent = $('#copybot_textbox').val();
            
            if (!textboxContent.trim()) {
                toastr.warning('텍스트박스에 복사할 내용이 없습니다.');
                return;
            }
            
            // 클립보드에 복사
            await navigator.clipboard.writeText(textboxContent);
            
            toastr.success('아래 내용이 클립보드에 복사되었습니다!');
            console.log('깡갤 복사기: 텍스트박스 내용 클립보드 복사 완료');
            
        } catch (error) {
            console.error('깡갤 복사기: 클립보드 복사 실패', error);
            
            // 클립보드 API 실패 시 fallback 방법
            try {
                const textArea = document.createElement('textarea');
                textArea.value = $('#copybot_textbox').val();
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                toastr.success('아래 내용이 클립보드에 복사되었습니다! (fallback)');
                console.log('깡갤 복사기: fallback 방법으로 클립보드 복사 완료');
                
            } catch (fallbackError) {
                console.error('깡갤 복사기: fallback 복사도 실패', fallbackError);
                toastr.error('클립보드 복사에 실패했습니다.');
            }
        }
    }

    // 텍스트박스에서 태그 제거 함수 (개선된 버전)
    function removeTagsFromTextbox() {
        try {
            const currentText = $('#copybot_textbox').val();
            
            if (!currentText.trim()) {
                toastr.warning('텍스트박스에 내용이 없습니다.');
                return;
            }
            
            console.log('깡갤 복사기: 태그 제거 시작, 원본 길이:', currentText.length);
            
            // 개선된 태그 제거 알고리즘
            let cleanedText = currentText;
            let iterationCount = 0;
            const maxIterations = 10; // 무한 루프 방지
            
            // 1단계: 여러 줄에 걸친 태그들을 반복적으로 제거
            while (iterationCount < maxIterations) {
                const previousText = cleanedText;
                
                // 여러 줄에 걸친 모든 태그 제거 (dotAll 플래그 사용)
                // stat, style, div, choices, tableEdit, disclaimer 등 모든 태그
                cleanedText = cleanedText.replace(/<([^>\/\s]+)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g, '');
                
                iterationCount++;
                
                // 더 이상 변화가 없으면 종료
                if (cleanedText === previousText) {
                    break;
                }
                
                console.log(`깡갤 복사기: 태그 제거 반복 ${iterationCount}, 현재 길이: ${cleanedText.length}`);
            }
            
            // 2단계: 남은 단독 태그들 제거 (자체 닫는 태그나 열린 태그)
            cleanedText = cleanedText.replace(/<[^>]*>/g, '');
            
            // 3단계: 연속된 빈 줄 정리
            cleanedText = cleanedText.replace(/\n\s*\n\s*\n/g, '\n\n');
            
            // 4단계: 앞뒤 공백 제거
            cleanedText = cleanedText.trim();
            
            console.log('깡갤 복사기: 태그 제거 완료, 최종 길이:', cleanedText.length);
            
            // 텍스트박스에 처리된 내용 표시
            $('#copybot_textbox').val(cleanedText);
            
            // 결과 알림
            if (cleanedText.length < currentText.length) {
                const removedChars = currentText.length - cleanedText.length;
                toastr.success(`태그 제거 완료! (${removedChars}자 제거됨)`);
            } else {
                toastr.info('제거할 태그가 없습니다.');
            }
            
            console.log('깡갤 복사기: 태그 제거 완료');
            
        } catch (error) {
            console.error('깡갤 복사기: 태그 제거 실패', error);
            toastr.error('태그 제거 중 오류가 발생했습니다.');
        }
    }

    // UI 이벤트 설정 함수
    function setupEventHandlers() {
        console.log('깡갤 복사기: 이벤트 핸들러 설정 시작');
        
        // 복사 실행 버튼 이벤트 핸들러
        $(document).off('click', '#copybot_execute').on('click', '#copybot_execute', function() {
            console.log('깡갤 복사기: 복사 버튼 클릭됨');
            
            const startPos = parseInt($("#copybot_start").val());
            const endPos = parseInt($("#copybot_end").val());

            // 입력값 검증
            if (isNaN(startPos) || isNaN(endPos)) {
                toastr.error('올바른 숫자를 입력해주세요.');
                return;
            }

            if (startPos > endPos) {
                toastr.error('시작위치는 종료위치보다 작아야 합니다.');
                return;
            }

            if (startPos < 1) {
                toastr.error('시작위치는 1 이상이어야 합니다.');
                return;
            }

            // 메시지 복사 명령 실행
            executeCopyCommand(startPos, endPos);
        });

        // 태그 제거 버튼 이벤트 핸들러
        $(document).off('click', '#copybot_remove_tags').on('click', '#copybot_remove_tags', function() {
            console.log('깡갤 복사기: 태그 제거 버튼 클릭됨');
            removeTagsFromTextbox();
        });

        // 아래 내용 복사 버튼 이벤트 핸들러
        $(document).off('click', '#copybot_copy_content').on('click', '#copybot_copy_content', function() {
            console.log('깡갤 복사기: 아래 내용 복사 버튼 클릭됨');
            copyTextboxContent();
        });

        // Enter 키 지원
        $(document).off('keypress', '#copybot_start, #copybot_end').on('keypress', '#copybot_start, #copybot_end', function(e) {
            if (e.which === 13) { // Enter key
                console.log('깡갤 복사기: Enter 키 감지');
                $("#copybot_execute").click();
            }
        });

        // 텍스트박스를 읽기 전용에서 편집 가능으로 변경
        $(document).off('focus', '#copybot_textbox').on('focus', '#copybot_textbox', function() {
            $(this).prop('readonly', false);
        });

        // 텍스트박스 내용 변경 시 버튼 상태 업데이트
        $(document).off('input', '#copybot_textbox').on('input', '#copybot_textbox', function() {
            const hasContent = $(this).val().trim().length > 0;
            $('#copybot_copy_content').prop('disabled', !hasContent);
            $('#copybot_remove_tags').prop('disabled', !hasContent);
        });
        
        console.log('깡갤 복사기: 이벤트 핸들러 설정 완료');
    }

    // 초기화 함수
    async function initialize() {
        if (isInitialized) return;
        isInitialized = true;
        
        console.log('깡갤 복사기: 초기화 시작...');
        
        try {
            // Extensions Settings에 HTML 추가
            if ($("#extensions_settings2").length > 0) {
                $("#extensions_settings2").append(settingsHTML);
                console.log('깡갤 복사기: UI 추가 성공');
                
                // 이벤트 핸들러 설정
                setupEventHandlers();
                
                console.log('깡갤 복사기: ✅ 초기화 완료!');
            } else {
                console.warn('깡갤 복사기: #extensions_settings2 요소를 찾을 수 없음');
                // 3초 후 재시도
                setTimeout(() => {
                    isInitialized = false;
                    initialize();
                }, 3000);
            }
        } catch(e) {
            console.error("깡갤 복사기: 초기화 실패", e);
        }
    }

    // jQuery 문서 준비 완료 시 실행
    $(document).ready(function() {
        console.log('깡갤 복사기: DOM 준비 완료');
        
        // 즉시 초기화 시도
        setTimeout(initialize, 1000);

        // 이벤트 리스너 등록 - 여러 방식으로 시도
        const initEvents = ['characterSelected', 'chat_render_complete'];
        initEvents.forEach(event => {
            $(document).on(event, () => {
                setTimeout(() => {
                    if (!isInitialized) {
                        initialize();
                    }
                }, 500);
            });
        });

        // 추가 이벤트들도 감지
        $(document).on('CHAT_CHANGED', () => {
            console.log('깡갤 복사기: CHAT_CHANGED 이벤트 감지');
            setTimeout(() => {
                if (!isInitialized) {
                    initialize();
                }
            }, 200);
        });

        // 캐릭터 선택 변경 감지
        $(document).on('change', '#character_select', () => {
            console.log('깡갤 복사기: 캐릭터 선택 변경 감지');
            setTimeout(() => {
                if (!isInitialized) {
                    initialize();
                }
            }, 200);
        });

        // Extensions 메뉴가 열렸을 때도 초기화 시도
        $(document).on('click', '[data-i18n="Extensions"]', () => {
            console.log('깡갤 복사기: Extensions 메뉴 클릭 감지');
            setTimeout(() => {
                if (!isInitialized) {
                    initialize();
                }
            }, 500);
        });

        // 타이머로 강제 초기화 (마지막 수단)
        setTimeout(() => {
            if (!isInitialized) {
                console.log('깡갤 복사기: 타이머 강제 초기화 실행');
                initialize();
            }
        }, 5000);
    });

    console.log('깡갤 복사기 확장프로그램이 로드되었습니다.');
})();