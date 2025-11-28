// ===================================================================
// 깡갤 복사기 확장프로그램 - commands.js 모듈
// ===================================================================
// 명령어 실행 전용 모듈
//
// === 🎯 모듈 역할 ===
// • 범용 명령어 실행 (executeSimpleCommand)
// • 메시지 복사 명령 (executeCopyCommand) 
// • 캐시 우회 재생성 (triggerCacheBustRegeneration)
// • 태그 제거 기능 (removeTagsFromElement)
// • 클립보드 복사 기능 (copyTextboxContent)
//
// === 🔗 의존성 ===
// • utils.js (debugLog, escapeHtml)
// • SillyTavern API (toastr, jQuery)
//
// ===================================================================

(function() {
    'use strict';
    
    // 의존성 확인
    if (!window.CopyBotUtils) {
        console.error('깡갤 복사기: CopyBotCommands - utils.js 모듈이 로드되지 않음');
        return;
    }
    
    // 모듈 전역 변수
    let isDebugMode = false;
    
    // 디버그 로그 함수 (utils 모듈 사용)
    function debugLog(...args) {
        if (window.CopyBotUtils) {
            window.CopyBotUtils.debugLog(isDebugMode, ...args);
        }
    }

    // 마지막 메시지 번호를 구하는 함수 (utils 모듈 사용)
    function getLastMessageIndex() {
        return window.CopyBotUtils ? 
            window.CopyBotUtils.getLastMessageIndex() :
            0;
    }

    // HTML 특수문자 처리 (utils 모듈 사용)
    function escapeHtml(str) {
        return window.CopyBotUtils ? 
            window.CopyBotUtils.escapeHtml(str) :
            (typeof str === 'string' ? str : '');
    }
    
    window.CopyBotCommands = {
        
        // 모듈 초기화 함수
        init: function(config = {}) {
            if (config.isDebugMode !== undefined) {
                isDebugMode = config.isDebugMode;
                debugLog('CopyBotCommands: 디버그 모드 설정됨:', isDebugMode);
            }
        },
        
        // 디버그 모드 설정 함수
        setDebugMode: function(enabled) {
            isDebugMode = enabled;
            debugLog('CopyBotCommands: 디버그 모드 변경됨:', enabled);
        },
        
        // 단순 명령어를 실행하는 범용 함수
        executeSimpleCommand: async function(command, successMessage, callback, isGhostwriting = false) {
            try {
                // 삭제 명령어(/del) 실행 시 재확인 옵션 체크
                if (command.trim().startsWith('/del')) {
                    const isConfirmEnabled = $('#copybot_confirm_delete_toggle').attr('data-enabled') === 'true';
                    if (isConfirmEnabled) {
                        if (!confirm('ㄹㅇ삭제?')) {
                            debugLog('삭제 명령 취소됨 (사용자 취소)');
                            return; // 함수 종료 (명령어 실행 안 함)
                        }
                    }
                }

                debugLog(`깡갤 복사기: 실행 중인 명령어 - ${command}`);
                const chatInput = $('#send_textarea');
                if (chatInput.length > 0) {
                    const originalText = chatInput.val();
                    chatInput.val(command);
                    chatInput.trigger('input');
                    setTimeout(() => {
                        $('#send_but').click();
                        setTimeout(() => {
                            if (!isGhostwriting) {
                                chatInput.val(originalText || '');
                            } else {
                                chatInput.val(''); 
                            }
                            if (typeof callback === 'function') {
                                callback();
                            }
                        }, 500);
                    }, 100);
                    if (successMessage) {
                        toastr.success(successMessage);
                    }
                } else {
                    toastr.error('채팅 입력창을 찾을 수 없습니다.');
                    console.error('깡갤 복사기: #send_textarea 요소를 찾을 수 없음');
                }
            } catch (error) {
                console.error('깡갤 복사기 명령어 실행 오류:', error);
                toastr.error('명령어 실행 중 오류가 발생했습니다.');
            }
        },

        // 메시지 복사 명령 실행 함수
        executeCopyCommand: async function(start, end) {
            try {
                const command = `/messages names=off ${start}-${end} | /copy`;
                this.executeSimpleCommand(command, `메시지 ${start}-${end} 복사 명령 실행!`);
                setTimeout(async () => {
                    try {
                        const clipboardText = await navigator.clipboard.readText();
                        if (clipboardText && clipboardText.trim()) {
                            $('#copybot_textbox').val(clipboardText);
                            // input 이벤트를 강제로 발생시켜 모든 버튼 상태를 올바르게 업데이트합니다.
                            $('#copybot_textbox').trigger('input');
                            debugLog('텍스트박스에 내용 표시 완료');
                        }
                    } catch (error) {
                        debugLog('클립보드 읽기 실패 (권한 문제일 수 있음)', error);
                    }
                }, 2000);
            } catch (error) {
                console.error('깡갤 복사기 오류:', error);
                toastr.error('메시지 복사 중 오류가 발생했습니다.');
            }
        },

        // 캐시 우회를 위한 새로운 재생성 함수 (토스트 메시지 제거)
        triggerCacheBustRegeneration: function() {
            debugLog('깡갤 복사기: 캐시 우회 재생성 시작...');
            try {
                const context = window.SillyTavern.getContext();
                const chat = context.chat;

                if (!chat || chat.length === 0) {
                    // 대화 기록이 없는 경우: 단순 재생성 (nonce 우회 방식 미적용)
                    debugLog('깡갤 복사기: 대화 기록 없음 - 단순 재생성 실행');
                    this.executeSimpleCommand('/trigger', '');
                    return;
                }

                let lastUserMessageIndex = -1;
                let originalMessage = '';
                for (let i = chat.length - 1; i >= 0; i--) {
                    if (chat[i].is_user) {
                        lastUserMessageIndex = i;
                        originalMessage = chat[i].mes;
                        break;
                    }
                }

                if (lastUserMessageIndex === -1) {
                    // 유저 메시지가 없는 경우: nonce 없이 단순 재생성
                    debugLog('깡갤 복사기: 유저 메시지 없음 - 단순 재생성 실행(nonce 캐시 우회 미적용)');
                    this.executeSimpleCommand('/trigger', '');
                    return;
                }

                const nonce = `<!-- regen-id:${Date.now()}-${Math.random()} -->`;
                
                chat[lastUserMessageIndex].mes = `${originalMessage}\n${nonce}`;
                debugLog('깡갤 복사기: Nonce가 추가된 임시 메시지로 재생성 요청');

                // 토스트 메시지 제거됨 (중복 방지)
                this.executeSimpleCommand('/trigger', '', () => {
                    setTimeout(() => {
                        const currentChat = window.SillyTavern.getContext().chat;
                        if (currentChat[lastUserMessageIndex] && currentChat[lastUserMessageIndex].mes.includes(nonce)) {
                            currentChat[lastUserMessageIndex].mes = originalMessage;
                            debugLog('깡갤 복사기: 마지막 사용자 메시지를 성공적으로 원상복구했습니다.');
                        }
                    }, 1000);
                });

            } catch (error) {
                console.error('깡갤 복사기: 캐시 우회 재생성 중 오류 발생', error);
                toastr.error('캐시 우회 재생성 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
            }
        },

        // 특정 element에서 태그를 제거하는 범용 함수 ({{ }} 템플릿 구문 제거 기능 추가)
        removeTagsFromElement: function(selector) {
            try {
                const targetElement = $(selector);
                if (targetElement.length === 0) {
                    toastr.error(`요소(${selector})를 찾을 수 없습니다.`);
                    return;
                }

                const currentText = targetElement.val();
                if (!currentText.trim()) {
                    toastr.warning('내용이 없습니다.');
                    return;
                }

                debugLog(`깡갤 복사기: ${selector} 태그 제거 시작, 원본 길이:`, currentText.length);

                let cleanedText = currentText;
				let iterationCount = 0;
				const maxIterations = 10;

				// pic 이미지 프롬프트 태그 제거 (HTML 태그 제거 전에 먼저 처리)
				if (/<pic\s+prompt="[^"]*"/i.test(cleanedText)) {
					// 1. 여는 태그 제거 (<pic prompt="...">)
					cleanedText = cleanedText.replace(/<pic\s+prompt="[^"]*"\s*\/?>/gi, '');
					
					// 2. 닫는 태그(</pic>) 및 속성 없는 태그(<pic>) 제거 (이게 먼저 실행되어야 </pic>가 pic> 로직에 의해 </ 로 깨지는 걸 막을 수 있음)
					cleanedText = cleanedText.replace(/<\/?pic>/gi, '');
					
					// 3. 환각 찌꺼기 (pic>) 제거 (위에서 정상 태그들이 다 처리되고 남은 찌꺼기만 여기서 삭제됨)
					cleanedText = cleanedText.replace(/pic>/gi, '');
				}

				// HTML 태그 제거
                while (iterationCount < maxIterations) {
                    const previousText = cleanedText;
                    cleanedText = cleanedText.replace(/<([^>\/\s]+)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g, '');
                    iterationCount++;
                    if (cleanedText === previousText) break;
                }

                cleanedText = cleanedText.replace(/<[^>]*>/g, '');
                
                // {{ }} 템플릿 구문 제거 추가(에셋)
                cleanedText = cleanedText.replace(/\{\{.*?\}\}/g, '');
                
                // [STATUS_START] ~ [STATUS_END] 상태창 제거(301호)
                cleanedText = cleanedText.replace(/\[STATUS_START\][\s\S]*?\[STATUS_END\]/g, '');

                // 괴담출 상태창 제거 (접속자 정보 ~ :: ~ ::)
                cleanedText = cleanedText.replace(/접속자 정보[\s\S]*?::[^:]*::/g, '');
                
                // 이선우 HUD 제거 (반각/전각 ｜와 ♀️/♂️가 모두 포함된 경우만)
                cleanedText = cleanedText.replace(/\[(?=[\s\S]*?[|｜])(?=[\s\S]*?[♀️♂️])[\s\S]*?\]/g, '');
                
                // OOC 메시지 제거
                // 케이스 2: (OOC:...) 와 그 아래 --- 구분선, 그리고 그 줄바꿈까지 한번에 제거
                cleanedText = cleanedText.replace(/\(OOC\s*:[\s\S]*?\)\s*\n\s*[-_]{3}\s*\n?/gi, '');
                // 케이스 1: (OOC:...) 만 제거 (공백 유연하게 처리)
                cleanedText = cleanedText.replace(/\(OOC\s*:[\s\S]*?\)/gi, '');
                
                cleanedText = cleanedText.replace(/\n\s*\n\s*\n/g, '\n\n');
                cleanedText = cleanedText.trim();

                debugLog(`깡갤 복사기: 태그 및 템플릿 구문 제거 완료, 최종 길이:`, cleanedText.length);
                targetElement.val(cleanedText);
                targetElement.trigger('input');

                if (cleanedText.length < currentText.length) {
                    const removedChars = currentText.length - cleanedText.length;
                    toastr.success(`태그 및 템플릿 구문 제거 완료! (${removedChars}자 제거됨)`);
                } else {
                    toastr.info('제거할 태그나 템플릿 구문이 없습니다.');
                }
            } catch (error) {
                console.error('깡갤 복사기: 태그 제거 실패', error);
                toastr.error('태그 제거 중 오류가 발생했습니다.');
            }
        },

        // 스마트 삭제 후 재생성 함수 (채팅 유무에 따라 분기)
        smartDeleteAndRegenerate: function() {
            try {
                const context = window.SillyTavern.getContext();
                const chat = context.chat;
                
                if (!chat || chat.length === 0) {
                    // 채팅 0개: 삭제 생략, 재생성만 실행
                    debugLog('깡갤 복사기: 채팅 없음 - 삭제 생략, 재생성만 실행');
                    this.triggerCacheBustRegeneration();
                } else {
                    // 채팅 있음: 삭제 후 재생성
                    debugLog('깡갤 복사기: 채팅 있음 - 삭제 후 재생성 실행');
                    this.executeSimpleCommand('/del 1', '', () => {
                        this.triggerCacheBustRegeneration();
                    });
                }
            } catch (error) {
                console.error('깡갤 복사기: 스마트 삭제 후 재생성 실패', error);
                toastr.error('재생성 중 오류가 발생했습니다.');
            }
        },

        // 텍스트박스 내용을 클립보드에 복사하는 함수
        copyTextboxContent: async function() {
            try {
                const textboxContent = $('#copybot_textbox').val();
                if (!textboxContent.trim()) {
                    toastr.warning('텍스트박스에 복사할 내용이 없습니다.');
                    return;
                }
                await navigator.clipboard.writeText(textboxContent);
                toastr.success('위 내용이 클립보드에 복사되었습니다!');
                debugLog('깡갤 복사기: 텍스트박스 내용 클립보드 복사 완료');
            } catch (error) {
                console.error('깡갤 복사기: 클립보드 복사 실패', error);
                try {
                    const textArea = document.createElement('textarea');
                    textArea.value = $('#copybot_textbox').val();
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    toastr.success('위 내용이 클립보드에 복사되었습니다! (fallback)');
                    debugLog('깡갤 복사기: fallback 방법으로 클립보드 복사 완료');
                } catch (fallbackError) {
                    console.error('깡갤 복사기: fallback 복사도 실패', fallbackError);
                    toastr.error('클립보드 복사에 실패했습니다.');
                }
            }
        }
    };
    
    if (window.copybot_debug_mode) {
        console.log('깡갤 복사기: commands.js 모듈 로드 완료');
    }
})();