// 깡갤 복사기 프로필 및 이미지 관리 모듈
// 고화질 프로필 사진, 캐릭터 정보, 프로필 목록 관리
(function() {
    'use strict';

    // 안전한 디버그 로그 함수 (초기화 전에도 사용 가능)
    const safeDebugLog = (...args) => {
        if (window.CopyBotUtils && window.CopyBotUtils.debugLog) {
            window.CopyBotUtils.debugLog(false, ...args);
        } else {
            console.log('[CopyBot Profiles]', ...args);
        }
    };

    // 모듈 내부 변수
    let hqProfileCache = new Map(); // 고화질 프로필 캐시용 '메모장'
    let hqProfileObserver = null;
    let utils = null; // utils 모듈 참조
    let debugLog = null; // 디버그 로그 함수 참조

    // 전역 네임스페이스 생성
    window.CopyBotProfiles = {
        // 모듈 초기화
        init: function(dependencies) {
            utils = dependencies.utils;
            debugLog = function(...args) {
                if (utils && utils.debugLog) {
                    utils.debugLog(dependencies.isDebugMode || false, ...args);
                }
            };
            debugLog('CopyBotProfiles 모듈 초기화 완료');
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
                        if (node.nodeType === 1) {
                            this.processNewImages(node);
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
            
            // 페이지 새로고침으로 원래 썸네일 복원
            // location.reload();
        },

        // 기존 이미지 처리
        processExistingImages: function() {
            document.querySelectorAll('img').forEach(img => {
                this.convertToHighQuality(img);
            });
        },

        // 새 이미지 처리 + 팝업 URL 수정
		processNewImages: function(node) {
			// 🔥 팝업 컨테이너 감지 시 URL 수정
			if (node.className && node.className.includes('zoomed_avatar')) {
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

        // 고화질 변환 함수
		convertToHighQuality: function(img) {
			const originalSrc = img.src;
			
			debugLog('[고화질 변환 시작]', originalSrc);

			// 🔥 팝업 이미지 완전 차단
			if (img.className && img.className.includes('zoomed_avatar_img')) {
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
                if (cachedSrc) { // 캐시에 유효한 URL이 있으면 즉시 교체
                    img.src = cachedSrc;
                    debugLog('[캐시 적용]', cachedSrc);
                } else {
                    debugLog('[캐시 확인] 이미 실패로 확인된 이미지:', originalSrc);
                }
                return;
            }

            let newSrc = null;

            // 현재 SillyTavern 서버 주소를 동적으로 감지
            const serverBaseUrl = `${window.location.protocol}//${window.location.host}`;

            // 페르소나 썸네일 처리
            if (originalSrc.includes('/thumbnail?type=persona&file=')) {
                const fileName = originalSrc.split('file=')[1];
                newSrc = `${serverBaseUrl}/User%20Avatars/${fileName}`;
                debugLog('[페르소나 처리]', fileName, '->', newSrc);
            }
            // 아바타 썸네일 처리 - 이중 시도 로직
            else if (originalSrc.includes('/thumbnail?type=avatar&file=')) {
                const fileName = originalSrc.split('file=')[1];
                const decodedFileName = decodeURIComponent(fileName);
                
                debugLog('[아바타 처리 시작]', {
                    originalSrc: originalSrc,
                    fileName: fileName,
                    decodedFileName: decodedFileName
                });
                
                // 현재 캐릭터 정보 가져오기
                const characterInfo = this.getCurrentCharacterInfo();
                
                // 이중 시도를 위한 함수 호출
                this.tryBotProfilePaths(img, originalSrc, decodedFileName, characterInfo, serverBaseUrl);
                return; // 여기서 종료 (tryBotProfilePaths에서 캐싱까지 처리)
            }

            if (newSrc) {
                debugLog('[네트워크 확인 시작]', newSrc);
                // 2. 캐시에 결과가 없으면, 네트워크 확인을 진행합니다.
                const testImg = new Image();
                testImg.onload = function() {
                    img.src = newSrc;
                    hqProfileCache.set(originalSrc, newSrc);
                    debugLog(`[성공] 고화질 교체: ${newSrc}`);
                };
                testImg.onerror = function() {
                    hqProfileCache.set(originalSrc, false);
                    debugLog(`[실패] 원본 이미지 없음: ${newSrc}`);
                };
                testImg.src = newSrc;
            } else {
                debugLog('[건너뛰기] 처리 대상이 아닌 이미지:', originalSrc);
            }
        },

        // 봇 프로필 이미지 이중 시도 함수 (예외처리 강화)
        tryBotProfilePaths: function(img, originalSrc, fileName, characterInfo, serverBaseUrl) {
            try {
                // 파일명이 이미 URL 인코딩되어 있는지 확인
                const safeFileName = fileName;
                
                // 1차 시도: /characters/{fileName} (확장자 포함)
                const firstAttemptUrl = `${serverBaseUrl}/characters/${safeFileName}`;
                
                debugLog('[1차 시도 시작]', {
                    originalSrc: originalSrc,
                    fileName: safeFileName,
                    url: firstAttemptUrl
                });
                
                const testImg1 = new Image();
                
                // 타이머 설정 (10초 타임아웃)
                const timeout1 = setTimeout(() => {
                    debugLog('[1차 시도 타임아웃] 2차 시도로 진행');
                    testImg1.onerror();
                }, 10000);
                
                testImg1.onload = function() {
                    clearTimeout(timeout1);
                    img.src = firstAttemptUrl;
                    hqProfileCache.set(originalSrc, firstAttemptUrl);
                    debugLog(`[1차 성공] 고화질 교체 완료: ${firstAttemptUrl}`);
                };
                
                const self = this; // this 바인딩 보존
                testImg1.onerror = function() {
                    clearTimeout(timeout1);
                    debugLog('[1차 실패] 2차 시도 진행');
                    
                    // 2차 시도: /characters/{캐릭터폴더명}/{fileName}
                    if (characterInfo && characterInfo.name) {
                        // 캐릭터명 URL 인코딩 (특수문자 처리)
                        const encodedCharacterName = encodeURIComponent(characterInfo.name);
                        const secondAttemptUrl = `${serverBaseUrl}/characters/${encodedCharacterName}/${safeFileName}`;
                        
                        debugLog('[2차 시도 시작]', {
                            characterName: characterInfo.name,
                            encodedCharacterName: encodedCharacterName,
                            url: secondAttemptUrl
                        });
                        
                        const testImg2 = new Image();
                        
                        // 타이머 설정 (10초 타임아웃)
                        const timeout2 = setTimeout(() => {
                            debugLog('[2차 시도 타임아웃] 모든 시도 실패로 처리');
                            testImg2.onerror();
                        }, 10000);
                        
                        testImg2.onload = function() {
                            clearTimeout(timeout2);
                            img.src = secondAttemptUrl;
                            hqProfileCache.set(originalSrc, secondAttemptUrl);
                            debugLog(`[2차 성공] 고화질 교체 완료: ${secondAttemptUrl}`);
                        };
                        
                        testImg2.onerror = function() {
                            clearTimeout(timeout2);
                            hqProfileCache.set(originalSrc, false);
                            debugLog(`[모든 시도 실패] 고화질 이미지 없음`, {
                                attempt1: firstAttemptUrl,
                                attempt2: secondAttemptUrl,
                                characterInfo: characterInfo
                            });
                        };
                        
                        testImg2.src = secondAttemptUrl;
                    } else {
                        hqProfileCache.set(originalSrc, false);
                        debugLog('[캐릭터 정보 없음] 2차 시도 불가능', {
                            characterInfo: characterInfo,
                            contextAvailable: !!window.SillyTavern?.getContext()
                        });
                    }
                };
                
                testImg1.src = firstAttemptUrl;
                
            } catch (error) {
                console.error('깡갤 복사기: tryBotProfilePaths 실행 중 오류', error);
                hqProfileCache.set(originalSrc, false);
            }
        },

        // SillyTavern에서 현재 캐릭터 정보 가져오는 함수
        getCurrentCharacterInfo: function() {
            try {
                const context = window.SillyTavern?.getContext();
                if (!context) {
                    debugLog('SillyTavern 컨텍스트를 찾을 수 없음');
                    return null;
                }
                
                // 캐릭터 이름과 관련 정보 추출
                const characterName = context.name;
                const characterId = context.characterId;
                
                debugLog('현재 캐릭터 정보:', { 
                    name: characterName, 
                    id: characterId,
                    context: context
                });
                
                return {
                    name: characterName,
                    id: characterId,
                    context: context
                };
            } catch (error) {
                console.error('깡갤 복사기: 캐릭터 정보 추출 실패', error);
                return null;
            }
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
                        profileSelect.append(`<option value="${option.value}">${option.text}</option>`);
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
            // jQuery attr 메서드 패치
            if (window.jQuery && !window.jQuery._copybot_patched) {
                const originalAttr = window.jQuery.fn.attr;
                
                window.jQuery.fn.attr = function(name, value) {
                    // 팝업 이미지의 src 변경 감지
                    if (arguments.length > 1 && name === 'src' && 
                        this[0] && this[0].className && 
                        this[0].className.includes('zoomed_avatar_img')) {
                        
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
                
                window.jQuery._copybot_patched = true;
                debugLog('[팝업 URL 모니터링 시스템 활성화]');
            }
        }
    };

    safeDebugLog('CopyBotProfiles 모듈 로드 완료');
})();