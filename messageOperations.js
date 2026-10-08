// 깡갤 복사기 메시지 정리 모듈
// 메시지 숨기기(/hide /unhide), 다중 메시지 삭제 등 메시지 조작 기능
(function() {
    'use strict';

    // 전역 네임스페이스 생성
    window.CopyBotMessageOperations = {
        
        // === 모듈 초기화 ===
        init: function(dependencies) {
            this.dependencies = dependencies || {};
            if (window.copybot_debug_mode) {
                console.log('CopyBotMessageOperations 모듈 초기화 완료');
            }
            return true;
        },

        // === 메시지 범위 유틸리티 ===
        
        // 메시지 인덱스 유효성 검사
        validateMessageIndices: function(startIndex, endIndex) {
            try {
                const utils = this.dependencies.utils;
                if (!utils) {
                    console.error('깡갤 복사기: utils 의존성이 없음');
                    return false;
                }

                const lastMessageIndex = utils.getLastMessageIndex();
                
                // 기본 유효성 검사 (NaN 은 typeof 'number' 라서 통과하던 구멍 → 정수만 허용)
                if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) {
                    if (utils.debugLog) {
                        utils.debugLog(window.copybot_debug_mode, 'messageOperations: 인덱스는 숫자여야 함');
                    }
                    return false;
                }

                if (startIndex < 0 || endIndex < 0) {
                    if (utils.debugLog) {
                        utils.debugLog(window.copybot_debug_mode, 'messageOperations: 인덱스는 0 이상이어야 함');
                    }
                    return false;
                }

                if (startIndex > endIndex) {
                    if (utils.debugLog) {
                        utils.debugLog(window.copybot_debug_mode, 'messageOperations: 시작 인덱스가 끝 인덱스보다 큼');
                    }
                    return false;
                }

                if (endIndex > lastMessageIndex) {
                    if (utils.debugLog) {
                        utils.debugLog(window.copybot_debug_mode, `messageOperations: 끝 인덱스(${endIndex})가 마지막 메시지(${lastMessageIndex})보다 큼`);
                    }
                    return false;
                }

                return true;

            } catch (error) {
                console.error('깡갤 복사기: 인덱스 유효성 검사 실패', error);
                return false;
            }
        },

        // 현재 채팅의 메시지 범위 정보 반환
        getMessageRange: function() {
            try {
                const utils = this.dependencies.utils;
                if (!utils) {
                    console.error('깡갤 복사기: utils 의존성이 없음');
                    return { total: 0, lastIndex: -1 };
                }

                const lastIndex = utils.getLastMessageIndex();
                const total = lastIndex + 1; // 0부터 시작하므로 +1

                if (utils.debugLog) {
                    utils.debugLog(window.copybot_debug_mode, `messageOperations: 현재 메시지 범위 - 총 ${total}개, 마지막 인덱스: ${lastIndex}`);
                }

                return {
                    total: total,
                    lastIndex: lastIndex
                };

            } catch (error) {
                console.error('깡갤 복사기: 메시지 범위 조회 실패', error);
                return { total: 0, lastIndex: -1 };
            }
        },

        // === 숨겨진 메시지 구간 체크 기능 ===
        
        // 숨겨진 메시지 인덱스 배열 반환 (is_system 기반)
        getHiddenMessageRanges: function() {
            try {
                const utils = this.dependencies.utils;
                
                // SillyTavern context에서 채팅 데이터 가져오기
                const context = typeof SillyTavern !== 'undefined' && SillyTavern.getContext 
                    ? SillyTavern.getContext() 
                    : null;
                
                if (!context || !context.chat || context.chat.length === 0) {
                    return {
                        success: false,
                        message: '채팅이 없습니다.',
                        hiddenIndices: [],
                        rangeText: ''
                    };
                }
                
                // is_system === true인 메시지 찾기 (SillyTavern 숨김 메커니즘)
                const hiddenIndices = [];
                context.chat.forEach((msg, index) => {
                    if (msg.is_system === true) {
                        hiddenIndices.push(index);
                    }
                });
                
                if (hiddenIndices.length === 0) {
                    return {
                        success: true,
                        message: '숨겨진 메시지가 없습니다.',
                        hiddenIndices: [],
                        rangeText: ''
                    };
                }
                
                // 연속 구간 병합 (예: [1,2,3,5,6] → "1~3, 5~6")
                const ranges = [];
                let rangeStart = hiddenIndices[0];
                let rangeEnd = hiddenIndices[0];
                
                for (let i = 1; i < hiddenIndices.length; i++) {
                    if (hiddenIndices[i] === rangeEnd + 1) {
                        rangeEnd = hiddenIndices[i];
                    } else {
                        ranges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}~${rangeEnd}`);
                        rangeStart = hiddenIndices[i];
                        rangeEnd = hiddenIndices[i];
                    }
                }
                ranges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}~${rangeEnd}`);
                
                const rangeText = ranges.join(', ');
                
                if (utils && utils.debugLog) {
                    utils.debugLog(window.copybot_debug_mode, `messageOperations: 숨겨진 메시지 ${hiddenIndices.length}개 발견 - ${rangeText}`);
                }
                
                return {
                    success: true,
                    message: `숨겨진 메시지 ${hiddenIndices.length}개`,
                    hiddenIndices: hiddenIndices,
                    rangeText: rangeText
                };
                
            } catch (error) {
                console.error('깡갤 복사기: 숨겨진 메시지 조회 실패', error);
                return {
                    success: false,
                    message: '조회 중 오류가 발생했습니다.',
                    hiddenIndices: [],
                    rangeText: ''
                };
            }
        },

        // === 메시지 숨기기/보이기 기능 ===
        
        // /hide 명령어 실행
        executeHideCommand: function(startIndex, endIndex) {
            try {
                const utils = this.dependencies.utils;
                const commands = this.dependencies.commands;

                if (!utils || !commands) {
                    console.error('깡갤 복사기: 필요한 의존성이 없음 (utils, commands)');
                    toastr.error('메시지 숨기기 기능을 사용할 수 없습니다.');
                    return false;
                }

                // 인덱스 유효성 검사
                if (!this.validateMessageIndices(startIndex, endIndex)) {
                    toastr.error('올바르지 않은 메시지 번호입니다.');
                    return false;
                }

                if (utils.debugLog) {
                    utils.debugLog(window.copybot_debug_mode, `messageOperations: /hide 명령어 실행 시도 - ${startIndex}부터 ${endIndex}까지`);
                }

                // /hide 명령어 구성
                const hideCommand = `/hide ${startIndex}-${endIndex}`;
                
                // 명령어 실행 (입력창을 거치지 않는 조용한 경로 우선)
                const runHide = commands.executeSilentCommand || commands.executeSimpleCommand;
                return runHide.call(commands, hideCommand, `메시지 ${startIndex}번부터 ${endIndex}번까지 숨겨졌습니다.`);

            } catch (error) {
                console.error('깡갤 복사기: /hide 명령어 실행 실패', error);
                toastr.error('메시지 숨기기에 실패했습니다.');
                return false;
            }
        },

        // /unhide 명령어 실행
        executeUnhideCommand: function(startIndex, endIndex) {
            try {
                const utils = this.dependencies.utils;
                const commands = this.dependencies.commands;

                if (!utils || !commands) {
                    console.error('깡갤 복사기: 필요한 의존성이 없음 (utils, commands)');
                    toastr.error('메시지 보이기 기능을 사용할 수 없습니다.');
                    return false;
                }

                // 인덱스 유효성 검사
                if (!this.validateMessageIndices(startIndex, endIndex)) {
                    toastr.error('올바르지 않은 메시지 번호입니다.');
                    return false;
                }

                if (utils.debugLog) {
                    utils.debugLog(window.copybot_debug_mode, `messageOperations: /unhide 명령어 실행 시도 - ${startIndex}부터 ${endIndex}까지`);
                }

                // /unhide 명령어 구성
                const unhideCommand = `/unhide ${startIndex}-${endIndex}`;
                
                // 명령어 실행 (입력창을 거치지 않는 조용한 경로 우선)
                const runUnhide = commands.executeSilentCommand || commands.executeSimpleCommand;
                return runUnhide.call(commands, unhideCommand, `메시지 ${startIndex}번부터 ${endIndex}번까지 다시 보이게 되었습니다.`);

            } catch (error) {
                console.error('깡갤 복사기: /unhide 명령어 실행 실패', error);
                toastr.error('메시지 보이기에 실패했습니다.');
                return false;
            }
        },

        // === 다중 메시지 삭제 기능 ===
        
        // 다중 메시지 삭제 실행
        executeMultiDelete: function(startIndex, endIndex) {
            try {
                const utils = this.dependencies.utils;
                const commands = this.dependencies.commands;

                if (!utils || !commands) {
                    console.error('깡갤 복사기: 필요한 의존성이 없음 (utils, commands)');
                    toastr.error('다중 삭제 기능을 사용할 수 없습니다.');
                    return false;
                }

                // 인덱스 유효성 검사
                // 모든 범위 삭제 진입 경로(설정창·퀵/플로팅 메뉴)가 여기 한 곳을 거친다 — 마지막 메시지 초과 검사 포함
                if (!this.validateMessageIndices(startIndex, endIndex)) {
                    const last = utils.getLastMessageIndex();
                    toastr.error(`메시지 번호는 0~${last} 사이의 정수여야 하고, 시작이 끝보다 클 수 없습니다.`);
                    return false;
                }

                const deleteCount = endIndex - startIndex + 1;

                // 사용자 확인
                if (!confirm(`메시지 ${startIndex}번부터 ${endIndex}번까지 총 ${deleteCount}개의 메시지를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
                    if (utils.debugLog) {
                        utils.debugLog(window.copybot_debug_mode, 'messageOperations: 사용자가 다중 삭제를 취소함');
                    }
                    return false;
                }

                if (utils.debugLog) {
                    utils.debugLog(window.copybot_debug_mode, `messageOperations: 다중 삭제 실행 시도 - ${startIndex}부터 ${endIndex}까지 (총 ${deleteCount}개)`);
                }

                // 실제 삭제: 실리 기본 /cut (위에서 이미 확인창을 띄웠으므로 중복 확인은 건너뜀). 검증된 정수만 명령에 넣는다
                const run = commands.executeSilentCommand || commands.executeSimpleCommand;
                return run.call(commands, `/cut ${startIndex}-${endIndex}`, `메시지 ${startIndex}~${endIndex} 삭제 완료`, { skipConfirm: true });

            } catch (error) {
                console.error('깡갤 복사기: 다중 삭제 실행 실패', error);
                toastr.error('다중 삭제에 실패했습니다.');
                return false;
            }
        }
    };

    if (window.copybot_debug_mode) {
        console.log('CopyBotMessageOperations 모듈 로드 완료');
    }
})();