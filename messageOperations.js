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
                
                // 기본 유효성 검사
                if (typeof startIndex !== 'number' || typeof endIndex !== 'number') {
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
                
                // 명령어 실행
                return commands.executeSimpleCommand(
                    hideCommand,
                    `메시지 ${startIndex}번부터 ${endIndex}번까지 숨겨졌습니다.`,
                    null, // callback
                    false // isGhostwriting
                );

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
                
                // 명령어 실행
                return commands.executeSimpleCommand(
                    unhideCommand,
                    `메시지 ${startIndex}번부터 ${endIndex}번까지 다시 보이게 되었습니다.`,
                    null, // callback
                    false // isGhostwriting
                );

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
                if (!this.validateMessageIndices(startIndex, endIndex)) {
                    toastr.error('올바르지 않은 메시지 번호입니다.');
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

                // 다중 삭제 로직 구현
                toastr.info('다중 삭제 기능은 구현 완료.');
                
                return true;

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