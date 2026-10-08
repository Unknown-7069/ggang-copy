// 깡갤 복사기 유틸리티 모듈
// 순수 함수들만 포함, 외부 의존성 없음
(function() {
    'use strict';

    // 전역 네임스페이스 생성
    window.CopyBotUtils = {
        // 디버그 로그 전용 함수
        debugLog: function(isDebugMode, ...args) {
            if (isDebugMode) {
                console.log('🐞 깡갤 복사기:', ...args);
            }
        },

        // HTML 특수문자 처리
        escapeHtml: function(str) {
            if (typeof str !== 'string') return '';
            return str.replace(/&/g, "&amp;")
                     .replace(/</g, "&lt;")
                     .replace(/>/g, "&gt;")
                     .replace(/"/g, "&quot;")
                     .replace(/'/g, "&#039;");
        },

        // 마지막 메시지 번호를 구하는 함수
        getLastMessageIndex: function() {
            try {
                const context = window.SillyTavern.getContext();
                if (!context || !context.chat || context.chat.length === 0) {
                    this.debugLog(window.copybot_debug_mode, '대화 기록이 없습니다.');
                    return 0;
                }
                
                // 마지막 메시지의 인덱스 (0부터 시작하므로 length - 1)
                const lastIndex = context.chat.length - 1;
                if (this.debugLog) {
					this.debugLog(window.copybot_debug_mode, `마지막 메시지 번호 계산됨: ${lastIndex}`);
				}
				return lastIndex;
            } catch (error) {
                console.error('깡갤 복사기: 마지막 메시지 번호 계산 실패', error);
                return 0;
            }
        },

        // 중복 저장 방지를 위한 값 비교 함수
        hasValueChanged: function(lastSavedValues, fieldName, currentValue) {
            const hasChanged = lastSavedValues[fieldName] !== currentValue;
			if (hasChanged && this.debugLog) {
				this.debugLog(window.copybot_debug_mode, `${fieldName} 값 변경 감지:`, lastSavedValues[fieldName], '->', currentValue);
			}
			return hasChanged;
        },

        // RGB 문자열을 객체로 변환
        rgbStringToObj: function(rgbStr) {
            const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (!match) return { r: 0, g: 0, b: 0, a: 1 };
            return {
                r: parseInt(match[1], 10),
                g: parseInt(match[2], 10),
                b: parseInt(match[3], 10),
                a: match[4] !== undefined ? parseFloat(match[4]) : 1,
            };
        },

        // RGB를 HSL로 변환
        rgbToHsl: function(r, g, b) {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            let h, s, l = (max + min) / 2;
            if (max === min) {
                h = s = 0; // 흑백
            } else {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    case b: h = (r - g) / d + 4; break;
                }
                h /= 6;
            }
            return { h: h * 360, s: s * 100, l: l * 100 };
        }
    };

    if (window.copybot_debug_mode) {
        console.log('CopyBotUtils 모듈 로드 완료');
    }
})();