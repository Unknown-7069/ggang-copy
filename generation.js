// ===================================================================
// 깡갤 복사기 확장프로그램 - generation.js 모듈
// ===================================================================
// 생성·삭제 파이프라인 전용 모듈 (실리 내부 API 직접 사용, 입력창·전송 버튼 미경유)
//
// === 🎯 모듈 역할 ===
// • 마지막 메시지 빠른 삭제 (deleteLastMessage: DOM 1개만 제거, 전체 재렌더 없음)
// • 삭제 후 재생성 파이프라인 (유휴 대기 → 'regenerate' 생성 → 완료 감지), 캐시 우회 옵션
// • 응답 없이 메시지 보내기 (/send 와 동일)
// • 단계별 지속 토스트 + 중단 처리
//
// === 🔗 의존성 ===
// • utils.js (debugLog), SillyTavern.getContext()
// • manifest.json 의 "generate_interceptor": "copybot_regen_interceptor"
//   (그 이름의 전역 함수는 캐시 우회가 켜진 시도 동안에만 존재한다. 평소엔 없어서 실리가 그냥 건너뛴다)
//
// === 📝 왜 'regenerate' 타입인가 ===
// • 예전 방식(/del 1 → /trigger)은 ① /trigger 가 채팅 입력창을 비우고 ② is_send_press 를 최대 10초만
//   기다리다 포기해 재생성이 조용히 씹히는 경우가 있었음(메모리 확장 등이 생성 상태를 잡고 있을 때).
// • 실리의 Generate('regenerate') 는 마지막 봇 메시지 삭제 + 재생성을 한 번에, 입력창을 읽지 않고 처리함.
//   그래서 미전송 초안이 절대 날아가지 않고, 삭제 완료를 따로 폴링할 필요도 없음.
//
// === 🧹 무흔적 원칙 (2026-10-11 유저 지시) ===
// • 재생성은 "도는 동안만" 잠깐 영향을 주고, 새 응답·중단·실패·채팅 전환 뒤에는 아무 일도 없었던 것처럼 돌아간다.
// • 채팅 데이터(context.chat)는 지우기(기능 자체) 말고는 고치지 않는다. 캐시 우회 표식은 실리가 프롬프트용으로 만든 사본에만 싣는다.
// • 리스너·타이머·실리 함수 덧씌움·전송 버튼 잠금·토스트·고정해 둔 요청은 전부 파이프라인 수명에 묶고 releasePipeline 한 곳에서 푼다.
// • 입력창 초안은 실리가 입력창을 읽은 뒤(또는 우리 요청이 끝난 뒤)에만 되돌린다. 그 전에 되돌리면 초안이 메시지로 전송된다.
// • 남의 것은 건드리지 않는다: 드라이런·다른 확장의 조용한 생성이 만든 요청, 남이 덧씌운 실리 함수, 캡처 진행 토스트.
// ===================================================================

(function() {
    'use strict';

    if (!window.CopyBotUtils) {
        console.error('깡갤 복사기: CopyBotGeneration - utils.js 모듈이 로드되지 않음');
        return;
    }

    let isDebugMode = false;

    // 생성 상태 추적 (파이프라인이 도는 동안만 갱신된다 — bindPipelineEvents)
    let activeGenerations = 0;          // GENERATION_STARTED ~ ENDED/STOPPED 사이 카운트
    let lastGenerationType = null;
    let lastStartedAt = 0;

    // 파이프라인 상태
    let pipeline = null;                // { stage, cancelled, released, toast, starts: [] }

    // [중단]했지만 아직 끝나지 않은 우리 요청. 이것이 끝나기 전에는 새 요청을 보내지 않는다.
    // (실리의 중단 신호는 생성을 시작할 때마다 새로 만들어지는 전역 하나라, 앞 요청이 정리되기 전에 새 생성을 시작하면 앞 요청의 중단이 풀려 그대로 전송된다)
    // 정상적으로 끝난 요청은 여기 들어오지 않는다 — 응답 뒤 다른 확장의 후처리(번역·이미지 생성 등)가 길어도 다음 재생성을 막지 않는다
    const abortedInFlight = new Set();
    const ABORTED_STALE_MS = 2 * 60 * 1000;   // 이보다 오래 안 끝난 것은 죽은 것으로 본다 (영원히 막히지 않게)

    function debugLog(...args) {
        window.CopyBotUtils.debugLog(isDebugMode, ...args);
    }

    function getContext() {
        return window.SillyTavern?.getContext?.() || null;
    }

    function hasAbortedInFlight() {
        const now = Date.now();
        for (const entry of abortedInFlight) {
            if (now - entry.at < ABORTED_STALE_MS) return true;
            abortedInFlight.delete(entry);
        }
        return false;
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

    // 캡처 진행 토스트도 같은 모양 클래스(.copybot_stage_toast)를 쓴다 → 재생성 토스트만 집는다 (남의 토스트를 고치거나 지우지 않게)
    const STAGE_TOAST = '.copybot_stage_toast:not(.copybot_capture_toast)';

    function escapeHtml(str) {
        return window.CopyBotUtils.escapeHtml(String(str ?? ''));
    }

    function showStageToast(text, { abortable = true, abortLabel = '중단' } = {}) {
        bindAbortHandler();
        const html = `
            <div class="copybot_stage_toast">
                <span class="copybot_stage_text">${escapeHtml(text)}</span>
                ${abortable ? `<button type="button" class="copybot_stage_abort">${escapeHtml(abortLabel)}</button>` : ''}
            </div>`;
        // 이미 떠 있는 단계 토스트가 있으면(화면에 1개만 유지) 내용만 갱신 — 절대 새로 만들지 않음. 같은 문구면 DOM 도 안 건드림
        const $existing = $(STAGE_TOAST).last().closest('.toast');
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
        const $all = $(STAGE_TOAST).closest('.toast');
        if ($all.length > 1) $all.slice(0, -1).remove();
        return $toast;
    }

    function clearStageToast() {
        if (pipeline && pipeline.toast) {
            toastr.clear(pipeline.toast, { force: true });
            pipeline.toast = null;
        }
        // 혹시 남은 단계 토스트가 있으면 전부 제거 (페이드 중 새로 만들어진 고아 토스트 대비)
        $(STAGE_TOAST).closest('.toast').remove();
        unbindAbortHandler();
    }

    // 토스트 안의 [중단] 버튼 — 토스트가 떠 있는 동안만 문서에 걸어 둔다 (토스트가 사라지면 리스너도 뗀다)
    let abortHandlerBound = false;
    function bindAbortHandler() {
        if (abortHandlerBound) return;
        abortHandlerBound = true;
        $(document).off('click.copybot_stage_abort').on('click.copybot_stage_abort', '.copybot_stage_abort', function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.CopyBotGeneration.abort('사용자 중단');
        });
    }
    function unbindAbortHandler() {
        if (!abortHandlerBound) return;
        abortHandlerBound = false;
        $(document).off('click.copybot_stage_abort');
    }

    // ===================================================================
    // ⏱ 유틸: 조건 대기 / 이벤트 1회 대기
    // ===================================================================

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // isCancelled: 호출한 파이프라인이 취소됐는지(정체성 비교) — 없으면 모듈 전역 pipeline 기준
    // onTick 은 "초가 바뀔 때만" 부른다 (저사양: 토스트 DOM·jQuery 조회를 틱마다 하지 않게)
    async function waitUntil(conditionFn, { timeoutMs = 20000, intervalMs = 150, onTick = null, isCancelled = null } = {}) {
        const started = Date.now();
        let lastSec = -1;
        while (!conditionFn()) {
            if (isCancelled ? isCancelled() : (pipeline && pipeline.cancelled)) return false;
            if (Date.now() - started > timeoutMs) return false;
            if (onTick) {
                const sec = Math.round((Date.now() - started) / 1000);
                if (sec !== lastSec) { lastSec = sec; onTick(sec); }
            }
            await delay(intervalMs);
        }
        return true;
    }

    // 이벤트 1회 대기. 반환 promise 에 cancel() 이 붙어 있어, 더 기다릴 필요가 없어지면 리스너·타이머를 즉시 해제할 수 있다
    // (재시도가 잦으면 15분짜리 리스너가 eventSource 에 수십 개 매달리던 것 방지)
    function onceEvent(eventName, { timeoutMs = 60000 } = {}) {
        const context = getContext();
        let cancel = () => {};
        const promise = new Promise(resolve => {
            if (!context?.eventSource) { resolve(false); return; }
            let done = false;
            let timer = null;
            const finish = (value) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                try { context.eventSource.removeListener(eventName, handler); } catch (e) { /* 무시 */ }
                resolve(value);
            };
            const handler = (...args) => finish({ args });
            context.eventSource.on(eventName, handler);
            timer = setTimeout(() => finish(false), timeoutMs);
            cancel = () => finish(false);
        });
        promise.cancel = () => cancel();
        return promise;
    }

    // ===================================================================
    // 🧠 캐시 우회 (nonce) — 채팅 데이터는 건드리지 않는다
    // ===================================================================

    // mode: 'off' | 'light' | 'strong'
    //  light : 프롬프트에 실리는 마지막 유저 메시지 끝에 보이지 않는 nonce 주석 → 앞부분 캐시는 대부분 유지, 마지막 구간만 변화
    //  strong: 프롬프트 맨 앞(BEFORE_PROMPT)에도 nonce 를 임시 주입 → 접두 캐시 전체 무효화(비용↑, 고착 탈출엔 가장 확실)
    //
    // 예전엔 context.chat 의 유저 메시지 본문에 nonce 를 잠깐 붙였다가 뗐다. 그 사이에 채팅 저장(다른 확장의 지연 저장, 실리가 유저 메시지를
    // 넣으며 하는 저장 등)이 끼면 nonce 가 채팅 파일에 그대로 적히고, 응답을 못 받고 끝나면 다시 저장되지 않아 영구히 남았다.
    // 지금은 실리가 프롬프트를 만들 때 쓰는 "사본 배열"만 고친다: manifest.json 의 generate_interceptor 로 등록된 이름의 전역 함수를
    // 캐시 우회가 켜진 시도 동안에만 만들어 두고, 그 안에서 마지막 유저 메시지 원소를 새 객체로 바꾼다 (2026-10-11 유저 지시로 방식 교체).
    const NONCE_PROMPT_KEY = 'COPYBOT_REGEN_NONCE';
    const INTERCEPTOR_NAME = 'copybot_regen_interceptor';   // manifest.json 의 "generate_interceptor" 와 반드시 같은 이름
    let activeBypass = null;            // { nonce, release() } — 지금 걸려 있는 캐시 우회 (없으면 null)

    function makeNonce() {
        return `regen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    // 반환: { nonce, release } (off 면 null). release 는 몇 번 불러도 같고, 자기가 건 것만 푼다
    function applyCacheBypass(mode) {
        const context = getContext();
        if (!context || mode === 'off' || !mode) return null;
        // 이전 시도의 것이 남아 있으면(요청이 시작도 못 하고 실패한 경우 등) 먼저 푼다 — 겹쳐 걸리지 않게
        releaseCacheBypass();

        const nonce = makeNonce();
        const undo = [];

        if (mode === 'strong' && typeof context.setExtensionPrompt === 'function') {
            const BEFORE_PROMPT = context.extension_prompt_types?.BEFORE_PROMPT ?? 2;
            const SYSTEM = context.extension_prompt_roles?.SYSTEM ?? 0;
            const value = `[session:${nonce}]`;
            context.setExtensionPrompt(NONCE_PROMPT_KEY, value, BEFORE_PROMPT, 0, false, SYSTEM);
            undo.push(() => {
                // 항목 자체를 지운다(빈 값으로도 남기지 않음). 실리가 채팅을 바꾸며 목록을 통째로 갈았을 수 있어 컨텍스트는 새로 얻는다
                const c = getContext();
                const prompts = c?.extensionPrompts;
                if (prompts && typeof prompts === 'object') {
                    if (prompts[NONCE_PROMPT_KEY] && prompts[NONCE_PROMPT_KEY].value === value) delete prompts[NONCE_PROMPT_KEY];
                } else if (typeof c?.setExtensionPrompt === 'function') {
                    c.setExtensionPrompt(NONCE_PROMPT_KEY, '', BEFORE_PROMPT, 0, false, SYSTEM);
                }
            });
            debugLog('캐시 우회(strong): 프롬프트 앞에 nonce 주입', nonce);
        }

        // light(및 strong 의 보조): 프롬프트에 실릴 마지막 유저 메시지 끝에 주석 nonce
        const suffix = `\n<!-- ${nonce} -->`;
        const interceptor = function(promptChat, _contextSize, _abort, type) {
            // 우리 요청(regenerate / normal)에만, 한 번만. 다른 확장의 조용한 생성(quiet)·대필·이어쓰기·스와이프에는 손대지 않는다
            if (type !== undefined && type !== null && type !== 'regenerate' && type !== 'normal') return;
            if (window[INTERCEPTOR_NAME] === interceptor) delete window[INTERCEPTOR_NAME];
            if (!Array.isArray(promptChat)) return;
            for (let i = promptChat.length - 1; i >= 0; i--) {
                const item = promptChat[i];
                if (item && item.is_user && !item.is_system && typeof item.mes === 'string') {
                    // 원소를 "새 객체로 교체"한다. 실리 버전에 따라 원소가 실제 채팅 메시지 객체 그대로일 수 있어, 직접 고치면 채팅이 바뀐다
                    promptChat[i] = Object.assign({}, item, { mes: item.mes + suffix });
                    debugLog('캐시 우회: 프롬프트 사본의 마지막 유저 메시지에 nonce 부착');
                    return;
                }
            }
            debugLog('캐시 우회: 프롬프트에 유저 메시지가 없어 nonce 를 붙일 곳이 없음');
        };
        window[INTERCEPTOR_NAME] = interceptor;
        undo.push(() => { if (window[INTERCEPTOR_NAME] === interceptor) delete window[INTERCEPTOR_NAME]; });

        let released = false;
        const handle = {
            nonce,
            release: () => {
                if (released) return;
                released = true;
                undo.forEach(fn => { try { fn(); } catch (e) { console.error('깡갤 복사기: 캐시 우회 해제 실패', e); } });
                if (activeBypass === handle) activeBypass = null;
                debugLog('캐시 우회: 해제 완료');
            },
        };
        activeBypass = handle;
        return handle;
    }

    function releaseCacheBypass() {
        if (activeBypass) activeBypass.release();
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
    // 📡 생성 상태 추적 — 파이프라인이 도는 동안만 실리 이벤트를 듣는다
    // ===================================================================

    // 반환: 해제 함수. 예전엔 한 번 쓰면 리스너 4개가 세션 내내 남았다 → 파이프라인이 끝나면 전부 떼어 낸다
    function bindPipelineEvents(me) {
        const context = getContext();
        const eventSource = context?.eventSource;
        const event_types = context?.event_types;
        if (!eventSource || !event_types) return () => {};
        const subs = [];
        const on = (name, handler) => {
            if (!name) return;
            eventSource.on(name, handler);
            subs.push([name, handler]);
        };

        activeGenerations = 0;
        lastGenerationType = null;
        lastStartedAt = 0;

        // 주의: STARTED/ENDED 는 짝이 안 맞을 수 있음 (quiet 생성·확장의 generateRaw 등은 ENDED 없이 끝나기도 함).
        // 그래서 카운터는 "무슨 생성인지 설명"하는 용도로만 쓰고, 바쁨 판단은 실리 UI 상태(정지 버튼)로 한다.
        on(event_types.GENERATION_STARTED, (type, _options, dryRun) => {
            if (dryRun === true) return;   // 드라이런(프롬프트 미리보기·토큰 계산)은 실제 생성이 아니다
            activeGenerations++;
            lastGenerationType = type;
            lastStartedAt = Date.now();
            me.starts.push({ type, at: lastStartedAt });   // 요청 고정/재전송 때 "이 조립본이 우리 요청인가" 판정에 쓴다
            debugLog('생성 시작 감지:', type, '활성:', activeGenerations);
        });
        const onFinished = (label) => () => {
            activeGenerations = Math.max(0, activeGenerations - 1);
            debugLog(`생성 ${label} 감지, 활성:`, activeGenerations);
        };
        on(event_types.GENERATION_ENDED, onFinished('종료'));
        on(event_types.GENERATION_STOPPED, onFinished('중단'));
        // 채팅/캐릭터가 바뀌면 진행 중인 재생성 파이프라인은 그 자리에서 취소 — 다른 채팅에서 삭제·재생성이 실행되는 일 방지 (2026-10-11)
        on(event_types.CHAT_CHANGED, () => {
            if (pipeline === me) window.CopyBotGeneration.abort('채팅 전환');
        });
        debugLog('CopyBotGeneration: 파이프라인 이벤트 연결');

        return () => {
            while (subs.length) {
                const [name, handler] = subs.pop();
                try { eventSource.removeListener(name, handler); } catch (e) { /* 무시 */ }
            }
        };
    }

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
    // 🧹 뒷정리 — 파이프라인이 "도는 동안만" 걸어 둔 것을 전부 원래대로
    // ===================================================================
    // 정상 종료·중단·실패·채팅 전환 어디서 끝나든 이 함수 하나를 거친다. 여러 번 불러도 같고, 그 파이프라인이 건 것만 건드린다
    // (중단된 옛 파이프라인의 코드가 뒤늦게 깨어나도 새 파이프라인의 상태를 풀어 버리지 않는다).
    function releasePipeline(me) {
        if (!me || me.released) return;
        me.released = true;
        try { me.cleanup?.(); } catch (e) { /* 무시 */ }
        try { me.detachAfterData?.(); } catch (e) { /* 무시 */ }
        try { me.restoreToastr?.(); } catch (e) { /* 무시 */ }
        try { me.unbindEvents?.(); } catch (e) { /* 무시 */ }
        try { me.unwatchStopButton?.(); } catch (e) { /* 무시 */ }
        if (me.uiDeactivated) {
            // 재시도 대기 중 우리가 잠가 둔 전송 버튼은 반드시 우리가 푼다 (잠긴 채로 남기지 않는다)
            me.uiDeactivated = false;
            try { getContext()?.activateSendButtons?.(); } catch (e) { /* 무시 */ }
        }
        try { me.bypass?.release(); } catch (e) { /* 무시 */ }
        try { me.draft?.release(); } catch (e) { /* 무시 */ }   // 초안은 실리가 입력창을 읽은 뒤에만 실제로 돌아온다
        if (pipeline === me) {
            clearFrozenRequest();
            clearStageToast();
            pipeline = null;
        }
    }

    // ===================================================================
    // 🧩 공개 API
    // ===================================================================

    window.CopyBotGeneration = {

        init: function(config = {}) {
            if (config.isDebugMode !== undefined) isDebugMode = config.isDebugMode;
            // 실리 이벤트 리스너는 재생성 파이프라인이 도는 동안에만 건다 (deleteAndRegenerate → bindPipelineEvents, 끝나면 해제)
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

        // ===== 입력창 초안 보호 (실리가 입력창을 읽어 메시지로 보내 버리는 것을 막음) =====
        // 실리 순서: GENERATION_STARTED → processCommands(입력창) → GENERATION_AFTER_COMMANDS → 서버 핑 → 입력창 읽고 비움(합성 input 이벤트)
        //            → 정지 버튼 표시 → 프롬프트 조립(GENERATE_BEFORE_COMBINE_PROMPTS) → GENERATE_AFTER_DATA → 요청 전송
        // 초안을 떼어 두고(입력창 비움) 실리가 읽고 지나간 뒤에 되돌린다. 실제로 되돌리는 시점은 반드시
        //   ① 실리가 입력창을 이미 읽었거나(guard 해제: 읽은 직후의 합성 input 이벤트 / 우리 요청 데이터 생성 확인)  ② 우리 generate() 가 끝난 뒤.
        // 그 전에 되돌리면 그 글이 유저 메시지로 전송된다 — [중단], 다른 확장의 드라이런 이벤트, 그룹 채팅의 다음 멤버 생성에서 실제로 가능했다 (2026-10-11).
        _draft: null,
        _draftSeq: 0,
        // untilSettled: 한 번의 generate() 안에서 입력창을 여러 번 읽는 경우(그룹 채팅: 멤버마다 읽음) — 전부 끝난 뒤에만 되돌린다
        // 반환: { settled(), release() } — 지킬 초안이 없으면 null (아무것도 걸지 않는다)
        protectDraftDuringGenerate: function({ untilSettled = false } = {}) {
            const context = getContext();
            const $input = $('#send_textarea');
            if (!$input.length) return null;
            // 이전 보호 세션이 남아 있으면 먼저 되돌린다 (그 세션이 건 리스너·타이머도 함께 풀린다)
            this.restoreDraftNow({ force: true });
            const text = String($input.val() || '');
            if (!text) return null;

            const self = this;
            const el = $input[0];
            const d = { text, restored: false, seq: ++this._draftSeq, guard: true, wanted: false, readSeen: false, untilSettled: !!untilSettled, off: [] };
            this._draft = d;
            $input.val('');
            el.dispatchEvent(new Event('input', { bubbles: true }));

            const mine = () => self._draft === d && !d.restored;
            const request = () => { if (mine()) self.restoreDraftNow(); };
            // 실리가 입력창을 읽었다는 증거가 나오면 guard 를 푼다 (untilSettled 면 끝까지 유지)
            const readProven = () => {
                if (!mine()) return;
                d.readSeen = true;
                if (d.untilSettled) return;
                d.guard = false;
                if (d.wanted) self.restoreDraftNow();
            };
            // 증거 1: 실리는 입력창을 읽은 직후 값을 비우고 합성 input 이벤트(isTrusted=false)를 보낸다. 유저가 직접 친 것(isTrusted=true)은 아님
            if (el && typeof el.addEventListener === 'function') {
                const onInput = (e) => {
                    if (e && e.isTrusted) return;
                    if (String(el.value || '') === '') readProven();
                };
                el.addEventListener('input', onInput);
                d.off.push(() => el.removeEventListener('input', onInput));
            }
            // 증거 2: 호출한 쪽이 "방금 만들어진 요청 데이터가 틀림없이 우리 요청"임을 확인했을 때 (반환값의 readProven)
            // 아래 이벤트들은 증거가 아니라 "되돌려 달라"는 요청일 뿐이다 — 다른 확장의 생성·드라이런도 같은 이벤트를 내므로,
            // 이것만 보고 guard 를 풀면 우리 생성이 아직 입력창을 읽기 전인데 초안이 돌아와 전송될 수 있다
            const eventSource = context?.eventSource;
            const et = context?.event_types || {};
            const sub = (name, handler) => {
                if (!eventSource || !name) return;
                eventSource.on(name, handler);
                d.off.push(() => { try { eventSource.removeListener(name, handler); } catch (e) { /* 무시 */ } });
            };
            sub(et.GENERATE_BEFORE_COMBINE_PROMPTS, () => request());
            sub(et.GENERATE_AFTER_DATA, (_data, dryRun) => { if (dryRun !== true) request(); });
            sub(et.GENERATION_ENDED, request);
            sub(et.GENERATION_STOPPED, request);
            // 안전망(15초): 읽기가 확인됐으면 되돌린다. 그때까지 실리가 입력창을 한 번도 읽지 않았으면(서버가 멈췄거나 아주 느림)
            // 자동으로는 되돌리지 않는다 — 지금 되돌리면 실리가 뒤늦게 진행할 때 그 글이 전송된다. 대신 유저가 직접 꺼낼 수 있게 안내만 한다
            const timer = setTimeout(() => {
                if (!mine()) return;
                if (!d.guard) { self.restoreDraftNow(); return; }
                if (d.readSeen) return;   // 그룹 채팅: 멤버 생성이 이어지는 중 → 전부 끝나면 되돌아온다
                toastr.info('입력창에 쓰던 글은 보관 중이며, 요청이 진행되거나 끝나면 자동으로 되돌아옵니다. 지금 꺼내려면 이 알림을 눌러 주십시오.', '', {
                    timeOut: 15000, extendedTimeOut: 5000,
                    onclick: () => { if (mine()) self.restoreDraftNow({ force: true }); },
                });
            }, 15000);
            d.off.push(() => clearTimeout(timer));

            return {
                // 우리 generate() 가 끝났다 → 실리가 더는 입력창을 읽지 않는다
                settled: () => { if (mine()) { d.guard = false; self.restoreDraftNow(); } },
                // 우리 요청 데이터가 만들어진 것이 확인됐다 → 실리는 이미 입력창을 읽고 지나갔다
                readProven,
                // "이제 되돌려도 된다면 되돌려 달라" (아직 실리가 읽기 전이면 읽은 직후로 미뤄진다)
                release: request,
            };
        },
        restoreDraftNow: function({ force = false } = {}) {
            const d = this._draft;
            if (!d || d.restored) return;
            // 실리가 아직 입력창을 읽기 전이면 되돌리지 않는다 — 읽은 직후(또는 우리 요청이 끝난 뒤) 자동으로 되돌아온다
            if (d.guard && !force) { d.wanted = true; return; }
            d.restored = true;
            this._draft = null;
            if (Array.isArray(d.off)) d.off.splice(0).forEach(fn => { try { fn(); } catch (e) { /* 무시 */ } });
            if (!d.text) return;
            const $input = $('#send_textarea');
            if ($input.length) {
                const current = String($input.val() || '');
                if (!current.trim()) {
                    $input.val(d.text);
                    debugLog('입력창 초안 복원 완료');
                } else if (current !== d.text) {
                    // 비워 둔 잠깐 사이에 유저가 새로 친 글이 있으면 초안을 버리지 않고 그 앞에 되돌린다 (초안 유실 방지, 2026-10-11)
                    $input.val(`${d.text}\n${current}`);
                    toastr.info('입력 중이던 글 앞에 이전 초안을 되돌렸습니다.', '', { timeOut: 4000 });
                    debugLog('입력창 초안 병합 복원');
                }
                $input[0].dispatchEvent(new Event('input', { bubbles: true }));
            }
        },

        // 현재 진행 중인 파이프라인/생성 중단
        // 파이프라인은 정체성(객체)으로 다룬다: 취소 표시는 그 객체에 남기고, 전역 pipeline 은 그 객체일 때만 비운다
        // (예전엔 무조건 pipeline=null 이라 진행 중인 코드의 `pipeline?.cancelled` 가 전부 undefined 가 되어 취소가 무시됐음 — 2026-10-11)
        abort: function(reason = '중단') {
            const context = getContext();
            const p = pipeline;
            debugLog('abort 호출:', reason, p?.stage);
            const wasWaiting = !!p && p.stage === 'waiting';
            if (p) {
                p.cancelled = true;
                // 실리 생성을 실제로 멈추는 것은 "우리 요청"이 돌고 있는 단계에서만. 대기(waiting)·재시도 대기 중의 [중단]은 예약 취소이며
                // 그때 돌고 있는 생성은 다른 사람(다른 응답·요약 등)의 것이라 끊지 않는다 (2026-10-11)
                const ours = p.stage === 'requesting' || p.stage === 'generating';
                if (ours) {
                    let stoppedNow = false;
                    try {
                        if (isBusy() && typeof context?.stopGeneration === 'function') {
                            context.stopGeneration();
                            stoppedNow = true;
                        }
                    } catch (e) {
                        console.error('깡갤 복사기: stopGeneration 실패', e);
                    }
                    // 정지 버튼이 뜨기 전(요청 준비 중)이면 지금은 멈출 수 없고, 떠 있어도 아직 요청을 보내기 전(프롬프트 조립 중)이면
                    // 중단이 풀릴 수 있다 → 우리 요청이 실제로 끝날 때까지 지켜보며 멈춘다. 그냥 두면 [중단] 뒤에도 요청이 나가 응답이 생성된다
                    if (typeof p.ensureStopped === 'function') p.ensureStopped(stoppedNow);
                }
                releasePipeline(p);
            } else {
                // 파이프라인이 없을 때 불려도 혹시 남은 것은 정리
                clearFrozenRequest();
                releaseCacheBypass();
                this.restoreDraftNow();
                clearStageToast();
            }
            toastr.info(wasWaiting ? '재생성 예약을 취소했습니다.' : '중단했습니다.', '', { timeOut: 1500 });
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
                // 실리 1.19 "Show more messages" 버그로 #chat 의 DOM 순서가 번호와 어긋나 있으면(§3), 실리의 deleteLastMessage 가
                // 화면에선 엉뚱한 메시지를 지우고 지운 메시지는 남아 보인다 → 삭제 전에 번호순으로 보정(데이터 불변, capture.js fixChatOrder)
                try {
                    const $lastEl = $('#chat .mes[mesid]').last();
                    if ($lastEl.length && Number($lastEl.attr('mesid')) !== before - 1 && typeof window.CopyBotCapture?._fixChatOrder === 'function') {
                        window.CopyBotCapture._fixChatOrder(document.querySelector('#chat'));
                    }
                } catch (e) { /* 보정 실패는 무시 (데이터엔 영향 없음) */ }
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
                        && (toastr.success(`유저 메시지(#${index})를 삭제했습니다.`, '', { timeOut: 1500 }), true);
                }
                const result = await context.executeSlashCommandsWithOptions(`/cut ${index}`, { handleParserErrors: false, handleExecutionErrors: false });
                if (result?.isError) throw new Error(result.errorMessage);
                toastr.success(`유저 메시지(#${index})를 삭제했습니다.`, '', { timeOut: 1500 });
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
        // (생성 종류는 파이프라인이 시작된 뒤에 시작된 생성만 안다. 그 전부터 돌던 생성은 "정지 버튼 표시" 문구로 안내)
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
        //    초안을 떼어 둠 → 실리가 읽고 지나간 뒤에 복원 (예전 /trigger 방식의 초안 유실 문제 해결)
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

            const cacheMode = options.cacheBypass
                || $('#copybot_regen_cache_mode').val()
                || 'off';
            const chat = context.chat || [];
            const lastMessage0 = chat.length ? chat[chat.length - 1] : null;
            const willDelete = !!lastMessage0;

            if (willDelete && options.confirm !== false) {
                // 설정을 읽는 중 예외가 나도(fail-closed) 조용히 죽지 않고 안내하고 멈춘다
                let ok = false;
                try { ok = confirmIfNeeded('마지막 메시지를 삭제하고 다시 생성하시겠습니까?'); }
                catch (e) { console.error('깡갤 복사기: 삭제 확인 설정을 읽지 못함', e); toastr.error('삭제 확인 설정을 읽지 못해 재생성을 취소했습니다.'); return false; }
                if (!ok) return false;
            }

            // 이 파이프라인의 정체성. 취소·교체 판정은 전부 dead() 로 (abort 가 전역 pipeline 을 비워도 이 코드는 자기 객체를 본다)
            const me = { stage: 'start', cancelled: false, released: false, toast: null, starts: [] };
            pipeline = me;
            me.unbindEvents = bindPipelineEvents(me);
            const dead = () => me.cancelled || pipeline !== me;
            // 채팅/캐릭터가 바뀌었는지 (대기·재시도 중 다른 채팅으로 가면 거기서 삭제·생성하면 안 된다)
            const chatIdAtStart = context.chatId ?? (typeof context.getCurrentChatId === 'function' ? context.getCurrentChatId() : null);
            const chatChanged = () => {
                const c = getContext();
                const id = c?.chatId ?? (typeof c?.getCurrentChatId === 'function' ? c.getCurrentChatId() : null);
                return id !== chatIdAtStart;
            };
            // 그룹 채팅은 한 번의 generate() 안에서 멤버마다 따로 생성하고, 그때마다 입력창을 읽는다
            const isGroup = !!context.groupId;
            const WAIT_LIMIT_MS = 5 * 60 * 1000;   // 최대 5분 (너무 느리면 유저가 [중단]을 누름)
            const fmt = (sec) => sec >= 60 ? `${Math.floor(sec / 60)}분 ${sec % 60}초` : `${sec}초`;
            // 지운 유저 메시지 본문(생성이 끝내 실패하면 입력창으로 되돌려 줄 것). 응답이 오면 폐기
            let deletedUserText = '';
            let lenAfterDelete = 0;
            let unsettledGenerates = 0;   // 이 파이프라인이 부른 generate() 중 아직 끝나지 않은 수
            const offerDeletedTextRestore = () => {
                if (!deletedUserText) return;
                const text = deletedUserText;
                deletedUserText = '';
                const c = getContext();
                const cur = c?.chat || [];
                const last = cur[cur.length - 1];
                const gotReply = cur.length > lenAfterDelete && last && !last.is_user && String(last.mes || '').trim().length > 0;
                if (gotReply) return;   // 새 응답이 붙었으면 유저 메시지는 "소비"된 것 — 되돌리지 않음
                const $input = $('#send_textarea');
                if (!$input.length) return;
                const current = String($input.val() || '');
                // 우리 요청이 아직 안 끝났으면(멈춘 서버가 뒤늦게 진행할 수 있음) 입력창에 바로 넣지 않는다 — 넣으면 그 글이 다시 전송될 수 있다
                if (!current.trim() && unsettledGenerates === 0) {
                    $input.val(text);
                    $input[0].dispatchEvent(new Event('input', { bubbles: true }));
                    toastr.info('지웠던 유저 메시지를 입력창에 되돌렸습니다.', '', { timeOut: 6000 });
                } else {
                    toastr.info('지웠던 유저 메시지가 있습니다. 이 알림을 누르면 입력창 끝에 붙입니다.', '', {
                        timeOut: 15000, extendedTimeOut: 5000,
                        onclick: () => { $input.val(`${String($input.val() || '')}\n${text}`); $input[0].dispatchEvent(new Event('input', { bubbles: true })); },
                    });
                }
            };

            // 대기 중(남의 생성이 끝나길 기다리는 동안) 유저가 입력필드의 정지(■) 버튼을 누르면 "전부 멈춰라"로 본다 → 우리 예약도 취소.
            // (■ 는 남의 생성을 멈추고, 그 직후 우리가 지우고 요청하면 유저가 멈춘 자리에서 생성이 다시 시작되는 꼴이 된다, 2026-10-22)
            // 리스너는 대기하는 동안만 건다. 실리 이벤트(GENERATION_STOPPED)로 보지 않는 이유: 우리가 [중단]한 앞 요청을 정리하며 내는 같은 이벤트와 구분이 안 된다
            let stopPressed = false;
            const watchStopButton = () => {
                stopPressed = false;
                $(document).off('click.copybot_wait_stop').on('click.copybot_wait_stop', '#mes_stop', () => { stopPressed = true; });
                me.unwatchStopButton = () => { me.unwatchStopButton = null; $(document).off('click.copybot_wait_stop'); };
            };
            const unwatchStopButton = () => { if (me.unwatchStopButton) me.unwatchStopButton(); };

            try {
                // 1) 다른 생성이 진행 중이면(또는 방금 중단한 우리 요청이 아직 정리되지 않았으면) 끝날 때까지 대기 (사유 표시).
                //    여기서의 [예약 취소]는 다른 생성을 끊지 않는다
                if (isBusy() || hasAbortedInFlight()) {
                    me.stage = 'waiting';
                    showStageToast(`대기 중: ${this.describeBusyReason()}`, { abortLabel: '예약 취소' });
                    watchStopButton();
                    const idle = await waitUntil(() => stopPressed || (!isBusy() && !hasAbortedInFlight()), {
                        timeoutMs: WAIT_LIMIT_MS,
                        intervalMs: 500,
                        isCancelled: dead,
                        onTick: (sec) => { if (!dead()) showStageToast(`대기 중: ${this.describeBusyReason()} (${fmt(sec)})`, { abortLabel: '예약 취소' }); },
                    });
                    unwatchStopButton();
                    if (dead()) return false;
                    if (stopPressed) {
                        releasePipeline(me);
                        toastr.info('정지 버튼이 눌려 재생성 예약을 취소했습니다.', '', { timeOut: 2000 });
                        return false;
                    }
                    if (!idle) {
                        releasePipeline(me);
                        toastr.error('5분이 지나도 생성이 끝나지 않아 재생성을 취소했습니다. 먼저 중단(■)해 주십시오.');
                        return false;
                    }
                }
                if (chatChanged()) throw new Error('채팅이 바뀌어 재생성을 취소했습니다.');

                // 2) 준비 — 마지막 메시지는 대기 뒤에 다시 본다 (기다리는 사이 응답이 붙었을 수 있음)
                me.stage = 'prepare';
                showStageToast(willDelete ? '재생성 준비 중…' : '응답 요청 준비 중…');
                const lastMessage = context.chat.length ? context.chat[context.chat.length - 1] : null;
                const lastIsUser = !!(lastMessage && lastMessage.is_user);

                // 끈질기게 재시도 옵션 (기본 off): 실패하면 2→3→5초 쉬고(이후 계속 5초), 정해진 시간(기본 5분) 안에서 계속 다시 요청
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
                me.detachAfterData = detachAfterData;

                // 실리가 띄우는 오류 토스트 문구를 잡아 "왜 실패했는지"를 재시도 토스트에 보여줌
                let lastErrorText = '';
                const origToastrError = toastr.error;
                const captureToastrError = function(message, title, opts) {
                    if (!me.released) lastErrorText = `${title ? String(title) + ': ' : ''}${String(message ?? '')}`.replace(/<[^>]+>/g, '').trim().slice(0, 140);
                    return origToastrError.call(toastr, message, title, opts);
                };
                toastr.error = captureToastrError;
                // 되돌릴 때, 그 사이 다른 코드가 그 위에 덧씌워 놓았으면 건드리지 않는다(남의 것을 덮지 않게). 우리 것은 끝난 뒤엔 그냥 통과만 시킨다
                me.restoreToastr = () => { if (toastr.error === captureToastrError) toastr.error = origToastrError; };

                // 첫 시도 타입: 봇 메시지면 regenerate(실리가 삭제+재생성을 한 번에), 유저 메시지면 우리가 지우고
                //  지운 뒤 마지막이 유저 메시지면 regenerate(입력창 안 읽음), 봇 메시지면 normal(초안 보호)
                // 그룹 채팅: 실리의 Generate('regenerate') 는 그룹이면 멤버별 'normal' 생성으로 바뀌어 아무것도 지우지 않는다 → 봇 메시지여도 우리가 지운다
                let type = 'regenerate';
                if (lastIsUser || (isGroup && lastMessage)) {
                    if (dead()) return false;
                    if (lastIsUser) deletedUserText = String(lastMessage.mes || '');
                    const deleted = await this.deleteLastMessage({ confirm: false, silent: true });
                    if (!deleted) { deletedUserText = ''; throw new Error('마지막 메시지 삭제 실패'); }
                    lenAfterDelete = context.chat.length;
                    type = context.chat[context.chat.length - 1]?.is_user ? 'regenerate' : 'normal';
                }
                // 이 파이프라인이 지워도 되는 것은 ① 첫 시도의 그 한 개 ② 실패한 시도가 남긴 조각(그 시도 중에 새로 생긴 봇 메시지)뿐이다.
                // 재시도 타입은 "지금 마지막 메시지가 무엇인가"로만 정한다 — 첫 시도가 regenerate 였다는 이유로 계속 regenerate 를 쓰면,
                // 마지막이 시스템/해설 메시지처럼 유저 메시지가 아닌 것일 때 실리가 재시도마다 한 개씩 더 지운다 (2026-10-22 유저 보고).
                let beforeAttempt = new Set();                   // 시도 직전에 있던 메시지 객체들 (조각 판정은 정체성으로)

                // 한 번의 생성 시도. 반환: { ok, stopped, cancelled, reason }
                const attemptOnce = async (genType) => {
                    if (dead()) return { cancelled: true };
                    if (chatChanged()) throw new Error('채팅이 바뀌어 재생성을 취소했습니다.');
                    me.stage = 'requesting';
                    lastErrorText = '';
                    const lenBefore = context.chat.length;
                    beforeAttempt = new Set(context.chat);
                    const mesBefore = context.chat[lenBefore - 1]?.mes;
                    const startMark = me.starts.length;   // 이 시도에서 generate 를 부른 뒤에 시작된 "실제 생성"만 본다
                    const calledAt = Date.now();

                    // 실리가 입력창을 읽는 경우 초안을 떼어 둔다: normal 타입, 그리고 그룹 채팅(타입과 무관하게 멤버마다 입력창을 읽는다)
                    const draft = (genType === 'normal' || isGroup) ? this.protectDraftDuringGenerate({ untilSettled: isGroup }) : null;
                    me.draft = draft;
                    // 첫 시도(또는 아직 고정된 요청이 없을 때)만 프롬프트를 새로 조립하며 nonce 를 싣는다. 재시도는
                    // 고정된 최초 요청 데이터를 그대로 재전송(캐시 우회 ON 이면 nonce 문자열만 새것으로 치환)
                    const isReplay = !!frozenRequest;
                    const bypass = isReplay ? null : applyCacheBypass(cacheMode);
                    me.bypass = bypass;
                    const nonce = bypass ? bypass.nonce : null;
                    const replayNonce = (isReplay && cacheMode !== 'off') ? makeNonce() : null;
                    let requestBuilt = false;
                    detachAfterData();
                    if (AFTER_DATA) {
                        afterDataHandler = (data, dryRun) => {
                            // 드라이런(프롬프트 미리보기·토큰 계산) 조립본은 요청이 아니다 — 건드리지 않고 실제 요청을 계속 기다린다
                            if (dryRun === true) return;
                            // 이미 정리된 파이프라인이면 아무것도 하지 않는다 (실리는 이벤트를 보낼 때 리스너 목록의 사본을 돌기 때문에,
                            // 같은 이벤트를 처리하는 도중에 떼어 낸 리스너도 한 번은 더 불릴 수 있다)
                            if (me.released) return;
                            detachAfterData();
                            // 이 조립본이 우리 요청이라고 확신할 수 있을 때만 손댄다. 그 사이 다른 생성(요약 같은 조용한 생성, 그룹의 멤버별 생성)이
                            // 시작됐으면 남의 요청일 수 있다 → 고정/바꿔치기를 하지 않고(남의 요청을 우리 것으로 덮어쓰지 않게),
                            // 임시 주입(nonce)도 우리 요청이 아직 조립 전일 수 있으니 이 시도가 끝날 때까지 그대로 둔다
                            const since = me.starts.slice(startMark);
                            const quietJustBefore = me.starts.slice(0, startMark).some(s => s.type === 'quiet' && calledAt - s.at < 10000);
                            if (since.length !== 1 || since[0].type !== genType || quietJustBefore) {
                                debugLog('다른 생성이 끼어 있어 요청 고정/재전송을 건너뜀', since.map(s => s.type));
                                return;
                            }
                            requestBuilt = true;             // 우리 요청 데이터가 만들어졌다 = 곧바로 전송된다
                            if (bypass) bypass.release();    // 임시 주입은 여기서 걷는다
                            if (draft) draft.readProven();   // 실리는 이미 입력창을 읽고 지나갔다
                            if (isReplay) replayRequest(data, replayNonce);
                            else freezeRequest(data, nonce);
                        };
                        context.eventSource.on(AFTER_DATA, afterDataHandler);
                    }
                    // 성공 판정 보조: 이 시도 중 새 봇 메시지가 "도착"했다는 이벤트 (같은 글이 다시 와도 성공으로 인정)
                    let receivedEvent = false;
                    const RECEIVED = context.event_types?.MESSAGE_RECEIVED;
                    const onReceived = () => { receivedEvent = true; };
                    if (RECEIVED) context.eventSource.on(RECEIVED, onReceived);
                    const detachReceived = () => { if (RECEIVED) { try { context.eventSource.removeListener(RECEIVED, onReceived); } catch (e) { /* 무시 */ } } };
                    // 이 시도가 건 것 정리 (nonce·리스너·타이머가 다음 시도나 종료 뒤까지 남지 않게). 초안은 실리가 입력창을 읽은 뒤에만 실제로 돌아온다
                    let progressTimer = null;
                    const attemptCleanup = () => {
                        if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
                        detachAfterData();
                        detachReceived();
                        if (bypass) bypass.release();
                        if (draft) draft.release();
                    };
                    me.cleanup = attemptCleanup;

                    // GENERATION_STARTED 리스너는 generate() 를 부르기 전에 건다 (실리 버전에 따라 호출과 같은 틱에 이벤트가 나갈 수 있다)
                    const startedPromise = onceEvent(context.event_types.GENERATION_STARTED, { timeoutMs: 15000 });
                    let generateSettled = false;
                    let generateFailed = false;
                    let generateError = null;
                    let stopWatchOff = () => {};
                    let generatePromise;
                    // normal 타입은 "유저가 보낸 것이 아님"(automatic_trigger)으로 부른다: 우리는 응답만 다시 청하는 것이므로 실리가 유저 메시지를
                    // 새로 넣으면 안 된다 — 이 표시가 없으면 실리는 '빈 입력 시 보낼 문구' 설정값이나 첨부해 둔 파일을 유저 메시지로 올려 버린다
                    const generateOptions = genType === 'normal' ? { automatic_trigger: true } : {};
                    try { generatePromise = Promise.resolve(context.generate(genType, generateOptions)); }
                    catch (e) { generatePromise = Promise.reject(e); }
                    const abortEntry = { at: 0 };
                    unsettledGenerates++;
                    const settled = generatePromise.then(() => {}, (e) => { generateFailed = true; generateError = e; }).then(() => {
                        generateSettled = true;
                        unsettledGenerates = Math.max(0, unsettledGenerates - 1);
                        abortedInFlight.delete(abortEntry);
                        stopWatchOff();
                        if (draft) draft.settled();   // 실리가 더는 입력창을 읽지 않는다 → 초안을 되돌려도 안전
                    });
                    // 취소·중단 뒤 입력창을 건드리기(초안·지운 글 되돌리기) 전에 우리 요청이 실제로 끝나길 잠깐 기다린다
                    const waitSettled = (ms) => (generateSettled ? Promise.resolve() : Promise.race([settled, delay(ms)]));

                    // 우리 요청이 도는 중에 [중단]이 눌리면 abort() 가 부른다.
                    //  • 요청이 이미 나간 뒤(requestBuilt)면 abort() 의 중단 한 번으로 충분하다 — 아무것도 걸지 않는다
                    //    (응답 뒤 다른 확장의 후처리가 길어도 다음 재생성을 막지 않고, 유저가 새로 시작한 생성을 건드리지도 않는다)
                    //  • 아직 요청을 보내기 전(준비·조립 중)이면: 정지 버튼이 뜨기 전이라 못 멈췄거나, 멈췄어도 그 사이 다른 생성(드라이런 등)이
                    //    실리의 중단 신호를 새로 만들어 풀릴 수 있다 → 요청 데이터가 만들어지는 순간(전송 직전)에 멈춘다. 끝날 때까지 새 재생성은 대기
                    me.ensureStopped = (alreadyStopped) => {
                        me.ensureStopped = null;
                        if (generateSettled || requestBuilt) return;
                        abortEntry.at = Date.now();
                        abortedInFlight.add(abortEntry);
                        const since = Date.now();
                        let busySince = 0;
                        let earlyStopped = !!alreadyStopped;
                        let watch = null;
                        // 그룹 채팅은 우리 요청 하나 안에서 멤버마다 생성 시작 이벤트가 나므로 "새 생성" 판별을 하지 않는다
                        // (그룹 생성 중에는 실리가 다른 전송을 받지 않아, 유저가 새로 시작한 생성과 겹칠 일도 없다)
                        const STARTED = isGroup ? null : context.event_types?.GENERATION_STARTED;
                        let disarmed = false;   // 떼어 낸 뒤에도 같은 이벤트 처리 중이면 한 번 더 불릴 수 있다 → 그때는 아무것도 하지 않는다
                        const off = () => {
                            disarmed = true;
                            if (watch) { clearInterval(watch); watch = null; }
                            if (AFTER_DATA) { try { context.eventSource.removeListener(AFTER_DATA, onData); } catch (e) { /* 무시 */ } }
                            if (STARTED) { try { context.eventSource.removeListener(STARTED, onStarted); } catch (e) { /* 무시 */ } }
                            stopWatchOff = () => {};
                        };
                        const stop = () => {
                            try { getContext()?.stopGeneration?.(); } catch (e) { console.error('깡갤 복사기: stopGeneration 실패', e); }
                        };
                        // 요청 데이터가 막 만들어진 시점 = 전송 직전. 여기서 멈추면 요청이 서버로 나가지 않는다
                        const onData = (_data, dryRun) => {
                            if (disarmed || dryRun === true) return;
                            off();
                            if (!generateSettled) stop();
                        };
                        // [중단] 뒤에 "새" 생성이 시작됐다(유저가 직접 보냈거나 다른 확장) → 그건 우리 것이 아니다. 손을 뗀다(남의 생성을 끊지 않게)
                        // 우리 요청의 시작 이벤트가 아직 안 왔던 경우엔 첫 번째 것이 우리 것이므로 넘긴다
                        let ownStartPending = me.starts.length === startMark;
                        const onStarted = (_type, _options, dryRun) => {
                            if (disarmed || dryRun === true) return;
                            if (ownStartPending) { ownStartPending = false; return; }
                            off();
                        };
                        if (AFTER_DATA) context.eventSource.on(AFTER_DATA, onData);
                        if (STARTED) context.eventSource.on(STARTED, onStarted);
                        watch = setInterval(() => {
                            if (disarmed) return;
                            if (generateSettled || Date.now() - since > 60000) { off(); abortedInFlight.delete(abortEntry); return; }
                            // 요청 데이터 이벤트가 오지 않는 경우 대비: 정지 버튼이 뜬 채 3초가 지나면 한 번 멈춘다
                            if (!isBusy()) { busySince = 0; return; }
                            if (!busySince) busySince = Date.now();
                            if (!earlyStopped && Date.now() - busySince > 3000) { earlyStopped = true; stop(); }
                        }, 100);
                        stopWatchOff = off;
                    };

                    const settledTag = settled.then(() => (generateFailed ? 'failed-early' : 'finished-early'));
                    let started = await Promise.race([startedPromise, settledTag]);
                    startedPromise.cancel();
                    if (!started && !generateSettled && !dead()) {
                        // 15초 안에 시작 이벤트가 없지만 generate() 는 아직 살아 있다(탭이 얼었다 풀렸거나 실리가 매우 느림).
                        // 여기서 실패로 치고 재요청하면 요청이 겹쳐 실리가 메시지를 두 번 지우거나 응답이 둘 생긴다 → 끝나거나 시작할 때까지 기다린다
                        showStageToast('실리 응답 대기 중…');
                        const lateStart = onceEvent(context.event_types.GENERATION_STARTED, { timeoutMs: 15 * 60 * 1000 });
                        let stopPoll = false;   // 취소 감시 폴링은 이 대기가 끝나면 바로 멈춘다 (파이프라인 끝까지 남지 않게)
                        const deadPoll = (async () => { while (!stopPoll && !dead()) await delay(300); return false; })();
                        started = await Promise.race([lateStart, settledTag, deadPoll]);
                        stopPoll = true;
                        lateStart.cancel();
                    }
                    if (dead()) { attemptCleanup(); await waitSettled(15000); return { cancelled: true }; }
                    if (!started) { attemptCleanup(); return { ok: false, reason: '생성이 시작되지 않음' }; }
                    if (started === 'failed-early') {
                        // 요청 자체가 시작도 못 하고 실패 (서버 연결 불가 등)
                        attemptCleanup();
                        const msg = String(generateError?.message || generateError || '');
                        if (/Clicked stop button|abort/i.test(msg)) return { stopped: true };
                        return { ok: false, reason: lastErrorText || msg.slice(0, 140) || '요청 실패' };
                    }

                    me.stage = 'generating';
                    const baseLen = context.chat.length;
                    progressTimer = setInterval(() => {
                        if (dead() || me.stage !== 'generating') { clearInterval(progressTimer); progressTimer = null; return; }
                        // 평범한 대기는 문구 하나만 (초·부연 설명 없음). 응답이 흘러들어오기 시작하면 문구만 바꿈
                        const last = context.chat[context.chat.length - 1];
                        const receiving = context.chat.length > baseLen && last && !last.is_user && (last.mes || '').length > 0;
                        showStageToast(receiving ? '응답 받는 중…' : requestingText());
                    }, 1000);
                    showStageToast(requestingText());

                    // 비어있지 않은 새 봇 응답이 생겼는가 (도착 이벤트가 있으면 같은 글이 다시 와도 인정)
                    // 실리는 스트리밍을 시작하며 '...' 자리표시 메시지를 먼저 넣고, 스트림이 끊기면 그 메시지를 그대로 둔 채 도착 이벤트까지 보낸다 → '...' 는 응답이 아니다
                    const replyPresent = () => {
                        const last = context.chat[context.chat.length - 1];
                        const text = String(last?.mes || '').trim();
                        return !!last && !last.is_user && text.length > 0 && text !== '...'
                            && (receivedEvent || context.chat.length > lenBefore || last.mes !== mesBefore);
                    };

                    // 완료 대기: 1순위 Generate 자체의 종료(스트리밍 포함). 2순위 STOPPED 이벤트(유저 중단).
                    //  3순위 "ENDED + UI 가 한가함 + 새 응답이 있음" — 응답은 다 왔는데 다른 확장의 후처리 때문에 Generate 가 늦게 끝나는 경우.
                    //  ENDED 와 한가함만으로는 인정하지 않는다: 실리의 바쁨 표시는 하나뿐이라 다른(조용한) 생성이 끝나며 풀어도 똑같이 보이고,
                    //  그때 우리 요청은 아직 가는 중일 수 있다(그걸 실패로 보고 재요청하면 요청이 겹친다).
                    let stoppedByUser = false;
                    let waitOver = false;
                    const stoppedRaw = onceEvent(context.event_types.GENERATION_STOPPED, { timeoutMs: 15 * 60 * 1000 });
                    const stoppedPromise = stoppedRaw.then(r => { if (r) stoppedByUser = true; return r; });
                    let endedRaw = null;
                    const endedIdlePromise = (async () => {
                        while (!generateSettled && !stoppedByUser && !waitOver && !dead()) {
                            endedRaw = onceEvent(context.event_types.GENERATION_ENDED, { timeoutMs: 15 * 60 * 1000 });
                            const r = await endedRaw;
                            if (!r) return false;
                            await delay(300);
                            if (!isBusy() && replyPresent()) return true;
                        }
                        return false;
                    })();
                    await Promise.race([settled, stoppedPromise, endedIdlePromise]);
                    await delay(100);
                    if (isBusy() && !stoppedByUser && !dead()) {
                        await waitUntil(() => !isBusy(), { timeoutMs: 15 * 60 * 1000, intervalMs: 300, isCancelled: dead });
                    }
                    // 더 기다릴 필요가 없어진 이벤트 리스너는 즉시 해제 (15분 타이머가 매달려 남지 않게)
                    waitOver = true;
                    stoppedRaw.cancel();
                    if (endedRaw) endedRaw.cancel();
                    attemptCleanup();
                    if (dead()) { await waitSettled(15000); return { cancelled: true }; }

                    if (generateSettled && generateFailed) {
                        const msg = String(generateError?.message || generateError || '');
                        if (/Clicked stop button|abort/i.test(msg)) return { stopped: true };
                        return { ok: false, reason: lastErrorText || msg.slice(0, 140) };
                    }
                    if (stoppedByUser) { await waitSettled(5000); return { stopped: true }; }

                    // 성공 판정: 비어있지 않은 새 봇 응답이 생겼는가
                    if (replyPresent()) return { ok: true };
                    return { ok: false, reason: lastErrorText || '응답을 받지 못함(서버 오류·빈 응답)' };
                };

                for (let attempt = 1; ; attempt++) {
                    me.attempt = attempt;
                    currentAttempt = attempt;
                    const result = await attemptOnce(type);
                    detachAfterData();
                    if (result.cancelled) { offerDeletedTextRestore(); return false; }
                    if (result.stopped) {
                        releasePipeline(me);
                        toastr.info('생성이 중단되었습니다.', '', { timeOut: 1500 });
                        offerDeletedTextRestore();   // 응답 없이 멈췄으면 지운 유저 메시지를 되돌릴 수 있게
                        return true;
                    }
                    if (result.ok) {
                        releasePipeline(me);
                        deletedUserText = '';   // 응답을 받았으니 지운 유저 메시지는 소비됨
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
                    if (chatChanged()) throw new Error('채팅이 바뀌어 재생성을 취소했습니다.');

                    // 재시도 대기: 빈 구간에도 입력창 정지(■) 버튼을 유지해 유저가 수동 중단할 수 있게 함
                    // 다음 시도 타입 = "같은 요청을 그대로 다시" (유저가 비행기 버튼을 누르는 것과 다르게). 무엇을 더 지우느냐가 핵심:
                    //  • 실패한 시도가 조각(그 시도 중 새로 생긴 봇 메시지 — '...' 자리표시·끊긴 부분 응답)을 남겼으면 regenerate 로 그 조각만 지우고 다시.
                    //  • 조각이 없고 마지막이 유저 메시지면 regenerate(실리는 유저 메시지를 지우지 않고 입력창도 안 읽는다).
                    //  • 조각이 없고 마지막이 유저 메시지가 아니면(봇·시스템·해설) normal + 초안 보호 — regenerate 를 쓰면 실리가 그 메시지를 지운다.
                    //    (첫 시도가 regenerate 였다고 계속 regenerate 를 쓰던 예전 규칙이 재시도마다 한 개씩 더 지우던 원인, 2026-10-22)
                    //  • 그룹 채팅은 실리 regenerate 가 아무것도 지우지 않으므로 조각은 우리가 지우고 normal 로.
                    const lenAtFail = context.chat.length;
                    let lastNow = context.chat[lenAtFail - 1];
                    const tailKey = (m) => (m ? `${m.is_user ? 'u' : 'b'}|${m.send_date ?? ''}|${m.mes ?? ''}` : '');
                    // 조각 = 이 시도 전엔 없던 새 객체이면서 본문이 비었거나 '...' 인 것. 본문 조건까지 두는 이유: 다른 확장이 채팅을 통째로
                    // 다시 불러오면(객체가 전부 새것) 진짜 메시지도 "새 객체"가 되는데, 그것을 조각으로 보고 지우면 안 된다. 본문이 있는 새 봇 메시지는
                    // 위 replyPresent 가 응답으로 인정해 여기까지 오지 않으므로, 진짜 조각이 이 조건에 걸리지 않는 경우는 없다
                    const tailText = String(lastNow?.mes || '').trim();
                    const leftover = !!lastNow && !lastNow.is_user && !beforeAttempt.has(lastNow) && (tailText === '' || tailText === '...');
                    if (leftover && isGroup) {
                        const removed = await this.deleteLastMessage({ confirm: false, silent: true });
                        if (!removed) throw new Error('실패한 시도가 남긴 조각을 지우지 못했습니다.');
                        lastNow = context.chat[context.chat.length - 1];
                    }
                    // 첫 시도가 지우기 전에 실패해(서버 연결 불가 등) 원래 지우려던 그 봇 메시지가 아직 마지막이면, 그것은 지워도 되는 한 개다
                    const originalStillLast = !isGroup && !!lastMessage && !lastIsUser && lastNow === lastMessage;
                    type = ((leftover && !isGroup) || originalStillLast || lastNow?.is_user) ? 'regenerate' : 'normal';
                    const lenBeforeWait = context.chat.length;
                    const tailBeforeWait = tailKey(lastNow);
                    me.stage = 'retry-wait';
                    me.lockMark = me.starts.length;   // 잠근 뒤에 다른 생성이 시작됐는지 보려고 (시작됐으면 그 생성이 끝나길 기다렸다가 푼다)
                    if (typeof context.deactivateSendButtons === 'function') { context.deactivateSendButtons(); me.uiDeactivated = true; }
                    const stoppedDuringWait = onceEvent(context.event_types.GENERATION_STOPPED, { timeoutMs: waitSec * 1000 + 1000 });
                    let stopped = false;
                    for (let remain = waitSec; remain > 0; remain--) {
                        const remainWindow = Math.max(0, Math.round((retryWindowMs - (Date.now() - retryStartedAt)) / 1000));
                        showStageToast(`요청 실패 — ${remain}초 후 재요청 (${attempt + 1}회째 시도 · 남은 시간 ${fmt(remainWindow)})${result.reason ? ` · ${result.reason}` : ''}`);
                        const r = await Promise.race([delay(1000).then(() => null), stoppedDuringWait]);
                        if (dead()) { stoppedDuringWait.cancel(); offerDeletedTextRestore(); return false; }
                        if (r) { stopped = true; break; }
                    }
                    stoppedDuringWait.cancel();
                    if (stopped) {
                        releasePipeline(me);
                        toastr.info('재시도를 중단했습니다.', '', { timeOut: 1500 });
                        offerDeletedTextRestore();
                        return true;
                    }
                    // 쉬는 사이 다른 생성(요약 같은 조용한 생성 등)이 시작됐으면: 실리의 바쁨 표시는 하나뿐이라 지금 풀면 그 생성의 표시까지 지워지고,
                    // 바로 재요청하면 요청이 겹친다 → 그 생성이 끝날 때까지(최대 30초) 기다린 뒤에 풀고 진행한다
                    if (me.starts.length > me.lockMark && isBusy()) {
                        me.stage = 'waiting';
                        const remainMs = Math.max(0, retryWindowMs - (Date.now() - retryStartedAt));
                        watchStopButton();   // 이 대기 중의 ■ 도 "전부 멈춰라"
                        await waitUntil(() => stopPressed || !isBusy(), {
                            timeoutMs: Math.min(30000, remainMs),
                            intervalMs: 500,
                            isCancelled: dead,
                            onTick: (sec) => { if (!dead()) showStageToast(`대기 중: ${this.describeBusyReason()} (${fmt(sec)})`, { abortLabel: '예약 취소' }); },
                        });
                        unwatchStopButton();
                        if (dead()) { offerDeletedTextRestore(); return false; }
                        if (stopPressed) {
                            releasePipeline(me);
                            toastr.info('정지 버튼이 눌려 재시도를 중단했습니다.', '', { timeOut: 2000 });
                            offerDeletedTextRestore();
                            return true;
                        }
                    }
                    if (me.uiDeactivated) {
                        me.uiDeactivated = false;
                        if (typeof context.activateSendButtons === 'function') context.activateSendButtons();
                    }
                    // 쉬는 사이 채팅이 달라졌으면(유저가 직접 보냈거나, 다른 것이 메시지를 넣거나 지움) "같은 요청을 다시"가 성립하지 않는다.
                    // 그대로 재요청하면 방금 생긴 메시지를 지우고 다시 만들게 된다 → 그만둔다
                    if (context.chat.length !== lenBeforeWait || tailKey(context.chat[context.chat.length - 1]) !== tailBeforeWait) {
                        throw new Error('쉬는 사이 채팅이 바뀌어 재요청을 취소했습니다.');
                    }
                    // 탭이 얼었다 풀리면(폰에서 다른 앱을 쓰다 돌아옴) 위 대기 타이머가 한참 뒤에 깨어난다. 그때 5분 창이 이미 지났으면
                    // 조용히 그만둔다 — 유저가 잊은 지 오래인 요청이 창을 다시 켜는 순간 나가면 안 된다 (2026-10-22)
                    if (Date.now() - retryStartedAt > retryWindowMs) {
                        throw new Error(`${Math.round(retryWindowMs / 60000)}분이 지나 재요청을 그만뒀습니다 — ${result.reason || '요청 실패'}`);
                    }
                    // 앞 시도의 generate() 가 아직 안 끝났으면(얼었던 탭·느린 서버) 끝날 때까지 기다린다 — 겹쳐 보내면 실리가 두 번 지운다
                    if (unsettledGenerates > 0) {
                        await waitUntil(() => unsettledGenerates === 0, { timeoutMs: 30000, intervalMs: 200, isCancelled: dead });
                        if (dead()) { offerDeletedTextRestore(); return false; }
                        if (unsettledGenerates > 0) throw new Error('앞 요청이 끝나지 않아 재요청을 취소했습니다.');
                    }
                }
                return false;
            } catch (error) {
                const cancelled = me.cancelled;
                releasePipeline(me);
                if (!cancelled) {
                    console.error('깡갤 복사기: 삭제 후 재생성 실패', error);
                    const reason = (error && error.message) ? error.message : '';
                    toastr.error(`재생성에 실패했습니다. ${reason}`.trim(), '', { timeOut: 8000 });
                }
                offerDeletedTextRestore();   // 끝내 응답을 못 받았으면 지운 유저 메시지를 입력창으로
                return false;
            } finally {
                // 어떤 경로로 끝나든 여기서 한 번 더 — 이 파이프라인이 건 것은 하나도 남기지 않는다
                releasePipeline(me);
            }
        },
    };

    if (window.copybot_debug_mode) {
        console.log('깡갤 복사기: generation.js 모듈 로드 완료');
    }
})();
