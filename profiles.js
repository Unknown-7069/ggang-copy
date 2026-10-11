// 깡갤 복사기 프로필 및 이미지 관리 모듈
// 고화질 프로필 사진, 대필용 연결 프로필 목록 관리
(function() {
    'use strict';

    // 모듈 내부 변수
    let hqProfileCache = new Map(); // 고화질 프로필 캐시용 '메모장'
    let hqProfileObserver = null;
    let utils = null; // utils 모듈 참조
    let isDebugMode = false; // setDebugMode 로 바뀌는 내부 플래그 (전역 window.copybot_debug_mode 도 함께 봄)
    let origJqAttr = null;    // 패치 전 jQuery.fn.attr (원복용)
    let patchedJqAttr = null; // 우리가 끼운 래퍼 (원복 때 "아직 우리 것인지" 확인용)
    let attrPatchActive = false; // 래퍼가 실제로 일하는 중인가 (OFF 인데 남의 래퍼 밑에 깔려 못 뗀 경우 false → 통과만)

    // 디버그 로그: 디버그 모드에서만 (초기화 전에도 안전)
    function debugLog(...args) {
        if (!(isDebugMode || window.copybot_debug_mode)) return;
        if (utils && utils.debugLog) utils.debugLog(true, ...args);
        else console.log('🐞 깡갤 복사기 [Profiles]:', ...args);
    }

    // 클래스 판별: SVG 요소는 className 이 문자열이 아니라 객체(SVGAnimatedString)라 className.includes 가 TypeError → classList 로만 본다
    const hasClass = (el, c) => !!(el && el.classList && el.classList.contains(c));

    // ===== 적용 범위 (2026-10-11 유저 확정) =====
    //  • 채팅 아바타(#chat 안): 고화질 옵션이 켜져 있으면 바로 적용
    //  • 봇 목록(봇 얼굴이 쭉 나오는 목록·그룹 멤버 목록): "봇 목록에도 적용" 옵션이 켜져 있을 때만, 그것도 **화면에 한 번이라도 보인 것만**
    //    (목록에 있기만 하고 아직 화면에 안 들어온 봇의 원본까지 미리 받지 않는다 → 폰 메모리·캐시 절약)
    //  • 그 밖(페르소나 목록 등): 적용하지 않는다
    const CHAT_SCOPE = '#chat';
    const LIST_SCOPE = '#rm_print_characters_block, #rm_group_members, #rm_group_add_members';
    function scopeOf(img) {
        if (!img || !img.closest) return 'other';
        if (img.closest(CHAT_SCOPE)) return 'chat';
        if (img.closest(LIST_SCOPE)) return 'list';
        return 'other';
    }
    function isListOptionOn() {
        return $('#copybot_hq_profile_list').is(':checked');
    }
    // 봇 목록용: 화면에 들어온 썸네일만 변환 (한 번 보이면 관찰 해제). 옵저버는 목록 옵션을 실제로 쓸 때만 만든다
    let listVisibilityObserver = null;
    function watchUntilVisible(img, onVisible) {
        if (typeof IntersectionObserver !== 'function') { onVisible(img); return; }   // 지원 안 하는 환경: 예전처럼 바로 적용
        if (!listVisibilityObserver) {
            listVisibilityObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    listVisibilityObserver?.unobserve(entry.target);
                    const cb = entry.target.__copybotHqVisible;
                    entry.target.__copybotHqVisible = null;
                    try { if (cb) cb(entry.target); } catch (error) { debugLog('[목록 썸네일 변환 실패 — 건너뜀]', error); }
                });
            });
        }
        img.__copybotHqVisible = onVisible;
        listVisibilityObserver.observe(img);
    }
    // 봇 목록용: 사진 주소가 "나중에" 썸네일로 채워지는 경우도 잡는다.
    // (다른 확장이 목록 사진을 늦게 불러오게 만들면 — 요소는 빈 주소로 먼저 들어오고, 화면에 보일 때 주소만 바뀐다 — 새 요소 감시로는 못 본다. 2026-10-12 폰 확인)
    // 목록 상자 안의 img src 변화만 본다. 목록 옵션을 실제로 쓸 때만 만든다
    let listSrcObserver = null;
    function startListSrcWatch(onSrcChange) {
        if (listSrcObserver || typeof MutationObserver !== 'function') return;
        const roots = LIST_SCOPE.split(',').map(s => document.querySelector(s.trim())).filter(Boolean);
        if (!roots.length) return;
        listSrcObserver = new MutationObserver(mutations => {
            mutations.forEach(m => {
                if (!m.target || m.target.tagName !== 'IMG') return;
                try { onSrcChange(m.target); } catch (error) { debugLog('[목록 사진 주소 변화 처리 실패 — 건너뜀]', error); }
            });
        });
        roots.forEach(root => listSrcObserver.observe(root, { attributes: true, attributeFilter: ['src'], subtree: true }));
    }
    function stopListWatch() {
        if (listVisibilityObserver) { listVisibilityObserver.disconnect(); listVisibilityObserver = null; }
        if (listSrcObserver) { listSrcObserver.disconnect(); listSrcObserver = null; }
    }

    // ===== 깜빡임 없이 바꿔 끼우기 (2026-10-12 유저 지시: "한 번 깜빡이면 안 된다") =====
    // 썸네일이 보이는 채로 원본을 뒤에서 다 받아 풀어 둔(decode) 다음에만 주소를 바꾼다. 바꾸는 순간에는 그 사진을 "그릴 준비가 된 뒤에 함께 그리게"(decoding=sync)
    // 해서, 썸네일 → 빈칸 → 원본으로 보이던 틈을 없앤다. (실리의 아바타 img 는 decoding=async 라 큰 원본으로 바꾸면 그리기 전 한두 프레임이 비었다)
    // 받아 둔 원본은 몇 장만 쥐고 있는다 → 같은 사진이 다시 그려질 때(채팅 다시 그리기 등) 기다림 없이 바로 원본으로 시작할 수 있다
    const READY_LIMIT = 24;
    const readyOriginals = new Map();   // 원본 주소 → 받아서 풀어 둔 Image (오래된 것부터 버림)
    function keepReady(url, image) {
        readyOriginals.delete(url);
        readyOriginals.set(url, image);
        while (readyOriginals.size > READY_LIMIT) readyOriginals.delete(readyOriginals.keys().next().value);
    }
    // 같은 요소를 몇 번이고 다시 바꾸지는 않는다 (다른 확장이 주소를 계속 썸네일로 되돌려도 서로 밀고 당기지 않게)
    const SWAP_LIMIT = 8;
    const swapCounts = new WeakMap();
    function swapSrc(img, url) {
        const count = swapCounts.get(img) || 0;
        if (count >= SWAP_LIMIT) { debugLog('[교체 중단] 같은 요소를 너무 여러 번 바꿈'); return false; }
        swapCounts.set(img, count + 1);
        try { img.decoding = 'sync'; } catch (e) { /* 무시 */ }
        img.src = url;
        return true;
    }
    // 원본을 받아 풀어 둔 뒤 onDone(true|false). 10초 안에 못 받으면 실패로 본다. 결론은 한 번만
    function loadOriginal(url, onDone) {
        const image = new Image();
        let settled = false;
        const settle = (ok) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            image.onload = image.onerror = null;
            if (ok) keepReady(url, image);
            onDone(ok);
        };
        const timeoutId = setTimeout(() => { debugLog('[원본 확인 타임아웃] 10초'); settle(false); }, 10000);
        image.onload = () => {
            // 다 받았으면 그릴 수 있게 미리 풀어 둔다 (지원 안 하거나 실패해도 받기는 성공이므로 그대로 진행)
            let decoding = null;
            try { decoding = typeof image.decode === 'function' ? image.decode() : null; } catch (e) { decoding = null; }
            if (decoding && typeof decoding.then === 'function') decoding.then(() => settle(true), () => settle(true));
            else settle(true);
        };
        image.onerror = () => settle(false);
        image.src = url;
    }

    // 전역 네임스페이스 생성
    window.CopyBotProfiles = {
        // 모듈 초기화
        init: function(dependencies) {
            dependencies = dependencies || {};
            utils = dependencies.utils || window.CopyBotUtils || null;
            isDebugMode = !!dependencies.isDebugMode;
            debugLog('CopyBotProfiles 모듈 초기화 완료');
        },

        // 디버그 모드 설정 (index.js applyDebugMode 가 호출)
        setDebugMode: function(enabled) {
            isDebugMode = !!enabled;
        },

        // 고화질 프로필 사진 활성화
        enableHighQualityProfiles: function() {
            debugLog('깡갤 복사기: 고화질 프로필 사진 활성화');
            
            // 기존 이미지 처리
            this.processExistingImages();
            
            // 새로 추가되는 이미지 감시
            if (hqProfileObserver) {
                hqProfileObserver.disconnect();
            }
            
            hqProfileObserver = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType !== 1) return;
                        // 한 노드에서 예외가 나도 같은 배치의 나머지 노드는 계속 처리
                        try {
                            if (node.closest?.('.mes_text')) return;   // 메시지 본문(스트리밍으로 계속 추가되는 노드)은 아바타가 아님 → 즉시 통과
                            this.processNewImages(node);
                        } catch (error) {
                            debugLog('[새 노드 처리 실패 — 건너뜀]', error);
                        }
                    });
                });
            });
            
            hqProfileObserver.observe(document.body, { 
			childList: true, 
			subtree: true 
		});

		// 팝업 URL 모니터링 시스템 활성화
		this.setupPopupURLMonitor();
        },

        // 고화질 프로필 사진 비활성화
        disableHighQualityProfiles: function() {
            debugLog('깡갤 복사기: 고화질 프로필 사진 비활성화');
            
            if (hqProfileObserver) {
                hqProfileObserver.disconnect();
                hqProfileObserver = null;
            }
            stopListWatch();
            readyOriginals.clear();
            // jQuery attr 패치도 되돌림 (옵션 OFF 면 실리·다른 확장에 아무 영향도 남기지 않음)
            // 단, 우리 뒤에 다른 확장이 attr 을 또 감쌌으면(지금 값이 우리 래퍼가 아니면) 덮어쓰지 않는다 — 남의 래퍼를 지우게 되므로.
            // 그 경우 우리 래퍼는 사슬 안에 남지만 attrPatchActive 를 꺼서 "그대로 통과"만 하게 만든다 (다시 켜면 재사용)
            attrPatchActive = false;
            if (patchedJqAttr) {
                if (window.jQuery && window.jQuery.fn.attr === patchedJqAttr) {
                    window.jQuery.fn.attr = origJqAttr;
                    patchedJqAttr = null;
                    origJqAttr = null;
                } else {
                    debugLog('[jQuery attr 원복 생략] 다른 래퍼가 위에 있어 그대로 둠 (우리 래퍼는 통과만 함)');
                }
            }
        },

        // 기존 이미지 처리 (적용 범위 안의 것만 훑는다)
        processExistingImages: function() {
            const listOn = isListOptionOn();
            if (listOn) startListSrcWatch((img) => this.convertToHighQuality(img));
            const selector = listOn ? `${CHAT_SCOPE} img, ${LIST_SCOPE.split(',').map(s => `${s.trim()} img`).join(', ')}` : `${CHAT_SCOPE} img`;
            document.querySelectorAll(selector).forEach(img => {
                this.convertToHighQuality(img);
            });
        },

        // "봇 목록에도 적용" 옵션이 바뀌었을 때: 켜면 지금 목록을 훑고(보이는 것부터 적용), 끄면 대기 중인 관찰을 푼다.
        // 고화질 옵션 자체가 꺼져 있으면 아무것도 하지 않는다. (이미 바뀐 썸네일은 목록이 다시 그려질 때 원래대로 돌아온다)
        refreshListScope: function() {
            if (!hqProfileObserver) return;
            if (isListOptionOn()) this.processExistingImages();
            else stopListWatch();
        },

        // 새 이미지 처리 + 팝업 URL 수정
		processNewImages: function(node) {
			// 🔥 팝업 컨테이너 감지 시 URL 수정
			if (hasClass(node, 'zoomed_avatar')) {
				debugLog('[팝업 컨테이너 감지] URL 수정 처리 시작:', node.id || 'unknown');
				
				// 팝업 내 이미지 찾기
				const popupImg = node.querySelector('.zoomed_avatar_img');
				if (popupImg && popupImg.src) {
					const originalSrc = popupImg.src;
					
					// 중복 URL 패턴 감지 및 수정
					if (originalSrc.includes('/characters/http://')) {
						// 중복 제거: /characters/http://127.0.0.1:59927/characters/ → http://127.0.0.1:59927/characters/
						const fixedSrc = originalSrc.replace('/characters/http://', 'http://');
						popupImg.src = fixedSrc;
						debugLog('[팝업 URL 수정]', originalSrc, '→', fixedSrc);
					}
				}
				return; // 팝업은 고화질 변환 제외
			}
			
			if (node.tagName === 'IMG') {
				this.convertToHighQuality(node);
			} else if (node.querySelectorAll) {
				node.querySelectorAll('img').forEach(img => {
					this.convertToHighQuality(img);
				});
			}
		},

        // 고화질 변환 함수 (적용 범위 판정 → 실제 변환)
		convertToHighQuality: function(img) {
			const originalSrc = img.src;
			// 썸네일 주소가 아니면 볼 것도 없다 (범위 판정·관찰 등록 전에 걸러 냄)
			if (typeof originalSrc !== 'string' || !originalSrc.includes('/thumbnail?type=')) return;
			const scope = scopeOf(img);
			if (scope === 'other') return;                       // 페르소나 목록 등: 적용하지 않음
			if (scope === 'list') {
				if (!isListOptionOn()) return;                   // 봇 목록 옵션이 꺼져 있음
				// 이미 한 번 받아 둔 원본은 바로 적용, 처음 보는 것은 화면에 들어올 때까지 기다린다
				if (!hqProfileCache.has(originalSrc)) {
					watchUntilVisible(img, (seen) => { if (isListOptionOn() && seen.src === originalSrc) this.applyHighQuality(seen); });
					return;
				}
			}
			this.applyHighQuality(img);
		},

		// 실제 변환 (캐시 확인 → 원본 주소 확인 → 교체)
		applyHighQuality: function(img) {
			const originalSrc = img.src;

			debugLog('[고화질 변환 시작]', originalSrc);

			// 🔥 팝업 이미지 완전 차단
			if (hasClass(img, 'zoomed_avatar_img')) {
				debugLog('[팝업 이미지 변환 차단]', originalSrc);
				return;
			}
			
			// 팝업 컨테이너 내부 이미지도 차단
			if (img.closest && img.closest('.zoomed_avatar')) {
				debugLog('[팝업 컨테이너 내부 이미지 변환 차단]', originalSrc);
				return;
			}

			// 중복 URL 이미 있는 경우 변환 차단
			if (originalSrc.includes('/characters/http://')) {
				debugLog('[중복 URL 감지, 변환 차단]', originalSrc);
				return;
			}

			// 1. 캐시(메모장)를 먼저 확인합니다.
            if (hqProfileCache.has(originalSrc)) {
                const cachedSrc = hqProfileCache.get(originalSrc);
                if (!cachedSrc) {
                    debugLog('[캐시 확인] 이미 실패로 확인된 이미지:', originalSrc);
                } else if (readyOriginals.has(cachedSrc)) {
                    // 받아서 풀어 둔 원본을 쥐고 있음 → 기다림 없이 바로 원본으로 시작
                    keepReady(cachedSrc, readyOriginals.get(cachedSrc));
                    swapSrc(img, cachedSrc);
                    debugLog('[캐시 적용]', cachedSrc);
                } else {
                    // 주소는 알지만 쥐고 있던 것은 버렸음 → 썸네일을 보여 둔 채 다시 받아서 바꾼다
                    this.swapWhenReady(img, originalSrc, cachedSrc);
                }
                return;
            }

            let newSrc = null;

            // 현재 SillyTavern 서버 주소를 동적으로 감지
            const serverBaseUrl = `${window.location.protocol}//${window.location.host}`;

            // 썸네일 주소의 file= 값(디코딩된 파일명). 뒤에 다른 파라미터(&t=… 등)가 붙어 있어도 파일명만 정확히 꺼낸다
            const fileParam = (src) => {
                try { return new URL(src, window.location.href).searchParams.get('file') || ''; }
                catch (e) { return ''; }
            };

            // 페르소나 썸네일 처리
            if (originalSrc.includes('/thumbnail?type=persona&file=')) {
                const fileName = fileParam(originalSrc);
                if (!fileName) {
                    hqProfileCache.set(originalSrc, false);
                    debugLog('[페르소나 처리] 파일명을 읽지 못해 건너뜀:', originalSrc);
                    return;
                }
                newSrc = `${serverBaseUrl}/User%20Avatars/${encodeURIComponent(fileName)}`;
                debugLog('[페르소나 처리]', fileName, '->', newSrc);
            }
            // 아바타 썸네일 처리 - /characters/<파일> 원본으로 교체
            else if (originalSrc.includes('/thumbnail?type=avatar&file=')) {
                const fileName = fileParam(originalSrc);
                if (!fileName) {
                    hqProfileCache.set(originalSrc, false);
                    debugLog('[아바타 처리] 파일명을 읽지 못해 건너뜀:', originalSrc);
                    return;
                }
                debugLog('[아바타 처리 시작]', { originalSrc: originalSrc, fileName: fileName });
                this.tryBotProfilePaths(img, originalSrc, fileName, serverBaseUrl);
                return; // 여기서 종료 (tryBotProfilePaths에서 캐싱까지 처리)
            }

            if (newSrc) {
                // 2. 캐시에 결과가 없으면, 원본이 있는지 받아 보고 바꾼다
                this.swapWhenReady(img, originalSrc, newSrc);
            } else {
                debugLog('[건너뛰기] 처리 대상이 아닌 이미지:', originalSrc);
            }
        },

        // 원본을 뒤에서 다 받아 둔 다음에만 바꿔 끼운다 (그동안 썸네일은 그대로 보인다 → 깜빡임 없음).
        // 받는 사이 그 요소가 다른 사진으로 바뀌었거나 화면에서 빠졌으면 손대지 않는다
        swapWhenReady: function(img, originalSrc, newSrc) {
            try {
                debugLog('[원본 확인 시작]', { originalSrc: originalSrc, url: newSrc });
                loadOriginal(newSrc, (ok) => {
                    if (!ok) {
                        hqProfileCache.set(originalSrc, false);
                        debugLog(`[실패] 원본 이미지 없음: ${newSrc}`);
                        return;
                    }
                    hqProfileCache.set(originalSrc, newSrc);
                    if (img.src !== originalSrc || img.isConnected === false) return;
                    swapSrc(img, newSrc);
                    debugLog(`[성공] 고화질 교체 완료: ${newSrc}`);
                });
            } catch (error) {
                console.error('깡갤 복사기: 원본 프로필 확인 중 오류', error);
                hqProfileCache.set(originalSrc, false);
            }
        },

        // 봇 프로필 원본 확인 후 교체: /characters/<파일> 한 경로만 본다 (fileName 은 디코딩된 파일명)
        tryBotProfilePaths: function(img, originalSrc, fileName, serverBaseUrl) {
            this.swapWhenReady(img, originalSrc, `${serverBaseUrl}/characters/${encodeURIComponent(fileName)}`);
        },

        // 프로필 목록 로드 함수 (강화된 버전)
        loadGhostwriteProfiles: function() {
            try {
                const profileSelect = $('#copybot_ghostwrite_profile_select');
                const connectionProfilesDropdown = document.querySelector('#connection_profiles');
                
                if (!connectionProfilesDropdown) {
                    debugLog('연결 프로필 드롭다운을 찾을 수 없음');
                    return;
                }

                // 현재 선택된 값 백업
                const currentSelectedProfile = profileSelect.val();
                
                // 기존 옵션 제거 (기본값 제외)
                profileSelect.find('option:not(:first)').remove();
                
                // SillyTavern의 프로필 목록에서 옵션 추가
                const availableProfiles = [];
                Array.from(connectionProfilesDropdown.options).forEach(option => {
                    if (option.value && option.value !== '') {
                        profileSelect.append(new Option(option.text, option.value));   // 이름에 따옴표·꺾쇠가 있어도 HTML 로 해석되지 않게
                        availableProfiles.push(option.value);
                    }
                });
                
                // 이전에 선택된 값이 여전히 존재하면 복원, 없으면 기본값
                if (currentSelectedProfile && availableProfiles.includes(currentSelectedProfile)) {
                    profileSelect.val(currentSelectedProfile);
                } else if (currentSelectedProfile && currentSelectedProfile !== 'default') {
                    profileSelect.val('default');
                    debugLog('이전에 선택된 프로필이 더 이상 존재하지 않아 기본값으로 변경:', currentSelectedProfile);
                }
                
                debugLog('대필 프로필 목록 로드 완료:', availableProfiles.length, '개');
            } catch (error) {
                console.error('깡갤 복사기: 프로필 목록 로드 실패', error);
            }
        },

        // 🔥 추가 안전장치: 팝업 URL 모니터링
        setupPopupURLMonitor: function() {
            // jQuery attr 메서드 패치 (상태는 jQuery 전역이 아니라 이 모듈 변수에만 둔다)
            if (!window.jQuery) return;
            if (patchedJqAttr) {
                // 이미 끼워져 있음(끈 뒤 남의 래퍼 밑에 남아 있던 경우 포함) → 다시 일하게만 하고 이중으로 감싸지 않는다
                attrPatchActive = true;
                return;
            }
            const originalAttr = window.jQuery.fn.attr;

            const wrapper = function(name, value) {
                // 팝업 이미지의 src 변경 감지 (꺼진 상태면 그대로 통과)
                if (attrPatchActive && arguments.length > 1 && name === 'src' && hasClass(this[0], 'zoomed_avatar_img')) {
                    debugLog('[팝업 src 변경 감지]', this[0].src, '→', value);

                    // 중복 URL 패턴 감지 및 수정
                    if (typeof value === 'string' && value.includes('/characters/http://')) {
                        const fixedValue = value.replace('/characters/http://', 'http://');
                        debugLog('[팝업 src 자동 수정]', value, '→', fixedValue);
                        return originalAttr.call(this, name, fixedValue);
                    }
                }

                return originalAttr.apply(this, arguments);
            };

            window.jQuery.fn.attr = wrapper;
            origJqAttr = originalAttr;
            patchedJqAttr = wrapper;
            attrPatchActive = true;
            debugLog('[팝업 URL 모니터링 시스템 활성화]');
        }
    };

    if (window.copybot_debug_mode) console.log('CopyBotProfiles 모듈 로드 완료');
})();