// 페르소나 생성순: 실리의 FilterHelper 확장 지점과 기존 페이지/카드 렌더러를 사용합니다.
// 감시·폴링·실리 함수 교체 없음. OFF에서는 필터와 입력 리스너를 모두 제거합니다.
(function () {
    'use strict';
    const KEY = 'copybot_persona_created';
    const modes = ['oldest', 'newest', 'modified_oldest', 'modified_newest'];
    let enabled = false, mode = '', api = null, select = null, options = [], revision = 0;
    const dates = new Map();
    let pending = null, controller = null;
    let uploadInput = null, subscriptions = [];

    function invalidate(value) {
        if (!enabled) return;
        const id = typeof value === 'string' ? value : value?.avatarId;
        if (id) dates.delete(id);
    }

    function onUpload() { invalidate(document.getElementById('avatar_upload_overwrite')?.value); }

    function creationTime(id) {
        return dates.get(id)?.created ?? null;
    }

    function modifiedTime(id) { return dates.get(id)?.modified ?? null; }

    // 생성순은 addedTimestamp, 수정순은 mtime을 사용합니다. 파일명이나 서로의 날짜로 추측하지 않습니다.
    // 정렬 선택 또는 네이티브 목록 갱신 때 누락분만 읽습니다. OFF는 요청을 취소하고 캐시를 비웁니다.
    function refresh(ids) {
        if (!enabled || !mode) return Promise.resolve();
        if (pending) return pending;
        const token = revision;
        const abort = new AbortController();
        controller = abort;
        const task = (async () => {
            const all = ids || await api.getUserAvatars(false);
            if (token !== revision || !enabled || !mode) return;
            const missing = all.filter(id => !dates.has(id));
            for (let offset = 0; offset < missing.length; offset += 20) {
                if (token !== revision || !enabled || !mode) return;
                const batch = missing.slice(offset, offset + 20);
                const response = await fetch('/api/image-metadata', {
                    method: 'POST', headers: window.SillyTavern.getContext().getRequestHeaders(), signal: abort.signal,
                    body: JSON.stringify({ paths: batch.map(id => 'User Avatars/' + id), type: 'persona' }),
                });
                if (!response.ok) throw new Error('File metadata API: ' + response.status);
                const values = await response.json();
                if (token !== revision || !enabled) return;
                for (const id of batch) {
                    const info = values?.['User Avatars/' + id];
                    const valid = time => typeof time === 'number' && Number.isFinite(time) && time > 0 ? time : null;
                    dates.set(id, { created: valid(info?.addedTimestamp), modified: valid(info?.mtime) });
                }
            }
            if (token === revision && enabled && mode) await api.getUserAvatars();
        })().catch(async error => {
            if (token !== revision || error.name === 'AbortError') return;
            mode = '';
            if (select) select.value = window.SillyTavern.getContext().powerUserSettings.persona_sort_order || 'asc';
            window.toastr?.warning('페르소나 파일의 날짜 정보를 불러오지 못했습니다. 기존 정렬을 사용합니다.');
            window.CopyBotSettings?.saveSettings();
            window.CopyBotUtils?.debugLog(window.copybot_debug_mode, error.message);
            try { await api.getUserAvatars(); } catch (_) { /* 기존 목록 유지 */ }
        }).finally(() => {
            if (pending === task) pending = null;
            if (controller === abort) controller = null;
        });
        pending = task;
        return task;
    }

    function ordered(ids, direction, names = {}) {
        return [...ids].sort((a, b) => {
            const readTime = direction.startsWith('modified_') ? modifiedTime : creationTime;
            const ta = readTime(a), tb = readTime(b);
            if (ta === null && tb !== null) return 1;
            if (tb === null && ta !== null) return -1;
            if (ta !== null && tb !== null && ta !== tb) return (ta - tb) * (direction.endsWith('newest') ? -1 : 1);
            return String(names[a] || a).localeCompare(String(names[b] || b)) || String(a).localeCompare(String(b));
        });
    }

    function filter(data) {
        if (!enabled || !select?.isConnected) return data;
        if (!modes.includes(mode) || !Array.isArray(data)) return data;
        if (data.some(id => !dates.has(id))) refresh(data);
        const option = options.find(item => item.dataset.copybotCreated === mode);
        if (!option) return data;
        const optionValue = option.value;
        option.value = 'search';
        option.selected = true;
        const helper = api.personasFilter;
        const previous = helper.scoreCache.get('persona_search');
        const ranks = new Map(ordered(data, mode, window.SillyTavern?.getContext()?.powerUserSettings?.personas)
            .map((id, rank) => [id, rank]));
        // 실리의 검색순 비교기가 점수를 읽는 현재 렌더 작업에만 생성순 순위를 제공합니다.
        // 동기 렌더 구간에만 실리가 지원하는 일시 정렬 값(search)을 사용하고 즉시 돌려놓습니다.
        // 평소 값은 서로 달라서 실리의 검색 옵션 선택/숨김 규칙에 끼어들지 않습니다.
        helper.scoreCache.set('persona_search', ranks);
        queueMicrotask(() => {
            option.value = optionValue;
            if (helper.scoreCache.get('persona_search') !== ranks) return;
            if (previous) helper.scoreCache.set('persona_search', previous);
            else helper.scoreCache.delete('persona_search');
        });
        return data;
    }

    function onInput(event) {
        mode = select.selectedOptions[0]?.dataset.copybotCreated || '';
        window.CopyBotSettings?.saveSettings();
        if (mode) {
            // 우리가 추가한 항목만 처리합니다. 실리 설정에 모르는 정렬 값을 저장하지 않습니다.
            event.stopImmediatePropagation();
            refresh();
        }
    }

    function detach() {
        const selectedOurs = !!select?.selectedOptions[0]?.dataset.copybotCreated;
        if (api?.personasFilter?.filterFunctions[KEY] === filter) delete api.personasFilter.filterFunctions[KEY];
        select?.removeEventListener('input', onInput, true);
        uploadInput?.removeEventListener('change', onUpload, true);
        uploadInput = null;
        subscriptions.forEach(([source, type]) => source.removeListener(type, invalidate));
        subscriptions = [];
        options.forEach(option => option.remove());
        options = [];
        if (select && (selectedOurs || select.selectedIndex < 0)) {
            select.value = window.SillyTavern?.getContext()?.powerUserSettings?.persona_sort_order || 'asc';
        }
        select = null;
    }

    async function configure(value, savedMode = mode) {
        const token = ++revision;
        controller?.abort();
        controller = null;
        pending = null;
        const wasActive = enabled && modes.includes(mode);
        enabled = value === true;
        mode = modes.includes(savedMode) ? savedMode : '';
        detach();
        try {
            if (!enabled) {
                dates.clear();
                if (wasActive && api) await api.getUserAvatars();
                return;
            }
            const loaded = await import('/scripts/personas.js');
            if (token !== revision || !enabled) return;
            const target = document.getElementById('persona_sort_order');
            if (!target || !loaded.personasFilter?.filterFunctions || !(loaded.personasFilter.scoreCache instanceof Map)
                || typeof loaded.getUserAvatars !== 'function' || !target.querySelector('option[value="search"]')) {
                throw new Error('페르소나 정렬 확장 지점을 찾지 못했습니다.');
            }
            api = loaded;
            select = target;
            for (const [direction, label] of [['oldest', '과거순'], ['newest', '최신순'], ['modified_oldest', '수정 오래된순'], ['modified_newest', '수정 최신순']]) {
                const option = document.createElement('option');
                option.value = KEY + '_' + direction;
                option.dataset.copybotCreated = direction;
                option.textContent = label;
                options.push(option);
                select.append(option);
            }
            api.personasFilter.filterFunctions[KEY] = filter;
            select.addEventListener('input', onInput, true);
            uploadInput = document.getElementById('avatar_upload_file');
            uploadInput?.addEventListener('change', onUpload, true);
            const context = window.SillyTavern.getContext();
            if (context.eventSource?.on && context.eventSource?.removeListener) {
                for (const key of ['PERSONA_CREATED', 'PERSONA_UPDATED', 'PERSONA_DELETED']) {
                    const type = context.eventTypes?.[key];
                    if (!type) continue;
                    context.eventSource.on(type, invalidate);
                    subscriptions.push([context.eventSource, type]);
                }
            }
            if (mode) await refresh();
        } catch (error) {
            if (token !== revision) return;
            detach();
            window.toastr?.warning('이 실리 버전에서는 페르소나 생성순 정렬을 적용할 수 없습니다. 기존 정렬을 사용합니다.');
            window.CopyBotUtils?.debugLog(window.copybot_debug_mode, error.message);
        }
    }

    window.CopyBotPersonaSort = { configure, getMode: () => mode, creationTime, modifiedTime, ordered };
})();
