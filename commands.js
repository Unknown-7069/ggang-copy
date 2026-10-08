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
        
        // ===== 확장 업데이트 (실리 확장 관리 창을 열지 않고 복사기 안에서) — 실리 /api/extensions/version·update 사용 =====
        _extName: function() { return window.copybot_extension_folder || 'ggang-copy'; },
        _extHeaders: function() {
            const ctx = window.SillyTavern?.getContext?.();
            return (ctx && typeof ctx.getRequestHeaders === 'function') ? ctx.getRequestHeaders() : { 'Content-Type': 'application/json' };
        },
        _setUpdateStatus: function(text, color) { $('#copybot_update_status').text(text || '').css('color', color || ''); },
        // 기타 탭을 열 때 1회: manifest 의 현재 버전 표시
        showExtensionVersion: async function() {
            const $v = $('#copybot_update_version');
            if (!$v.length || $v.data('loaded')) return;
            try {
                const r = await fetch(`/scripts/extensions/third-party/${this._extName()}/manifest.json`, { cache: 'no-store' });
                const m = r.ok ? await r.json() : null;
                $v.text(m?.version ? `v${m.version}` : '').data('loaded', true);
            } catch (e) { debugLog('manifest 읽기 실패', e); }
        },
        // 유저(로컬) 확장 → 없으면 전역 확장 순으로 조회. 깃허브로 설치한 경우에만 서버가 안다
        _queryExtensionVersion: async function() {
            for (const global of [false, true]) {
                const r = await fetch('/api/extensions/version', { method: 'POST', headers: this._extHeaders(), body: JSON.stringify({ extensionName: this._extName(), global }) });
                if (r.ok) return { global, data: await r.json() };
                if (r.status !== 404) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
            }
            throw new Error('설치 정보를 찾지 못했습니다 (깃허브에서 설치한 복사기에서만 동작합니다)');
        },
        checkExtensionUpdate: async function() {
            this._setUpdateStatus('확인 중…');
            try {
                const { data } = await this._queryExtensionVersion();
                const where = `${data.currentBranchName || ''} ${String(data.currentCommitHash || '').slice(0, 7)}`.trim();
                if (data.isUpToDate) this._setUpdateStatus(`최신입니다 (${where})`, '#48bb78');
                else this._setUpdateStatus(`새 버전이 있습니다 (지금 ${where}) — [업데이트]를 눌러 주십시오`, '#e8a838');
                return data;
            } catch (error) {
                console.error('깡갤 복사기: 업데이트 확인 실패', error);
                this._setUpdateStatus(`확인 실패: ${error.message}`, '#e53e3e');
                return null;
            }
        },
        updateExtension: async function() {
            this._setUpdateStatus('업데이트 중…');
            try {
                const { global } = await this._queryExtensionVersion();
                const r = await fetch('/api/extensions/update', { method: 'POST', headers: this._extHeaders(), body: JSON.stringify({ extensionName: this._extName(), global }) });
                if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
                const data = await r.json().catch(() => ({}));
                if (data.isUpToDate) {
                    this._setUpdateStatus('이미 최신입니다', '#48bb78');
                    toastr.info('깡갤 복사기는 이미 최신입니다.');
                    return data;
                }
                this._setUpdateStatus(`업데이트 완료 (${data.shortCommitHash || ''}) — 새로고침하면 적용됩니다`, '#48bb78');
                if (confirm('업데이트했습니다. 지금 새로고침하시겠습니까? (입력 중인 글은 사라질 수 있습니다)')) location.reload();
                return data;
            } catch (error) {
                console.error('깡갤 복사기: 업데이트 실패', error);
                this._setUpdateStatus(`업데이트 실패: ${error.message}`, '#e53e3e');
                toastr.error('업데이트에 실패했습니다. 확장 관리 창에서 다시 시도해 보십시오.');
                return null;
            }
        },

        // 단순 명령어 실행 (구 입력창 경유 API 의 호환 껍데기). 2026-10-09 유저 결정: 입력창(#send_textarea+#send_but) 경유 경로는 완전히 제거.
        // 모든 명령은 executeSilentCommand(실리 내부 실행기)로만 간다. callback 은 실행이 끝난 뒤 호출. isGhostwriting 은 더 이상 쓰지 않음.
        executeSimpleCommand: async function(command, successMessage, callback, isGhostwriting = false) {
            const result = await this.executeSilentCommand(command, successMessage);
            if (typeof callback === 'function' && !result?.cancelled && !result?.isError) {
                try { callback(); } catch (error) { console.error('깡갤 복사기: 명령 후속 콜백 오류', error); }
            }
            return result;
        },

        // 슬래시 명령을 실리 내부 실행기로 직접 실행 (조용한 실행). 실리 1.12 이상 전제 — API 가 없으면 실행하지 않고 안내만.
        executeSilentCommand: async function(command, successMessage, options = {}) {
            try {
                // 삭제가 포함된 명령(/del, /cut)은 어떤 경로든 좆됨방지(삭제 전 재확인) 옵션을 그대로 따른다.
                // 호출자가 이미 자체 확인창을 띄웠으면 options.skipConfirm 으로 중복 확인을 막는다. 설정을 못 읽으면 확인한다(fail-closed).
                const trimmed = String(command || '').trim();
                if (!options.skipConfirm && (/^\/del\b/.test(trimmed) || /^\/cut\b/.test(trimmed))) {
                    const isConfirmEnabled = window.CopyBotSettings?.isConfirmDeleteEnabled
                        ? window.CopyBotSettings.isConfirmDeleteEnabled()
                        : ($('#copybot_confirm_delete_toggle').attr('data-enabled') ?? 'true') === 'true';
                    if (isConfirmEnabled && !confirm('ㄹㅇ삭제?')) {
                        debugLog('삭제 명령 취소됨 (사용자 취소)');
                        return { isError: false, cancelled: true };
                    }
                }
                const context = window.SillyTavern?.getContext?.();
                if (!context || typeof context.executeSlashCommandsWithOptions !== 'function') {
                    toastr.error('실리태번 버전이 너무 낮습니다. 깡갤 복사기는 1.12 이상이 필요합니다.');
                    console.error('깡갤 복사기: executeSlashCommandsWithOptions 없음 (실리 1.12 이상 필요)');
                    return { isError: true, errorMessage: 'SillyTavern 1.12+ required' };
                }
                debugLog(`깡갤 복사기: 조용한 명령 실행 - ${command}`);
                const result = await context.executeSlashCommandsWithOptions(command, {
                    handleParserErrors: false,
                    handleExecutionErrors: false,
                });
                if (result?.isError) {
                    console.error('깡갤 복사기: 명령 실행 오류', result.errorMessage);
                    toastr.error(`명령 실행 실패: ${result.errorMessage || command}`);
                    return result;
                }
                if (successMessage) {
                    toastr.success(successMessage);
                }
                return result;
            } catch (error) {
                console.error('깡갤 복사기 명령어 실행 오류:', error);
                toastr.error('실행 중 오류가 발생했습니다.');
                // 예외도 "실패"로 돌려줘야 호출자의 후속 콜백(삭제 후 재생성 등)이 실행되지 않음
                return { isError: true, errorMessage: String(error?.message || error || '') };
            }
        },

        // 메시지 번호로 이동 (index: 숫자 또는 'last')
        jumpToMessage: async function(index, successMessage) {
            try {
                const lastIndex = getLastMessageIndex();
                let target = index === 'last' ? lastIndex : parseInt(index, 10);
                if (isNaN(target) || target < 0) {
                    toastr.error('올바른 메시지 번호를 입력해야 합니다.');
                    return;
                }
                if (target > lastIndex) {
                    target = lastIndex;
                }
                // 실리 기본 /chat-jump: 안 그려진 과거 메시지 로드까지 처리해 줌
                await this.executeSilentCommand(`/chat-jump ${target}`, successMessage);

                // 안전장치: /chat-jump 내부의 smooth scrollTo는 content-visibility:auto(렌더 최적화 확장) 환경에서
                // 스크롤이 전혀 안 움직이는 것을 폰 실환경에서 확인함 → 즉시 스크롤(scrollTop 직접 대입)로 보정.
                // 레이아웃이 뒤늦게 바뀔 수 있어(이미지·지연 렌더) 잠깐 간격을 두고 최대 3번 다시 맞춤.
                const chat = document.querySelector('#chat');
                const anchor = () => {
                    const messageElement = document.querySelector(`#chat .mes[mesid="${target}"]`);
                    if (!messageElement || !chat) return false;
                    const r = messageElement.getBoundingClientRect();
                    const c = chat.getBoundingClientRect();
                    const delta = r.top - c.top;
                    if (Math.abs(delta) > 2) {
                        chat.scrollTop = chat.scrollTop + delta;
                    }
                    return true;
                };
                for (let i = 0; i < 3; i++) {
                    if (!anchor()) break;
                    await new Promise(resolve => setTimeout(resolve, 250));
                }
            } catch (error) {
                console.error('깡갤 복사기: 메시지 이동 실패', error);
                toastr.error('메시지 이동 중 오류가 발생했습니다.');
            }
        },

        // 텍스트를 클립보드에 조용히 쓰는 헬퍼 (실패 시 execCommand fallback)
        writeToClipboard: async function(text) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (error) {
                debugLog('clipboard API 실패, execCommand fallback 시도', error);
                try {
                    const textArea = document.createElement('textarea');
                    textArea.value = text;
                    textArea.setAttribute('readonly', '');          // 모바일 키보드 팝업 방지
                    textArea.setAttribute('inputmode', 'none');
                    textArea.style.position = 'fixed';
                    textArea.style.opacity = '0';
                    document.body.appendChild(textArea);
                    textArea.select();
                    const ok = document.execCommand('copy');
                    document.body.removeChild(textArea);
                    return ok;
                } catch (fallbackError) {
                    console.error('깡갤 복사기: 클립보드 fallback 복사 실패', fallbackError);
                    return false;
                }
            }
        },

        // 메시지 복사 명령 실행 함수 (실리 기본 /messages 만 사용, 외부 확장 불필요)
        // 채팅 입력창/전송 버튼을 거치지 않고 슬래시 명령을 직접 실행 → 화면(스크롤·펼침·입력창)을 건드리지 않음
        executeCopyCommand: async function(start, end) {
            try {
                const context = window.SillyTavern?.getContext?.();
                if (!context || typeof context.executeSlashCommandsWithOptions !== 'function') {
                    toastr.error('이 기능은 SillyTavern 1.12 이상이 필요합니다. 실리를 업데이트해 주십시오.');
                    return;
                }

                // 숨긴 메시지 포함 옵션 (기본 OFF). hidden 인자를 생략하면 /hide 로 숨긴 메시지는 결과에서 빠짐 (ST 1.19 확인)
                const includeHidden = $('#copybot_copy_include_hidden').is(':checked');
                // 번호는 정수로만 명령에 넣는다 (입력값을 그대로 명령 문자열에 끼워 넣지 않음)
                const s0 = parseInt(start, 10), e0 = parseInt(end, 10);
                if (isNaN(s0) || isNaN(e0) || s0 < 0 || s0 > e0) {
                    toastr.error('올바른 메시지 범위를 숫자로 입력해야 합니다.');
                    return;
                }
                start = s0; end = e0;
                const command = `/messages names=off hidden=${includeHidden ? 'on' : 'off'} ${start}-${end}`;
                debugLog(`깡갤 복사기: 조용한 복사 실행 - ${command}`);
                const result = await context.executeSlashCommandsWithOptions(command, {
                    handleParserErrors: false,
                    handleExecutionErrors: false,
                });
                const text = (result?.pipe ?? '').toString();

                if (!text.trim()) {
                    const s = Math.max(0, parseInt(start, 10) || 0);
                    const e = parseInt(end, 10);
                    const hiddenInRange = (context.chat || []).slice(s, (isNaN(e) ? s : e) + 1).some(m => m?.is_system);
                    if (!includeHidden && hiddenInRange) {
                        toastr.warning(`${start}~${end}번은 숨긴 메시지뿐입니다. 복사 옆 '숨긴 메시지 포함'을 켜면 복사됩니다.`, '', { timeOut: 5000 });
                    } else {
                        toastr.warning(`${start}~${end}번 범위에 복사할 내용이 없습니다.`);
                    }
                    return;
                }

                $('#copybot_textbox').val(text);
                // input 이벤트를 강제로 발생시켜 모든 버튼 상태를 올바르게 업데이트합니다.
                $('#copybot_textbox').trigger('input');
                debugLog('텍스트박스에 내용 표시 완료');

                const copied = await this.writeToClipboard(text);
                if (!copied) {
                    toastr.warning('텍스트박스에는 넣었지만 클립보드 복사는 실패했습니다. 위 "복사" 버튼을 눌러 주십시오.');
                }
            } catch (error) {
                console.error('깡갤 복사기 오류:', error);
                toastr.error('메시지 복사 중 오류가 발생했습니다.');
            }
        },

        // 재생성 (generation.js 파이프라인으로 위임) — 하위 호환용 이름 유지
        triggerCacheBustRegeneration: function() {
            if (window.CopyBotGeneration) {
                return window.CopyBotGeneration.deleteAndRegenerate();
            }
            return this.legacyTriggerCacheBustRegeneration();
        },

        // 삭제 후 재생성 (generation.js 파이프라인으로 위임) — 하위 호환용 이름 유지
        smartDeleteAndRegenerate: function() {
            if (window.CopyBotGeneration) {
                return window.CopyBotGeneration.deleteAndRegenerate();
            }
            return this.legacySmartDeleteAndRegenerate();
        },

        // (구) 재생성 폴백 — generation.js 가 없을 때. 예전엔 채팅 메시지 본문에 nonce 를 직접 써넣고 /trigger 를 돌렸는데,
        // 생성이 길어지거나 실패하면 nonce 가 채팅 파일에 남을 수 있어(유저 데이터 변경) 2026-10-09 제거. 안내만 한다.
        legacyTriggerCacheBustRegeneration: function() {
            console.error('깡갤 복사기: 재생성 모듈(generation.js)이 없어 재생성을 실행할 수 없습니다.');
            toastr.error('재생성 모듈이 로드되지 않았습니다. 페이지를 새로고침해 주십시오.');
            return false;
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

        // (구) 삭제 후 재생성 폴백 — 위와 같은 이유로 제거. 삭제도 하지 않고 안내만 한다.
        legacySmartDeleteAndRegenerate: function() {
            return this.legacyTriggerCacheBustRegeneration();
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
                    textArea.setAttribute('readonly', '');          // 모바일 키보드 팝업 방지
                    textArea.setAttribute('inputmode', 'none');
                    textArea.style.position = 'fixed';
                    textArea.style.opacity = '0';
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