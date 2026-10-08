// ===================================================================
// 깡갤 복사기 확장프로그램 - generation.js 모듈
// ===================================================================
// 생성·삭제 파이프라인 전용 모듈 (실리 내부 API 직접 사용, 입력창·전송 버튼 미경유)
//
// === 🎯 모듈 역할 ===
// • 생성 상태 추적 (GENERATION_STARTED / ENDED / STOPPED + #mes_stop)
// • 마지막 메시지 빠른 삭제 (deleteLastMessage: DOM 1개만 제거, 전체 재렌더 없음)
// • 삭제 후 재생성 파이프라인 (유휴 대기 → 'regenerate' 생성 → 완료 감지), 캐시 우회 옵션
// • 응답 없이 메시지 보내기 (/send 와 동일)
// • 단계별 지속 토스트 + 중단 처리
//
// === 🔗 의존성 ===
// • utils.js (debugLog), SillyTavern.getContext()
//
// === 📝 왜 'regenerate' 타입인가 ===
// • 예전 방식(/del 1 → /trigger)은 ① /trigger 가 채팅 입력창을 비우고 ② is_send_press 를 최대 10초만
//   기다리다 포기해 재생성이 조용히 씹히는 경우가 있었음(메모리 확장 등이 생성 상태를 잡고 있을 때).
// • 실리의 Generate('regenerate') 는 마지막 봇 메시지 삭제 + 재생성을 한 번에, 입력창을 읽지 않고 처리함.
//   그래서 미전송 초안이 절대 날아가지 않고, 삭제 완료를 따로 폴링할 필요도 없음.
// ===================================================================

(function() {
    'use strict';

    if (!window.CopyBotUtils) {
        console.error('깡갤 복사기: CopyBotGeneration - utils.js 모듈이 로드되지 않음');
        return;
    }

    let isDebugMode = false;
    let eventsBound = false;

    // 생성 상태 추적
    let activeGenerations = 0;          // GENERATION_STARTED ~ ENDED/STOPPED 사이 카운트
    let lastGenerationType = null;

    // 파이프라인 상태
    let pipeline = null;                // { stage, cancelled, toast, cleanup: [] }

    // 캐시 우회용 임시 상태
    const NONCE_PROMPT_KEY = 'COPYBOT_REGEN_NONCE';
    let nonceRestore = null;            // () => void

    function debugLog(...args) {
        window.CopyBotUtils.debugLog(isDebugMode, ...args);
    }

    function getContext() {
        return window.SillyTavern?.getContext?.() || null;
    }

    // 좆됨방지(삭제 전 재확인) 옵션
    function confirmIfNeeded(message) {
        // fail-closed: 설정을 못 읽으면 확인창을 띄운다
        const isConfirmEnabled = window.CopyBotSettings?.isConfirmDeleteEnabled
            ? window.CopyBotSettings.isConfirmDeleteEnabled()
            : ($('#copybot_confirm_delete_toggle').attr('data-enabled') ?? 'true') === 'true';
        if (!isConfirmEnabled) return true;
        return confirm(message || 'ㄹㅇ삭제?');
    }

    // ===================================================================
    // 🔔 단계별 지속 토스트
    // ===================================================================

    function escapeHtml(str) {
        return window.CopyBotUtils.escapeHtml(String(str ?? ''));
    }

    function showStageToast(text, { abortable = true } = {}) {
        ensureAbortHandler();
        const html = `
            <div class="copybot_stage_toast">
                <span class="copybot_stage_text">${escapeHtml(text)}</span>
                ${abortable ? '<button type="button" class="copybot_stage_abort">중단</button>' : ''}
            </div>`;
        // 이미 떠 있는 단계 토스트가 있으면(화면에 1개만 유지) 내용만 갱신 — 절대 새로 만들지 않음. 같은 문구면 DOM 도 안 건드림
        const $existing = $('.copybot_stage_toast').last().closest('.toast');
        if ($existing.length) {
            if ($existing.find('.copybot_stage_text').text() === String(text)) { if (pipeline) pipeline.toast = $existing; return $existing; }
            $existing.find('.toast-message').html(html);
            if (pipeline) pipeline.toast = $existing;
            return $existing;
        }
        const $toast = toastr.info(html, '', {
            timeOut: 0,
            extendedTimeOut: 0,
            tapToDismiss: false,
            closeButton: false,
            escapeHtml: false,
            preventDuplicates: false,
        });
        if (pipeline) pipeline.toast = $toast;
        // 안전장치: 어떤 이유로든 단계 토스트가 2개 이상이면 최신 1개만 남김
        const $all = $('.copybot_stage_toast').closest('.toast');
        if ($all.length > 1) $all.slice(0, -1).remove();
        return $toast;
    }

    function clearStageToast() {
        if (pipeline && pipeline.toast) {
            toastr.clear(pipeline.toast, { force: true });
            pipeline.toast = null;
        }
        // 혹시 남은 단계 토스트가 있으면 전부 제거 (페이드 중 새로 만들어진 고아 토스트 대비)
        $('.copybot_stage_toast').closest('.toast').remove();
    }

    // 토스트 안의 '중단' 버튼 — 전역 리스너는 첫 토스트를 띄울 때 1회만 등록 (미사용 시 무영향)
    let abortHandlerBound = false;
    function ensureAbortHandler() {
        if (abortHandlerBound) return;
        abortHandlerBound = true;
        $(document).off('click.copybot_stage_abort').on('click.copybot_stage_abort', '.copybot_stage_abort', function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.CopyBotGeneration.abort('사용자 중단');
        });
    }

    // ===================================================================
    // ⏱ 유틸: 조건 대기 / 이벤트 1회 대기
    // ===================================================================

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function waitUntil(conditionFn, { timeoutMs = 20000, intervalMs = 150, onTick = null } = {}) {
        const started = Date.now();
        while (!conditionFn()) {
            if (pipeline && pipeline.cancelled) return false;
            if (Date.now() - started > timeoutMs) return false;
            if (onTick) onTick(Math.round((Date.now() - started) / 1000));
            await delay(intervalMs);
        }
        return true;
    }

    function onceEvent(eventName, { timeoutMs = 60000 } = {}) {
        const context = getContext();
        return new Promise(resolve => {
            if (!context?.eventSource) { resolve(false); return; }
            let done = false;
            const handler = (...args) => {
                if (done) return;
                done = true;
                context.eventSource.removeListener(eventName, handler);
                resolve({ args });
            };
            context.eventSource.on(eventName, handler);
            setTimeout(() => {
                if (done) return;
                done = true;
                context.eventSource.removeListener(eventName, handler);
                resolve(false);
            }, timeoutMs);
        });
    }

    // ===================================================================
    // 🧠 캐시 우회 (nonce)
    // ===================================================================

    // mode: 'off' | 'light' | 'strong'
    //  light : 마지막 유저 메시지 끝에 보이지 않는 nonce 주석을 임시로 붙임 → 앞부분 캐시는 대부분 유지, 마지막 구간만 변화
    //  strong: 프롬프트 맨 앞(BEFORE_PROMPT)에 nonce 를 임시 주입 → 접두 캐시 전체 무효화(비용↑, 고착 탈출엔 가장 확실)
    function makeNonce() {
        return `regen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    // 반환: 쓴 nonce (off 면 null)
    function applyCacheBypass(mode) {
        const context = getContext();
        if (!context || mode === 'off' || !mode) return null;

        const nonce = makeNonce();
        const restorers = [];

        if (mode === 'strong' && typeof context.setExtensionPrompt === 'function') {
            const BEFORE_PROMPT = context.extension_prompt_types?.BEFORE_PROMPT ?? 2;
            const SYSTEM = context.extension_prompt_roles?.SYSTEM ?? 0;
            context.setExtensionPrompt(NONCE_PROMPT_KEY, `[session:${nonce}]`, BEFORE_PROMPT, 0, false, SYSTEM);
            restorers.push(() => context.setExtensionPrompt(NONCE_PROMPT_KEY, '', BEFORE_PROMPT, 0, false, SYSTEM));
            debugLog('캐시 우회(strong): 프롬프트 앞에 nonce 주입', nonce);
        }

        // light(및 strong 의 보조): 마지막 유저 메시지 끝에 주석 nonce
        const chat = context.chat;
        let lastUserIndex = -1;
        for (let i = chat.length - 1; i >= 0; i--) {
            if (chat[i].is_user) { lastUserIndex = i; break; }
        }
        if (lastUserIndex !== -1) {
            const original = chat[lastUserIndex].mes;
            chat[lastUserIndex].mes = `${original}\n<!-- ${nonce} -->`;
            restorers.push(() => {
                const current = context.chat[lastUserIndex];
                if (current && typeof current.mes === 'string' && current.mes.includes(nonce)) {
                    current.mes = original;
                }
            });
            debugLog('캐시 우회: 마지막 유저 메시지에 nonce 부착', lastUserIndex);
        } else if (mode === 'light') {
            debugLog('캐시 우회(light): 유저 메시지가 없어 nonce 를 붙일 곳이 없음');
        }

        nonceRestore = () => {
            restorers.forEach(fn => { try { fn(); } catch (e) { console.error('깡갤 복사기: nonce 복원 실패', e); } });
            nonceRestore = null;
            debugLog('캐시 우회: 원상복구 완료');
        };

        // 프롬프트가 조립되어 요청 데이터가 만들어진 직후 복원 (채팅 파일에 nonce 가 남지 않도록)
        onceEvent(context.event_types.GENERATE_AFTER_DATA, { timeoutMs: 30000 }).then(() => {
            if (nonceRestore) nonceRestore();
        });
        return nonce;
    }

    function restoreCacheBypassNow() {
        if (nonceRestore) nonceRestore();
    }

    // ===================================================================
    // 🔁 같은 요청 재전송 — 재시도는 "최초 요청 데이터 그대로" 다시 보낸다 (유저 지시 2026-10-09)
    //   유저가 그 사이 작가노트·전개 지시·프롬프트를 바꿔도, 끊긴 그 요청을 되돌리는 것이므로 첫 시도의 generate_data 를
    //   복제해 두었다가 재시도의 GENERATE_AFTER_DATA 에서 통째로 바꿔치기한다. 캐시 우회가 켜져 있으면 nonce 문자열만 새것으로.
    //   (유저가 직접 비행기 버튼을 눌러 새로 요청하는 것과 명확히 다름)
    // ===================================================================
    let frozenRequest = null;
    let frozenNonce = null;
    function cloneRequestData(data) {
        try { return structuredClone(data); } catch (e) { return JSON.parse(JSON.stringify(data)); }
    }
    function freezeRequest(data, nonce) {
        if (!data || typeof data !== 'object') return false;
        frozenRequest = cloneRequestData(data);
        frozenNonce = nonce || null;
        debugLog('최초 요청 데이터 고정 (재시도는 이 데이터를 그대로 재전송)', Object.keys(frozenRequest));
        return true;
    }
    function replayRequest(data, newNonce) {
        if (!frozenRequest || !data || typeof data !== 'object') return false;
        let copy = cloneRequestData(frozenRequest);
        if (frozenNonce && newNonce) {
            try { copy = JSON.parse(JSON.stringify(copy).split(frozenNonce).join(newNonce)); } catch (e) { /* nonce 치환 실패 시 그대로 */ }
        }
        for (const k of Object.keys(data)) delete data[k];
        Object.assign(data, copy);
        debugLog('재시도: 최초 요청 데이터로 바꿔치기 완료', newNonce ? '(새 nonce)' : '');
        return true;
    }
    function clearFrozenRequest() { frozenRequest = null; frozenNonce = null; }

    // ===================================================================
    // 📡 생성 상태 추적
    // ===================================================================

    function bindEvents() {
        if (eventsBound) return;
        const context = getContext();
        if (!context?.eventSource || !context.event_types) return;
        const { eventSource, event_types } = context;

        // 주의: STARTED/ENDED 는 짝이 안 맞을 수 있음 (quiet 생성·확장의 generateRaw 등은 ENDED 없이 끝나기도 함).
        // 그래서 카운터는 "무슨 생성인지 설명"하는 용도로만 쓰고, 바쁨 판단은 실리 UI 상태(정지 버튼)로 한다.
        eventSource.on(event_types.GENERATION_STARTED, (type) => {
            activeGenerations++;
            lastGenerationType = type;
            lastStartedAt = Date.now();
            debugLog('생성 시작 감지:', type, '활성:', activeGenerations);
        });
        const onFinished = (label) => () => {
            activeGenerations = Math.max(0, activeGenerations - 1);
            debugLog(`생성 ${label} 감지, 활성:`, activeGenerations);
            // 어떤 이유로든 생성이 끝났으면 임시 nonce 는 반드시 복원
            restoreCacheBypassNow();
        };
        eventSource.on(event_types.GENERATION_ENDED, onFinished('종료'));
        eventSource.on(event_types.GENERATION_STOPPED, onFinished('중단'));

        eventsBound = true;
        debugLog('CopyBotGeneration: 이벤트 바인딩 완료');
    }

    let lastStartedAt = 0;

    function isStopButtonVisible() {
        const stop = document.querySelector('#mes_stop');
        return !!stop && getComputedStyle(stop).display !== 'none';
    }

    function isSendButtonHidden() {
        const send = document.querySelector('#send_but');
        return !!send && getComputedStyle(send).display === 'none';
    }

    // 실리가 실제로 응답을 생성 중인가 (UI 기준: 정지 버튼 표시 / 전송 버튼 숨김)
    function isBusy() {
        const uiBusy = isStopButtonVisible() || isSendButtonHidden();
        // 카운터가 UI 와 10초 넘게 어긋나 있으면(짝 안 맞는 이벤트) 카운터를 리셋
        if (!uiBusy && activeGenerations > 0 && Date.now() - lastStartedAt > 10000) {
            activeGenerations = 0;
        }
        return uiBusy;
    }

    // ===================================================================
    // 🧩 공개 API
    // ===================================================================

    window.CopyBotGeneration = {

        init: function(config = {}) {
            if (config.isDebugMode !== undefined) isDebugMode = config.isDebugMode;
            // 생성 이벤트 리스너는 재생성 파이프라인을 처음 쓸 때(deleteAndRegenerate → bindEvents) 등록한다 (미사용 시 무영향)
            return true;
        },

        setDebugMode: function(enabled) {
            isDebugMode = enabled;
        },

        isBusy: isBusy,
        isPipelineRunning: () => !!pipeline,
        // 테스트용: 같은 요청 재전송 내부 함수
        _freezeRequest: freezeRequest,
        _replayRequest: replayRequest,
        _clearFrozenRequest: clearFrozenRequest,
        _hasFrozenRequest: () => !!frozenRequest,

        // ===== 입력창 초안 보호 (generate('normal') 이 입력창을 읽어 보내는 것을 막음) =====
        // 실리 순서: GENERATION_STARTED → processCommands(입력창) → GENERATION_AFTER_COMMANDS → 입력창 읽고 비움 → GENERATE_BEFORE_COMBINE_PROMPTS …
        // 그래서 비웠다가 GENERATE_BEFORE_COMBINE_PROMPTS(읽은 직후) 에 복원. 실패 대비로 AFTER_DATA/ENDED/STOPPED/15초에도 복원.
        _draft: null,
        _draftSeq: 0,
        protectDraftDuringGenerate: function() {
            const context = getContext();
            const $input = $('#send_textarea');
            if (!$input.length) return;
            // 이전 보호 세션이 남아 있으면 먼저 복원하고, 그 세션의 지연 콜백은 무효화(seq 불일치)
            this.restoreDraftNow();
            const seq = ++this._draftSeq;
            const text = String($input.val() || '');
            this._draft = { text, restored: false, seq };
            if (text) {
                $input.val('');
                $input[0].dispatchEvent(new Event('input', { bubbles: true }));
            }
            const restore = () => { if (this._draft && this._draft.seq === seq) this.restoreDraftNow(); };
            const et = context?.event_types || {};
            [et.GENERATE_BEFORE_COMBINE_PROMPTS, et.GENERATE_AFTER_DATA, et.GENERATION_ENDED, et.GENERATION_STOPPED]
                .filter(Boolean)
                .forEach(name => onceEvent(name, { timeoutMs: 15000 }).then(r => { if (r) restore(); }));
            setTimeout(restore, 15000);
        },
        restoreDraftNow: function() {
            const d = this._draft;
            if (!d || d.restored) return;
            d.restored = true;
            if (!d.text) { this._draft = null; return; }
            const $input = $('#send_textarea');
            if ($input.length && !String($input.val() || '').trim()) {
                $input.val(d.text);
                $input[0].dispatchEvent(new Event('input', { bubbles: true }));
                debugLog('입력창 초안 복원 완료');
            }
            this._draft = null;
        },

        // 현재 진행 중인 파이프라인/생성 중단
        abort: function(reason = '중단') {
            const context = getContext();
            debugLog('abort 호출:', reason, pipeline?.stage);
            if (pipeline) pipeline.cancelled = true;
            if (pipeline?.cleanup) pipeline.cleanup();
            if (pipeline?.detachAfterData) pipeline.detachAfterData();
            clearFrozenRequest();
            if (pipeline?.restoreToastr) pipeline.restoreToastr();
            if (pipeline?.uiDeactivated && typeof context?.activateSendButtons === 'function') context.activateSendButtons();
            this.restoreDraftNow();
            try {
                if (isBusy() && typeof context?.stopGeneration === 'function') {
                    context.stopGeneration();
                }
            } catch (e) {
                console.error('깡갤 복사기: stopGeneration 실패', e);
            }
            restoreCacheBypassNow();
            clearStageToast();
            pipeline = null;
            toastr.info('중단했습니다.', '', { timeOut: 1500 });
        },

        // 마지막 메시지 빠른 삭제 (성능: 마지막 .mes 하나만 DOM 에서 제거, 채팅 전체 재렌더 없음)
        deleteLastMessage: async function({ confirm = true, silent = false } = {}) {
            try {
                const context = getContext();
                if (!context?.chat?.length) {
                    if (!silent) toastr.warning('삭제할 메시지가 없습니다.');
                    return false;
                }
                if (isBusy()) {
                    toastr.warning('응답 생성 중에는 삭제할 수 없습니다. 먼저 중단해 주십시오.');
                    return false;
                }
                if (confirm && !confirmIfNeeded('ㄹㅇ삭제?')) {
                    debugLog('삭제 취소 (사용자)');
                    return false;
                }

                const before = context.chat.length;
                if (typeof context.deleteLastMessage === 'function') {
                    await context.deleteLastMessage();
                } else {
                    // 아주 오래된 실리: 명령어 경로
                    await context.executeSlashCommandsWithOptions('/del 1', { handleParserErrors: false, handleExecutionErrors: false });
                }
                if (context.chat.length >= before) {
                    throw new Error('메시지 수가 줄지 않음');
                }
                if (typeof context.saveChat === 'function') {
                    await context.saveChat();
                }
                debugLog('마지막 메시지 삭제 완료:', before, '→', context.chat.length);
                if (!silent) toastr.success('마지막 메시지 1개를 삭제했습니다.', '', { timeOut: 1500 });
                return true;
            } catch (error) {
                console.error('깡갤 복사기: 마지막 메시지 삭제 실패', error);
                toastr.error('마지막 메시지 삭제에 실패했습니다.');
                return false;
            }
        },

        // 마지막 '유저' 메시지 삭제 (중간에 있으면 /cut 사용)
        deleteLastUserMessage: async function({ confirm = true } = {}) {
            try {
                const context = getContext();
                const chat = context?.chat || [];
                let index = -1;
                for (let i = chat.length - 1; i >= 0; i--) {
                    if (chat[i].is_user) { index = i; break; }
                }
                if (index === -1) {
                    toastr.warning('삭제할 유저 메시지가 없습니다.');
                    return false;
                }
                if (isBusy()) {
                    toastr.warning('응답 생성 중에는 삭제할 수 없습니다. 먼저 중단해 주십시오.');
                    return false;
                }
                if (confirm && !confirmIfNeeded(`마지막 유저 메시지(#${index})를 삭제하시겠습니까?`)) return false;

                if (index === chat.length - 1) {
                    return await this.deleteLastMessage({ confirm: false, silent: true })
                        && (toastr.success(`유저 메시지 #${index}를 삭제했습니다.`, '', { timeOut: 1500 }), true);
                }
                const result = await context.executeSlashCommandsWithOptions(`/cut ${index}`, { handleParserErrors: false, handleExecutionErrors: false });
                if (result?.isError) throw new Error(result.errorMessage);
                toastr.success(`유저 메시지 #${index}를 삭제했습니다.`, '', { timeOut: 1500 });
                return true;
            } catch (error) {
                console.error('깡갤 복사기: 유저 메시지 삭제 실패', error);
                toastr.error('유저 메시지 삭제에 실패했습니다.');
                return false;
            }
        },

        // 응답 없이 메시지 보내기 (/send 와 동일: 유저 메시지만 추가, 생성 안 함)
        sendWithoutReply: async function(text) {
            try {
                const context = getContext();
                const $input = $('#send_textarea');
                const message = (text !== undefined ? String(text) : String($input.val() || '')).trim();
                if (!message) {
                    toastr.warning('보낼 내용이 없습니다. 입력창에 먼저 적어 주십시오.');
                    return false;
                }
                const sendCommand = context?.SlashCommandParser?.commands?.['send'];
                if (!sendCommand) {
                    toastr.error('메시지를 보낼 수 없습니다. (실리 버전 확인)');
                    return false;
                }
                // 파서를 거치지 않고 콜백 직접 호출 → 파이프(|)나 슬래시가 들어간 문장도 안전
                await sendCommand.callback({}, message);
                if (text === undefined) {
                    $input.val('');
                    $input[0]?.dispatchEvent(new Event('input', { bubbles: true }));
                }
                toastr.success('응답 요청 없이 메시지를 보냈습니다.', '', { timeOut: 1500 });
                return true;
            } catch (error) {
                console.error('깡갤 복사기: 응답 없이 보내기 실패', error);
                toastr.error('메시지 보내기에 실패했습니다.');
                return false;
            }
        },

        // 지금 무엇 때문에 기다리는지 짧은 사유 문자열
        // 유저가 "아, 저것 때문이구나" 정도로 유추할 수 있는 큰 원인만 범용적으로 표시
        describeBusyReason: function() {
            const recent = activeGenerations > 0 && Date.now() - lastStartedAt < 10 * 60 * 1000;
            const type = recent ? lastGenerationType : null;
            if (type === 'quiet') return '확장의 백그라운드 작업(요약·기억·임베딩 등) 완료 대기';
            if (type === 'impersonate') return '대필(임퍼소네이트) 응답 완료 대기';
            if (type === 'swipe') return '스와이프 응답 완료 대기';
            if (type === 'continue') return '이어쓰기 응답 완료 대기';
            if (type === 'regenerate') return '진행 중인 재생성 완료 대기';
            if (type === 'normal') return '진행 중인 다른 응답 완료 대기';
            if (isStopButtonVisible() || isSendButtonHidden()) return '실리가 응답 생성 중(정지 버튼 표시) — 완료 대기';
            return '실리 준비 대기';
        },

        // 삭제 후 재생성 — 겉보기 동작은 예전과 동일: 마지막 메시지(유저 메시지여도)를 지우고 → 응답을 다시 요청
        //  • 마지막이 봇 메시지: 실리의 generate('regenerate') 로 삭제+재생성을 한 번에 (입력창을 읽지 않아 초안 안전)
        //  • 마지막이 유저 메시지: 빠른 삭제 후 generate('normal'). 이때 실리가 입력창을 읽어 보내버리므로
        //    초안을 스냅샷 → 비움 → 실리가 읽고 지나간 직후 이벤트에서 복원 (예전 /trigger 방식의 초안 유실 문제 해결)
        // options.cacheBypass: 'off' | 'light' | 'strong'  (미지정 시 설정 UI 값, 기본 off)
        deleteAndRegenerate: async function(options = {}) {
            const context = getContext();
            if (!context) {
                toastr.error('SillyTavern 컨텍스트를 찾을 수 없습니다.');
                return false;
            }
            if (pipeline) {
                toastr.warning('이미 재생성이 진행 중입니다. 중단하려면 토스트의 [중단]을 눌러 주십시오.');
                return false;
            }
            bindEvents();

            const cacheMode = options.cacheBypass
                || $('#copybot_regen_cache_mode').val()
                || 'off';
            const chat = context.chat || [];
            const lastMessage = chat.length ? chat[chat.length - 1] : null;
            const willDelete = !!lastMessage;
            const lastIsUser = !!(lastMessage && lastMessage.is_user);

            if (willDelete && options.confirm !== false) {
                if (!confirmIfNeeded('마지막 메시지를 삭제하고 다시 생성하시겠습니까?')) return false;
            }

            pipeline = { stage: 'start', cancelled: false, toast: null };
            const WAIT_LIMIT_MS = 5 * 60 * 1000;   // 최대 5분 (너무 느리면 유저가 [중단]을 누름)
            const fmt = (sec) => sec >= 60 ? `${Math.floor(sec / 60)}분 ${sec % 60}초` : `${sec}초`;

            try {
                // 1) 다른 생성이 진행 중이면 끝날 때까지 대기 (사유 표시)
                if (isBusy()) {
                    pipeline.stage = 'waiting';
                    showStageToast(`대기 중: ${this.describeBusyReason()}`);
                    const idle = await waitUntil(() => !isBusy(), {
                        timeoutMs: WAIT_LIMIT_MS,
                        intervalMs: 250,
                        onTick: (sec) => showStageToast(`대기 중: ${this.describeBusyReason()} (${fmt(sec)})`),
                    });
                    if (pipeline?.cancelled) return false;
                    if (!idle) {
                        clearStageToast();
                        pipeline = null;
                        toastr.error('5분이 지나도 생성이 끝나지 않아 재생성을 취소했습니다. 먼저 중단(■)해 주십시오.');
                        return false;
                    }
                }

                // 2) 준비
                pipeline.stage = 'prepare';
                showStageToast(willDelete ? '재생성 준비 중…' : '응답 요청 준비 중…');

                // 끈질기게 재시도 옵션 (기본 off): 실패하면 5→10→20→30초 쉬고, 정해진 시간(기본 5분) 안에서 계속 다시 요청
                const retryEnabled = options.retry !== undefined
                    ? !!options.retry
                    : $('#copybot_regen_retry_toggle').attr('data-enabled') === 'true';
                const retryWindowMs = (options.retryWindowMin || 5) * 60 * 1000;   // 5분 고정
                const retryStartedAt = Date.now();
                const RETRY_DELAYS_SEC = [2, 3, 5];   // 최대 5초 (이후 계속 5초)
                // 첫 시도는 평소 문구, 재시도 중엔 "같은 요청을 다시 보내는 중"임이 보이게
                let currentAttempt = 1;
                const requestingText = () => currentAttempt > 1
                    ? `같은 요청 다시 보내는 중… (${currentAttempt}회째)`
                    : `${willDelete ? '재생성' : '응답'} 요청 중…`;
                clearFrozenRequest();
                const AFTER_DATA = context.event_types?.GENERATE_AFTER_DATA;
                let afterDataHandler = null;
                const detachAfterData = () => { if (afterDataHandler && AFTER_DATA) { try { context.eventSource.removeListener(AFTER_DATA, afterDataHandler); } catch (e) { /* 무시 */ } } afterDataHandler = null; };
                pipeline.detachAfterData = detachAfterData;

                // 실리가 띄우는 오류 토스트 문구를 잡아 "왜 실패했는지"를 재시도 토스트에 보여줌
                let lastErrorText = '';
                const origToastrError = toastr.error;
                toastr.error = function(message, title, opts) {
                    lastErrorText = `${title ? String(title) + ': ' : ''}${String(message ?? '')}`.replace(/<[^>]+>/g, '').trim().slice(0, 140);
                    return origToastrError.call(toastr, message, title, opts);
                };
                pipeline.restoreToastr = () => { toastr.error = origToastrError; };

                // 첫 시도 타입: 봇 메시지면 regenerate(삭제+재생성 한 번에), 유저 메시지면 지우고
                //  지운 뒤 마지막이 유저 메시지면 regenerate(입력창 안 읽음), 봇 메시지면 normal(초안 보호)
                let type = 'regenerate';
                if (lastIsUser) {
                    const deleted = await this.deleteLastMessage({ confirm: false, silent: true });
                    if (!deleted) throw new Error('마지막 유저 메시지 삭제 실패');
                    type = context.chat[context.chat.length - 1]?.is_user ? 'regenerate' : 'normal';
                }
                const firstType = type;
                let lastAttemptBaseLen = context.chat.length;   // 각 시도 직전의 메시지 수 (재시도 타입 판정용)

                // 한 번의 생성 시도. 반환: { ok, stopped, cancelled, reason }
                const attemptOnce = async (genType) => {
                    pipeline.stage = 'requesting';
                    lastErrorText = '';
                    const lenBefore = context.chat.length;
                    lastAttemptBaseLen = lenBefore;
                    const mesBefore = context.chat[lenBefore - 1]?.mes;
                    if (genType === 'normal') this.protectDraftDuringGenerate();
                    // 첫 시도(또는 아직 고정된 요청이 없을 때)만 채팅에 nonce 를 붙여 프롬프트를 새로 조립. 재시도는 채팅을 건드리지 않고
                    // 고정된 최초 요청 데이터를 그대로 재전송(캐시 우회 ON 이면 nonce 문자열만 새것으로 치환)
                    const isReplay = !!frozenRequest;
                    const nonce = isReplay ? null : applyCacheBypass(cacheMode);
                    const replayNonce = (isReplay && cacheMode !== 'off') ? makeNonce() : null;
                    detachAfterData();
                    if (AFTER_DATA) {
                        afterDataHandler = (data) => {
                            detachAfterData();
                            if (isReplay) replayRequest(data, replayNonce);
                            else freezeRequest(data, nonce);
                        };
                        context.eventSource.on(AFTER_DATA, afterDataHandler);
                    }

                    const generatePromise = context.generate(genType, {});
                    generatePromise.catch(() => {});   // 아래에서 처리
                    const startedPromise = onceEvent(context.event_types.GENERATION_STARTED, { timeoutMs: 15000 });
                    const started = await Promise.race([startedPromise, generatePromise.then(() => 'finished-early', () => 'failed-early')]);
                    if (pipeline?.cancelled) return { cancelled: true };
                    if (!started) return { ok: false, reason: '15초 안에 생성이 시작되지 않음' };
                    if (started === 'failed-early') {
                        // 요청 자체가 시작도 못 하고 실패 (서버 연결 불가 등)
                        let msg = '';
                        await generatePromise.catch(e => { msg = String(e?.message || e || ''); });
                        if (/Clicked stop button|abort/i.test(msg)) return { stopped: true };
                        return { ok: false, reason: lastErrorText || msg.slice(0, 140) || '요청 실패' };
                    }

                    pipeline.stage = 'generating';
                    const genStart = Date.now();
                    const baseLen = context.chat.length;
                    const progressTimer = setInterval(() => {
                        if (!pipeline || pipeline.stage !== 'generating') { clearInterval(progressTimer); return; }
                        // 평범한 대기는 문구 하나만 (초·부연 설명 없음). 응답이 흘러들어오기 시작하면 문구만 바꿈
                        const last = context.chat[context.chat.length - 1];
                        const receiving = context.chat.length > baseLen && last && !last.is_user && (last.mes || '').length > 0;
                        showStageToast(receiving ? '응답 받는 중…' : requestingText());
                    }, 1000);
                    pipeline.cleanup = () => { clearInterval(progressTimer); detachAfterData(); };
                    showStageToast(requestingText());

                    // 완료 대기: 1순위 Generate 자체의 종료(스트리밍 포함). 2순위 STOPPED 이벤트(유저 중단).
                    //  ENDED 이벤트는 다른(조용한) 생성 것일 수 있으므로 "ENDED + UI 가 한가함"일 때만 인정.
                    let stoppedByUser = false;
                    let generateError = null;
                    let generateSettled = false;
                    const settled = generatePromise.then(() => { generateSettled = true; }, e => { generateError = e; generateSettled = true; });
                    const stoppedPromise = onceEvent(context.event_types.GENERATION_STOPPED, { timeoutMs: 15 * 60 * 1000 }).then(r => { if (r) stoppedByUser = true; return r; });
                    const endedIdlePromise = (async () => {
                        while (!generateSettled && !stoppedByUser) {
                            const r = await onceEvent(context.event_types.GENERATION_ENDED, { timeoutMs: 15 * 60 * 1000 });
                            if (!r) return false;
                            await delay(300);
                            if (!isBusy()) return true;
                        }
                        return false;
                    })();
                    await Promise.race([settled, stoppedPromise, endedIdlePromise]);
                    await delay(100);
                    if (isBusy() && !stoppedByUser) {
                        await waitUntil(() => !isBusy(), { timeoutMs: 15 * 60 * 1000, intervalMs: 300 });
                    }
                    pipeline.cleanup();
                    this.restoreDraftNow();
                    restoreCacheBypassNow();
                    if (pipeline?.cancelled) return { cancelled: true };

                    if (generateError) {
                        const msg = String(generateError?.message || generateError || '');
                        if (/Clicked stop button|abort/i.test(msg)) return { stopped: true };
                        return { ok: false, reason: lastErrorText || msg.slice(0, 140) };
                    }
                    if (stoppedByUser) return { stopped: true };

                    // 성공 판정: 비어있지 않은 새 봇 응답이 생겼는가
                    const last = context.chat[context.chat.length - 1];
                    const hasReply = !!last && !last.is_user && (last.mes || '').trim().length > 0
                        && (context.chat.length > lenBefore || last.mes !== mesBefore);
                    if (hasReply) return { ok: true };
                    return { ok: false, reason: lastErrorText || '응답을 받지 못함(서버 오류·빈 응답)' };
                };

                for (let attempt = 1; ; attempt++) {
                    pipeline.attempt = attempt;
                    currentAttempt = attempt;
                    const result = await attemptOnce(type);
                    detachAfterData();
                    if (result.cancelled) return false;
                    if (result.stopped) {
                        pipeline.restoreToastr();
                        clearStageToast();
                        pipeline = null;
                        toastr.info('생성이 중단되었습니다.', '', { timeOut: 1500 });
                        return true;
                    }
                    if (result.ok) {
                        pipeline.restoreToastr();
                        clearStageToast();
                        clearFrozenRequest();
                        pipeline = null;
                        // 완료 토스트는 띄우지 않음 (유저 지시: 응답이 보이면 그걸로 충분)
                        return true;
                    }

                    debugLog(`생성 시도 ${attempt} 실패:`, result.reason);
                    const waitSec = RETRY_DELAYS_SEC[Math.min(attempt - 1, RETRY_DELAYS_SEC.length - 1)];
                    const elapsedMs = Date.now() - retryStartedAt;
                    if (!retryEnabled) {
                        throw new Error(result.reason);
                    }
                    if (elapsedMs + waitSec * 1000 > retryWindowMs) {
                        throw new Error(`${Math.round(retryWindowMs / 60000)}분 동안 ${attempt}번 시도했지만 실패 — ${result.reason}`);
                    }

                    // 재시도 대기: 빈 구간에도 입력창 정지(■) 버튼을 유지해 유저가 수동 중단할 수 있게 함
                    // 다음 시도 타입 = "같은 요청을 그대로 다시" (유저가 비행기 버튼을 누르는 것과 다르게):
                    //  • 첫 시도가 regenerate 였으면 계속 regenerate — 실패 뒤 마지막이 유저 메시지면 그 메시지에 다시 답하고,
                    //    끊긴 조각(부분 응답)이 남아 있으면 그걸 지우고 다시 만든다. 입력창은 읽지 않는다.
                    //  • 첫 시도가 normal(유저 메시지 삭제 → 이전 봇 메시지 뒤에 새 응답)이었으면, 실패한 시도가 조각을 남겼을 때만
                    //    regenerate(조각 제거 + 재요청), 아무것도 안 남았으면 다시 normal(초안 보호로 입력창 내용은 안 보냄).
                    const lastNow = context.chat[context.chat.length - 1];
                    const leftover = context.chat.length > lastAttemptBaseLen && lastNow && !lastNow.is_user;
                    type = (firstType === 'regenerate' || leftover || lastNow?.is_user) ? 'regenerate' : 'normal';
                    pipeline.stage = 'retry-wait';
                    if (typeof context.deactivateSendButtons === 'function') { context.deactivateSendButtons(); pipeline.uiDeactivated = true; }
                    const stoppedDuringWait = onceEvent(context.event_types.GENERATION_STOPPED, { timeoutMs: waitSec * 1000 + 1000 });
                    let stopped = false;
                    for (let remain = waitSec; remain > 0; remain--) {
                        const remainWindow = Math.max(0, Math.round((retryWindowMs - (Date.now() - retryStartedAt)) / 1000));
                        showStageToast(`요청 실패 — ${remain}초 후 재요청 (${attempt + 1}회째 시도 · 남은 시간 ${fmt(remainWindow)})${result.reason ? ` · ${result.reason}` : ''}`);
                        const r = await Promise.race([delay(1000).then(() => null), stoppedDuringWait]);
                        if (pipeline?.cancelled) return false;
                        if (r) { stopped = true; break; }
                    }
                    if (typeof context.activateSendButtons === 'function') { context.activateSendButtons(); pipeline.uiDeactivated = false; }
                    if (stopped) {
                        pipeline.restoreToastr();
                        clearStageToast();
                        pipeline = null;
                        toastr.info('재시도를 중단했습니다.', '', { timeOut: 1500 });
                        return true;
                    }
                }
                return false;
            } catch (error) {
                console.error('깡갤 복사기: 삭제 후 재생성 실패', error);
                if (pipeline?.cleanup) pipeline.cleanup();
                if (pipeline?.detachAfterData) pipeline.detachAfterData();
                clearFrozenRequest();
                if (pipeline?.restoreToastr) pipeline.restoreToastr();
                if (pipeline?.uiDeactivated && typeof context.activateSendButtons === 'function') context.activateSendButtons();
                this.restoreDraftNow();
                restoreCacheBypassNow();
                clearStageToast();
                pipeline = null;
                const reason = (error && error.message) ? error.message : '';
                toastr.error(`재생성에 실패했습니다. ${reason}`.trim(), '', { timeOut: 8000 });
                return false;
            }
        },
    };

    if (window.copybot_debug_mode) {
        console.log('깡갤 복사기: generation.js 모듈 로드 완료');
    }
})();
