// ===================================================================
// 깡갤 복사기 확장프로그램 - 모듈화된 아키텍처 시스템
// ===================================================================
// SillyTavern용 자동 메시지 복사 및 대필 도구
//★확장 경로, 확장명 변경시 참고: index.js, manifest.json, settings.html (키워드: ggang-copy,복사기)
//
// === 🏗️ 모듈 구조 및 역할 ===
//
// 📜 manifest.json (확장프로그램 정의 파일)
//   • 역할: 확장프로그램의 이름, 버전, 진입점(js, css) 등 핵심 정보를 정의합니다.
//
// 📦 utils.js (기반 유틸리티)
//   • 역할: 순수 함수들, 외부 의존성 없음
//   • 함수: debugLog(), escapeHtml(), getLastMessageIndex(), hasValueChanged(), 색상 변환
//   • 의존성: 없음 (다른 모든 모듈에서 사용)
//   • 특징: DOM 조작 없음, 순수 계산 및 변환만 수행
//
// 📦 settings.js (설정 관리)
//   • 역할: 모든 확장프로그램 설정의 저장/로드, placeholder/resize 관리
//   • 함수: saveSettings(), loadSettings(), hide/restorePlaceholder(), remove/restoreResizeHandle()
//   • 의존성: utils.js
//   • 특징: localStorage 다중 백업, UI 토글 상태 관리, CSS 기반 DOM 제어
//
// 📦 presets.js (프리셋 시스템) ⭐️ 핵심 모듈
//   • 역할: 대필 프리셋의 완전한 생명주기 관리
//   • 함수: 20개 함수 (CRUD, 활성프리셋, UI관리, 순서변경)
//     - 데이터: getPresets(), savePresets(), performDataMigration()
//     - CRUD: loadPreset(), saveCurrentPreset(), add/delete/rename/copyCurrentPreset()
//     - 활성: getActivePreset(), setActivePreset()
//     - UI: updatePresetDropdown(), enter/exitPresetEditMode(), updatePresetEditButtonState()
//     - 순서: reorderPresets(), open/closeReorderModal()
//   • 의존성: utils.js, settings.js
//   • 특징: 다중 백업 시스템, 하위 호환성, 마이그레이션 지원
//
// 📦 commands.js (명령어 실행)
//   • 역할: SillyTavern 슬래시 명령 직접 실행(입력창 경유 없음) 및 텍스트 처리, 확장 업데이트
//   • 함수: executeSilentCommand(), executeSimpleCommand()(호환 껍데기), jumpToMessage(), executeCopyCommand(), writeToClipboard(),
//          removeTagsFromElement(), copyTextboxContent(), triggerCacheBustRegeneration()/smartDeleteAndRegenerate()(generation.js 위임),
//          checkExtensionUpdate(), updateExtension(), showExtensionVersion()
//   • 의존성: utils.js
//   • 특징: 삭제 명령(/del /cut /delname /delchat /delswipe) 좆됨방지 가드, 클립보드 조작, 정규식 태그 제거
//
// 📦 generation.js (생성·삭제 파이프라인)
//   • 역할: 마지막 메시지 삭제, 삭제 후 재생성, 응답 없이 보내기, 생성 상태 추적
//   • 함수: deleteLastMessage(), deleteLastUserMessage(), deleteAndRegenerate(), sendWithoutReply(), abort(), isBusy() 등
//   • 의존성: utils.js, settings.js(좆됨방지 설정)
//
// 📦 actions.js (동작 레지스트리)
//   • 역할: 소메뉴·입력필드 아이콘·퀵/플로팅 메뉴·커스텀 버튼이 공유하는 동작 목록과 실행 창구 run()
//
// 📦 shortcut.js (커스텀 버튼 바로가기)
//   • 역할: 실리 메뉴 열기·프리셋/프로필/페르소나/봇 바꾸기·확장 연결·QR 세트 팝업
//
// 📦 capture.js (메시지 캡처)
//   • 역할: 미리보기(= 결과물) 생성, 이미지 렌더(vendor modern-screenshot, 첫 캡처 때 지연 로드), 복사·저장
//
// 📦 icons.js (아이콘 관리) 🎯 UI 컴포넌트
//   • 역할: 입력창 아이콘의 완전한 생명주기 관리 및 DOM 안정성 보장
//   • 함수: updateInputFieldIcons(), isInputFieldReady(), waitForLayoutStabilization(), safeUpdateInputFieldIcons(), scheduleIconUpdates()
//   • 의존성: utils.js (색상 변환, 디버깅)
//   • 특징: 4가지 위치 지원, 테마 적응형 스타일링, 다중 시점 업데이트, 콜백 기반 외부 함수 호출
//
// 📦 profiles.js (프로필 사진 및 이미지 관리) 🎯 UI 컴포넌트  
//   • 역할: 고화질 프로필 사진 변환, 대필용 API 프로필 목록 로드
//   • 함수: enableHighQualityProfiles(), disableHighQualityProfiles(), loadGhostwriteProfiles() 등
//   • 의존성: utils.js
//   • 특징: 고화질 이미지 변환(옵션 ON 일 때만), MutationObserver 기반 실시간 처리
//
// 📦 ghostwrite.js (대필 및 자동저장 시스템) ⭐ 핵심 기능 모듈
//   • 역할: 대필 실행, 프로필 전환, 하이브리드 자동저장, 임시 프롬프트 관리, 상태 아이콘 시스템
//   • 함수: executeGhostwrite(), switchProfile(), addTempPromptField(), updateTempPromptStyle() 등
//     - 대필: executeGhostwrite(), isGhostwritingActive(), setGhostwritingActive()
//     - 프로필: switchProfile(), getGhostwriteOriginalProfile()
//     - 자동저장: executeHybridAutoSave(), scheduleDebounceAutoSave(), scheduleImmediateAutoSave()
//     - 임시프롬프트: addTempPromptField(), saveTempPrompt(), loadTempPrompt(), updateTempPromptStyle()
//     - 상태관리: showStatusIcon(), hasValueChanged(), syncInitialValues()
//   • 의존성: utils.js, settings.js, presets.js, commands.js
//   • 특징: 중복 방지 자동저장, 비동기 프로필 전환, 실시간 상태 피드백, 안전한 대필 실행
//
// 📦 messageOperations.js (메시지 정리 시스템) 🎯 메시지 조작 모듈
//   • 역할: 메시지 숨기기/보이기, 다중 메시지 삭제 등 메시지에 대한 모든 조작 기능
//   • 함수: executeHideCommand(), executeUnhideCommand(), executeMultiDelete(), validateMessageIndices(), getMessageRange()
//     - 숨기기: executeHideCommand(), executeUnhideCommand() (/hide /unhide 명령어)
//     - 삭제: executeMultiDelete() (다중 메시지 삭제)
//     - 유틸리티: validateMessageIndices(), getMessageRange() (메시지 범위 검증)
//   • 의존성: utils.js, commands.js
//   • 특징: 철저한 입력 유효성 검사, 안전한 삭제 확인, SillyTavern 명령어 시스템 연동, 확장 가능한 구조
//
// 📦 wandMenu.js (마법봉 퀵메뉴) 🪄 퀵 액세스 모듈
//   • 역할: Extensions 메뉴 내 깡갤 복사기 퀵메뉴 등록 및 관리, 고정/미니 모드 지원
//   • 함수: registerWandMenu(), toggleQuickMenu(), showQuickMenu(), hideQuickMenu(), handleQuickAction()
//     - 메뉴관리: registerWandMenu() (마법봉 메뉴 등록), createQuickMenuPopup() (팝업 생성)
//     - 퀵액션: handleQuickAction() (이동/복사/삭제/숨기기 등 빠른 실행)
//     - 상태관리: 고정모드(isPinned), 미니모드(isMiniMode) 전환 및 localStorage 저장
//   • 의존성: utils.js
//   • 특징: Extensions 메뉴 통합, 아이콘 개인화 지원, 입력필드 아이콘과 팝업 공유
//
// 📦 ui.js (UI 이벤트 및 상호작용 관리) 🎯 통합 UI 컨트롤러
//   • 역할: 모든 UI 이벤트 핸들링, 동적 버튼 관리, 사용자 상호작용 제어, 모듈 간 UI 통신 중계
//   • 함수: setupEventHandlers(), updateActionButtons()
//     - 이벤트: 프리셋 CRUD/토글버튼/액션버튼/입력필드/설정패널/하이브리드 자동저장 모든 이벤트 핸들링
//     - 동적UI: 설정에 따른 버튼 동적 생성/제거, 상태 동기화, 실시간 피드백 시스템
//     - 통합관리: 이벤트 중복 방지, DOM 준비 상태 확인, 콜백 기반 모듈 간 통신
//   • 의존성: 모든 모듈 (utils.js, settings.js, presets.js, commands.js, icons.js, profiles.js, ghostwrite.js)
//   • 특징: 완전한 콜백 주입 시스템, loose coupling 달성, 420줄 규모의 복합 이벤트 시스템
//   • 중요성: UI 레이어의 단일 진입점, 모든 사용자 상호작용의 통합 관리자
//
// 📦 index.js (메인 컨트롤러) ⚡ 통합 허브
//   • 역할: 모듈 로딩, 초기화 순서 관리, SillyTavern API 연동
//   • 기능: 모듈 간 통신 중계, 초기화 로직(모듈별 격리 safeInit), 초기화 재시도
//   • 의존성: 모든 모듈 (실행 순서: utils → settings → presets → commands → generation → actions → shortcut → capture
//            → icons → profiles → ghostwrite → messageOperations → ui → wandMenu. utils 먼저, 나머지는 병렬 다운로드·순서 실행)
//   • 특징: 콜백 주입 시스템, 문서 스크롤 가드·채팅 전환 재적용은 기능이 하나라도 ON 일 때만 설치
//
// === 작업 가이드라인 ===
//
// 📍 수정 대상별 모듈 선택:
//   • 프리셋 관련 (추가/삭제/편집/로드/순서변경) → presets.js 수정
//   • 고화질 프로필 사진, 캐릭터 정보, 대필용 프로필 목록 → profiles.js 수정
//   • 대필 실행, 프로필 전환, 하이브리드 자동저장, 임시 프롬프트 → ghostwrite.js 수정
//   • 설정 저장/로드, placeholder/resize 관리 → settings.js 수정
//   • 유틸리티 함수 (로그, HTML처리, 계산) → utils.js 수정
//   • 명령어 실행, 텍스트 처리, 클립보드 → commands.js 수정
//   • 아이콘 업데이트, DOM 안정성, 테마 적응형 스타일링 → icons.js 수정
//   • 마법봉 퀵메뉴, Extensions 메뉴 통합, 퀵액션 → wandMenu.js 수정
//   • 모든 UI 이벤트 핸들링, 동적 버튼, 사용자 상호작용 → ui.js 수정 ⭐ 통합 UI 관리자
//   • 모듈 로딩, 초기화 순서, 콜백 주입 시스템 → index.js 확인
//   • UI 템플릿 변경 → settings.html 수정
//   • CSS 스타일 변경 → style.css 수정
//
// 📍 연쇄 수정 필수 사항 (한 곳 수정 시 반드시 함께 수정):
//   
//   🔗 새 프리셋 관련 함수 추가 시:
//      - presets.js에 함수 구현 + index.js에 wrapper 함수 추가
//      - 이벤트 핸들러가 필요하면 ui.js setupEventHandlers()도 수정
//   
//   🔗 새 설정 토글 추가 시:
//      - settings.html에 UI 추가 + settings.js에 저장/로드 로직 추가
//      - ui.js에 이벤트 핸들러 추가 (setupEventHandlers 함수 내)
//   
//   🔗 새 유틸리티 함수 추가 시:
//      - utils.js에 함수 구현 + 사용하는 모든 모듈에서 호출부 추가
//   
//   🔗 데이터 구조 변경 시:
//      - presets.js의 마이그레이션 로직 업데이트 필수
//      - settings.js의 저장/로드 로직도 함께 확인
//   
//   🔗 UI 요소 추가 시:
//      - settings.html + style.css + ui.js의 이벤트 핸들링 함수
//   
//   🔗 새 이벤트 핸들러 추가 시:
//      - ui.js setupEventHandlers()에 추가 + 필요시 콜백 함수 등록
//      - 모듈 간 통신이 필요하면 index.js에서 콜백 주입
//      - 이벤트 중복 방지를 위해 반드시 $(document).off() 먼저 호출
//   
//   🔗 UI 관련 수정 시 (매우 중요):
//      - DOM 이벤트 수정: ui.js setupEventHandlers() 함수 내 수정
//      - 토글 버튼 추가: settings.html + ui.js 이벤트 + index.js 콜백 주입
//      - 액션 버튼 추가: ui.js updateActionButtons() + setupEventHandlers() 모두 수정
//      - 하이브리드 자동저장 관련: ui.js + ghostwrite.js 연동 확인
//
// 📍 디버깅 순서 (문제 발생 시 확인 순서):
//   1. Console 에러 확인 → utils.js의 debugLog 활용
//   2. 모듈 로드 실패 → index.js의 모듈 로드 함수들 확인
//   3. 프리셋 동작 이상 → presets.js + localStorage 데이터 확인
//   4. 설정 저장 실패 → settings.js + 다중 백업 상태 확인
//   5. UI 동작 이상 → 해당 모듈 + index.js 이벤트 핸들러 확인
//
// 📍 성능 최적화 가이드:
//   • utils.js: 순수 함수만, 복잡한 계산은 캐싱 고려
//   • settings.js: localStorage 접근 최소화, 배치 저장
//   • presets.js: 대량 프리셋 시 가상화 고려
//   • index.js: 이벤트 핸들러 중복 등록 방지, 디바운싱 활용
//
// 📍 확장성 고려사항:
//   • 새 모듈 추가 시: window.CopyBot[ModuleName] 네이밍 규칙 준수
//   • 의존성 순서: utils → settings → presets → commands → generation → actions → shortcut → capture → icons → profiles → ghostwrite → messageOperations → ui → wandMenu → [새모듈] (index 가 로더)
//   • UI 관련 모듈은 ui.js 이후에 로드, 비UI 모듈은 ui.js 이전에 로드
//   • 에러 핸들링: 모든 공개 함수는 try-catch 필수
//   • 하위 호환성: 기존 함수명 유지, 새 기능은 옵션 파라미터로
//   • 콜백 주입 시스템: 새 모듈이 다른 모듈 함수 사용 시 콜백으로 받아야 함
//   • 이벤트 핸들러: 모든 DOM 이벤트는 ui.js에서 통합 관리, 다른 모듈에서 직접 등록 금지
//   • 성능 최적화: 420줄 규모의 ui.js는 분할 가능성 검토, 기능별 서브모듈 고려
//
// ===================================================================

(function() {
        'use strict';

    // ===================================================================
    // 🎯 테스트/정식 버전 전환 스위치 (이 한 줄만 수정하세요!)
    // ===================================================================
    
    // ⚠️ 중요: isDebugMode는 debugLog보다 먼저 선언되어야 함 (TDZ 방지)
    let isDebugMode = false;
    let isInitialized = false;
    
    const IS_TEST_VERSION = false; // 테스트할 때: true, 정식배포: false
    
    // 자동 설정 (아래는 수정 금지)
    const EXTENSION_FOLDER = IS_TEST_VERSION ? 'ggang-copy-test' : 'ggang-copy';
    const EXTENSION_NAME = IS_TEST_VERSION ? '깡갤 복사기(테스트)' : '깡갤 복사기';
    const TITLE_ICON = 'fa-clipboard-list';   // 확장 목록 제목 아이콘 (유저 지시 2026-10-09: 클립보드 모양 — 밋밋한 기본 fa-clipboard 대신 목록 있는 클립보드)
    const BASE_PATH = `/scripts/extensions/third-party/${EXTENSION_FOLDER}`;
    window.copybot_extension_folder = EXTENSION_FOLDER;   // 업데이트 API(commands.js)가 쓰는 설치 폴더명
    // ===================================================================

    if (window.copybot_debug_mode || IS_TEST_VERSION) {
        console.log(`🔥 ${EXTENSION_NAME}: 스크립트 로드 시작! (경로: ${BASE_PATH})`);
    }

    // 🔒 안전장치: 플래그와 폴더명 불일치 경고
    if ((EXTENSION_FOLDER.includes('test') && !IS_TEST_VERSION) ||
        (!EXTENSION_FOLDER.includes('test') && IS_TEST_VERSION)) {
        console.warn(`⚠️ [${EXTENSION_NAME}] 경고: 플래그와 폴더명이 불일치합니다!`, {
            IS_TEST_VERSION,
            EXTENSION_FOLDER,
            예상동작: IS_TEST_VERSION ? '테스트 모드로 작동' : '정식 모드로 작동'
        });
    }
	
	// ===================================================================
    // 📦 모듈 로더 (경로 자동화 적용)
    // ===================================================================
    
    // 공통 로더 함수 (코드 중복 제거)
    // 한 번 로드된 모듈은 다시 붙이지 않는다 — 초기화 재시도 때 IIFE 가 재실행되면 모듈 내부 리스너(generation 이벤트, pagehide 등)가 이중 등록됨
    const loadedModules = new Set();
    function createModuleLoader(fileName) {
        if (loadedModules.has(fileName)) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${BASE_PATH}/${fileName}`;
            script.async = false;   // 동적 삽입 스크립트도 삽입 순서대로 실행(다운로드는 병렬)
            script.onload = () => {
                loadedModules.add(fileName);
                debugLog(`${EXTENSION_NAME}: ${fileName} 로드 완료`);
                resolve();
            };
            script.onerror = (error) => {
                console.error(`${EXTENSION_NAME}: ${fileName} 로드 실패`, error);
                reject(error);
            };
            document.head.appendChild(script);
        });
    }

    // 모듈 실행 순서 (이 배열 순서 = 실행 순서)
    // utils.js 는 commands/generation 이 로드 시점에 바로 확인하므로 먼저 단독으로 끝낸다.
    // 나머지는 async=false 로 한꺼번에 삽입 → 다운로드는 병렬, 실행은 배열 순서. 하나라도 실패하면 reject(실패한 것만 재시도 때 다시 로드).
    const MODULE_FILES = [
        'settings.js', 'presets.js', 'commands.js', 'generation.js', 'actions.js', 'shortcut.js', 'capture.js',
        'icons.js', 'profiles.js', 'ghostwrite.js', 'messageOperations.js', 'ui.js', 'wandMenu.js'
    ];
    async function loadAllModules() {
        await createModuleLoader('utils.js');
        await Promise.all(MODULE_FILES.map(createModuleLoader));
    }

	// 대필 진행 상태 변수들은 ghostwrite 모듈로 이동됨

    // 디버그 로그 전용 함수 (utils 모듈 사용)
    function debugLog(...args) {
        if (window.CopyBotUtils) {
            window.CopyBotUtils.debugLog(isDebugMode, ...args);
        } else {
            // utils.js 로드 전에는 직접 출력 (초기화 로그 확인용)
            if (isDebugMode || (typeof args[0] === 'string' && args[0].includes('🔥'))) {
                console.log(`[${EXTENSION_NAME} (초기화 중)]`, ...args);
            }
        }
    }

    // 상태 아이콘 표시/숨김 함수 (ghostwrite 모듈 사용)
    function showStatusIcon(fieldName, isLoading = true) {
        return window.CopyBotGhostwrite ? 
            window.CopyBotGhostwrite.showStatusIcon(fieldName, isLoading) :
            console.error('CopyBotGhostwrite 모듈이 로드되지 않음');
    }

    // 디바운싱 자동저장 함수 (ghostwrite 모듈 사용)
    function scheduleDebounceAutoSave(fieldName, delay = 500) {
        return window.CopyBotGhostwrite ? 
            window.CopyBotGhostwrite.scheduleDebounceAutoSave(fieldName, delay) :
            console.error('CopyBotGhostwrite 모듈이 로드되지 않음');
    }

    // 즉시 자동저장 함수 (ghostwrite 모듈 사용)
    function scheduleImmediateAutoSave(fieldName, triggerType) {
        return window.CopyBotGhostwrite ? 
            window.CopyBotGhostwrite.scheduleImmediateAutoSave(fieldName, triggerType) :
            console.error('CopyBotGhostwrite 모듈이 로드되지 않음');
    }

    // 마지막 메시지 번호를 구하는 함수 (utils 모듈 사용) — ui 콜백으로 넘기는 바인딩 걱정 없는 래퍼
    function getLastMessageIndex() {
        return window.CopyBotUtils ?
            window.CopyBotUtils.getLastMessageIndex() :
            0;
    }

    // 조절점 및 placeholder 관리 함수들 (settings 모듈로 이동됨)
    function removeResizeHandle() {
        if (window.CopyBotSettings) {
            window.CopyBotSettings.removeResizeHandle();
        }
    }

    function restoreResizeHandle() {
        if (window.CopyBotSettings) {
            window.CopyBotSettings.restoreResizeHandle();
        }
    }

    function hidePlaceholder() {
        if (window.CopyBotSettings) {
            window.CopyBotSettings.hidePlaceholder();
        }
    }
    
    function restorePlaceholder() {
        if (window.CopyBotSettings) {
            window.CopyBotSettings.restorePlaceholder();
        }
    }

    function safeApplyPlaceholderSetting() {
        if (window.CopyBotSettings) {
            window.CopyBotSettings.safeApplyPlaceholderSetting();
        }
    }
    
    function enableHighQualityProfiles() {
        return window.CopyBotProfiles ? 
            window.CopyBotProfiles.enableHighQualityProfiles() :
            console.error('깡갤 복사기: CopyBotProfiles 모듈이 로드되지 않음');
    }
    
    function disableHighQualityProfiles() {
        return window.CopyBotProfiles ? 
            window.CopyBotProfiles.disableHighQualityProfiles() :
            console.error('깡갤 복사기: CopyBotProfiles 모듈이 로드되지 않음');
    }
    
    // HTML 템플릿은 settings.html에서 자동 제공됨

    // 프리셋 모듈을 통한 데이터 마이그레이션 (함수 제거, 모듈 호출로 변경)
    function performDataMigration() {
        if (window.CopyBotPresets) {
            return window.CopyBotPresets.performDataMigration();
        } else {
            console.error('깡갤 복사기: CopyBotPresets 모듈이 로드되지 않음');
        }
    }

    // 설정 저장 함수 (settings 모듈 사용)
    function saveSettings() {
        return window.CopyBotSettings ? 
            window.CopyBotSettings.saveSettings() :
            false;
    }

    // 디버그 모드를 모든 모듈에 전파 (저장값 로드 시 + 토글 시)
    function applyDebugMode(enabled) {
        isDebugMode = !!enabled;
        window.copybot_debug_mode = !!enabled;
        ['CopyBotCommands', 'CopyBotGeneration', 'CopyBotCapture', 'CopyBotIcons', 'CopyBotUI', 'CopyBotWandMenu', 'CopyBotShortcut', 'CopyBotProfiles'].forEach(name => {
            try { window[name]?.setDebugMode?.(!!enabled); } catch (e) { /* 무시 */ }
        });
    }

    // 설정 로드 함수 (settings 모듈 사용)
    function loadSettings() {
        if (window.CopyBotSettings) {
            // 콜백 함수들을 전달
            const callbacks = {
                enableHighQualityProfiles: enableHighQualityProfiles,
                disableHighQualityProfiles: disableHighQualityProfiles,
                updatePresetDropdown: updatePresetDropdown, // 이제 정의됨!
                loadPresetFromSettings: loadPresetFromSettings,
                setDebugMode: applyDebugMode
            };
            window.CopyBotSettings.loadSettings(callbacks);
        }
    }
    
    // 임시 프롬프트 창 스타일 업데이트 함수 (ghostwrite 모듈 사용)
    function updateTempPromptStyle() {
        return window.CopyBotGhostwrite ? 
            window.CopyBotGhostwrite.updateTempPromptStyle() :
            console.error('CopyBotGhostwrite 모듈이 로드되지 않음');
    }
    
    // 임시 프롬프트 입력칸 추가 함수 (ghostwrite 모듈 사용)
	function addTempPromptField() {
		return window.CopyBotGhostwrite ? 
			window.CopyBotGhostwrite.addTempPromptField() :
			console.error('CopyBotGhostwrite 모듈이 로드되지 않음');
	}

        // 대필 실행 함수 (ghostwrite 모듈 사용)
    async function executeGhostwrite() {
        return window.CopyBotGhostwrite ?
            await window.CopyBotGhostwrite.executeGhostwrite() :
            console.error('CopyBotGhostwrite 모듈이 로드되지 않음');
    }

    // 임시 프롬프트 로드 함수 (ghostwrite 모듈 사용)
    function loadTempPrompt() {
        return window.CopyBotGhostwrite ?
            window.CopyBotGhostwrite.loadTempPrompt() :
            console.error('CopyBotGhostwrite 모듈이 로드되지 않음');
    }

    // 메시지 복사 명령 실행 함수 (commands 모듈 사용)
    async function executeCopyCommand(start, end) {
        return window.CopyBotCommands ? 
            await window.CopyBotCommands.executeCopyCommand(start, end) :
            console.error('깡갤 복사기: CopyBotCommands 모듈이 로드되지 않음');
    }

    // 텍스트박스 내용을 클립보드에 복사하는 함수 (commands 모듈 사용)
    async function copyTextboxContent() {
        return window.CopyBotCommands ? 
            await window.CopyBotCommands.copyTextboxContent() :
            console.error('깡갤 복사기: CopyBotCommands 모듈이 로드되지 않음');
    }

    // 특정 element에서 태그를 제거하는 범용 함수 (commands 모듈 사용)
    function removeTagsFromElement(selector) {
        return window.CopyBotCommands ? 
            window.CopyBotCommands.removeTagsFromElement(selector) :
            console.error('깡갤 복사기: CopyBotCommands 모듈이 로드되지 않음');
    }


    // 동적 액션 버튼 업데이트 (ui.js 모듈 사용)
    function updateActionButtons() {
        return window.CopyBotUI ? 
            window.CopyBotUI.updateActionButtons() :
            console.error('깡갤 복사기: CopyBotUI 모듈이 로드되지 않음');
    }

    // safeUpdateInputFieldIcons 함수 - icons.js 모듈로 이동됨
	async function safeUpdateInputFieldIcons() {
		if (window.CopyBotIcons) {
			return await window.CopyBotIcons.safeUpdateInputFieldIcons();
		} else {
			console.error('깡갤 복사기: CopyBotIcons 모듈이 로드되지 않음');
		}
	}

		// =======================================================
		// 프리셋 관리 기능 (localStorage 기반) - 수정된 버전
		// =======================================================

		// 유틸리티: HTML 특수문자 처리 (utils 모듈로 이동됨)

		// 프리셋 모듈을 통한 활성 프리셋 설정 (모듈 호출로 변경)
		function setActivePreset(presetName) {
			if (window.CopyBotPresets) {
				return window.CopyBotPresets.setActivePreset(presetName);
			} else {
				console.error('깡갤 복사기: CopyBotPresets 모듈이 로드되지 않음');
			}
		}

		// 프리셋 모듈을 통한 활성 프리셋 조회 (모듈 호출로 변경)
		function getActivePreset() {
			return window.CopyBotPresets ? 
				window.CopyBotPresets.getActivePreset() :
				'기본 프리셋';
		}

		// 프리셋 모듈을 통한 프리셋 로드 (모듈 호출로 변경)
		function loadPreset(presetName) {
			if (window.CopyBotPresets) {
				return window.CopyBotPresets.loadPreset(presetName);
			} else {
				console.error('깡갤 복사기: CopyBotPresets 모듈이 로드되지 않음');
			}
		}

		// settings에서 호출하는 프리셋 로드용 (호환성)
		function loadPresetFromSettings(presetName) {
			return loadPreset(presetName);
		}

		// 프리셋 모듈을 통한 프리셋 이름 변경 (모듈 호출로 변경)
		function renamePreset(oldName, newName) {
			return window.CopyBotPresets ? 
				window.CopyBotPresets.renamePreset(oldName, newName) :
				false;
		}

		// 프리셋 모듈을 통한 프리셋 삭제 (모듈 호출로 변경)
		function deletePreset(nameToDelete) {
			return window.CopyBotPresets ? 
				window.CopyBotPresets.deletePreset(nameToDelete) :
				false;
		}

		// 프리셋 모듈을 통한 새 프리셋 추가 (모듈 호출로 변경)
		function addNewPreset() {
			if (window.CopyBotPresets) {
				return window.CopyBotPresets.addNewPreset();
			} else {
				console.error('깡갤 복사기: CopyBotPresets 모듈이 로드되지 않음');
			}
		}

		// 프리셋 모듈을 통한 현재 프리셋 복사 (모듈 호출로 변경)
		function copyCurrentPreset() {
			if (window.CopyBotPresets) {
				return window.CopyBotPresets.copyCurrentPreset();
			} else {
				console.error('깡갤 복사기: CopyBotPresets 모듈이 로드되지 않음');
			}
		}

		// 프리셋 모듈을 통한 순서 변경 (모듈 호출로 변경)
		function reorderPresets(newOrderNameArray) {
			if (window.CopyBotPresets) {
				return window.CopyBotPresets.reorderPresets(newOrderNameArray);
			} else {
				console.error('깡갤 복사기: CopyBotPresets 모듈이 로드되지 않음');
			}
		}

		// 프리셋 모듈을 통한 순서 변경 UI 열기 (모듈 호출로 변경)
		function openReorderModal() {
			if (window.CopyBotPresets) {
				return window.CopyBotPresets.openReorderModal();
			} else {
				console.error('깡갤 복사기: CopyBotPresets 모듈이 로드되지 않음');
			}
		}

		// 프리셋 모듈을 통한 순서 변경 UI 닫기 (모듈 호출로 변경)
		function closeReorderModal() {
			if (window.CopyBotPresets) {
				return window.CopyBotPresets.closeReorderModal();
			} else {
				console.error('깡갤 복사기: CopyBotPresets 모듈이 로드되지 않음');
			}
		}

		// 프리셋 모듈을 통한 드롭다운 업데이트 (모듈 호출로 변경)
		function updatePresetDropdown() {
			if (window.CopyBotPresets) {
				return window.CopyBotPresets.updatePresetDropdown();
			} else {
				console.error('깡갤 복사기: CopyBotPresets 모듈이 로드되지 않음');
			}
		}

		// 프리셋 모듈을 통한 편집 모드 진입 (모듈 호출로 변경)
		function enterPresetEditMode() {
            if (window.CopyBotPresets) {
                return window.CopyBotPresets.enterPresetEditMode();
            } else {
                console.error('깡갤 복사기: CopyBotPresets 모듈이 로드되지 않음');
            }
        }

		// 프리셋 모듈을 통한 편집 모드 종료 (모듈 호출로 변경)
		function exitPresetEditMode(forceUpdate = false) {
            if (window.CopyBotPresets) {
                return window.CopyBotPresets.exitPresetEditMode(forceUpdate);
            } else {
                console.error('깡갤 복사기: CopyBotPresets 모듈이 로드되지 않음');
            }
        }

		// 프리셋 모듈을 통한 편집 버튼 상태 업데이트 (모듈 호출로 변경)
		function updatePresetEditButtonState() {
			if (window.CopyBotPresets) {
				return window.CopyBotPresets.updatePresetEditButtonState();
			} else {
				console.error('깡갤 복사기: CopyBotPresets 모듈이 로드되지 않음');
			}
		}

    // UI 이벤트 설정 함수 (ui.js 모듈 사용)
    function setupEventHandlers() {
        return window.CopyBotUI ? 
            window.CopyBotUI.setupEventHandlers() :
            console.error('깡갤 복사기: CopyBotUI 모듈이 로드되지 않음');
    }


    // scheduleIconUpdates 함수 - icons.js 모듈로 이동됨
	function scheduleIconUpdates() {
		if (window.CopyBotIcons) {
			return window.CopyBotIcons.scheduleIconUpdates();
		} else {
			console.error('깡갤 복사기: CopyBotIcons 모듈이 로드되지 않음');
		}
	}

    // 프로필 목록 로드 함수 (강화된 버전)
	function loadGhostwriteProfiles() {
		return window.CopyBotProfiles ? 
			window.CopyBotProfiles.loadGhostwriteProfiles() :
			console.error('깡갤 복사기: CopyBotProfiles 모듈이 로드되지 않음');
	}

        // 프로필 전환 함수 (ghostwrite 모듈 사용)
    async function switchProfile(targetProfileId, isRestore = false) {
        return window.CopyBotGhostwrite ? 
            await window.CopyBotGhostwrite.switchProfile(targetProfileId, isRestore) :
            (console.error('CopyBotGhostwrite 모듈이 로드되지 않음'), false);
    }

    // === messageOperations 모듈 wrapper 함수들 ===
    
    // /hide 명령어 실행 함수 (messageOperations 모듈 사용)
    function executeHideCommand(startIndex, endIndex) {
        return window.CopyBotMessageOperations ? 
            window.CopyBotMessageOperations.executeHideCommand(startIndex, endIndex) :
            console.error('CopyBotMessageOperations 모듈이 로드되지 않음');
    }

    // /unhide 명령어 실행 함수 (messageOperations 모듈 사용)
    function executeUnhideCommand(startIndex, endIndex) {
        return window.CopyBotMessageOperations ? 
            window.CopyBotMessageOperations.executeUnhideCommand(startIndex, endIndex) :
            console.error('CopyBotMessageOperations 모듈이 로드되지 않음');
    }

    // 다중 메시지 삭제 함수 (messageOperations 모듈 사용)
    function executeMultiDelete(startIndex, endIndex) {
        return window.CopyBotMessageOperations ? 
            window.CopyBotMessageOperations.executeMultiDelete(startIndex, endIndex) :
            console.error('CopyBotMessageOperations 모듈이 로드되지 않음');
    }

    // 한 단계의 예외가 뒤 단계(다른 모듈 초기화·UI 로드)를 끊지 않게 격리해서 실행
    function safeInit(name, fn) {
        try { fn(); } catch (e) { console.error(`깡갤 복사기: ${name} 초기화 실패`, e); }
    }

    // 초기화 함수 (마이그레이션 포함)
    // 초기화 재시도: 상한 5회, 재시도 타이머는 "아직 초기화 안 됐으면"만 실행 (이벤트 쪽에서 먼저 성공했으면 아무것도 안 함 → 이중 초기화 없음)
    let initRetries = 0;
    function scheduleInitRetry(reason) {
        isInitialized = false;
        if (initRetries >= 5) {
            console.error(`깡갤 복사기: 초기화 재시도 한도 도달(${reason}) — 페이지를 새로고침해 주십시오`);
            return;
        }
        initRetries++;
        debugLog(`깡갤 복사기: ${reason}. 3초 후 재시도 (${initRetries}/5)`);
        setTimeout(() => { if (!isInitialized) initialize(); }, 3000);
    }

    async function initialize() {
        if (isInitialized) return;
        isInitialized = true;
        debugLog('깡갤 복사기: 초기화 시작...');
        
        // 모듈 로드 (실패하면 재시도 예약 — 이미 로드된 모듈은 loadedModules 로 건너뜀)
        try {
            await loadAllModules();
        } catch (error) {
            console.error('깡갤 복사기: 모듈 로드 실패', error);
            scheduleInitRetry('모듈 로드 실패');
            return;
        }

        // 모듈별 초기화 — 하나가 예외를 던져도 나머지 모듈과 설정 UI 는 계속 진행한다(safeInit 격리)
        window.CopyBotBasePath = BASE_PATH;   // capture 가 vendor 라이브러리를 첫 캡처 때 지연 로드할 경로

        safeInit('presets', () => {
            if (window.CopyBotPresets) window.CopyBotPresets.init({});
        });

        safeInit('commands', () => {
            if (window.CopyBotCommands) window.CopyBotCommands.init({ isDebugMode: isDebugMode });
        });

        // generation 모듈 초기화 (생성 상태 추적 이벤트 바인딩)
        safeInit('generation', () => {
            if (window.CopyBotGeneration) window.CopyBotGeneration.init({ isDebugMode: isDebugMode });
        });

        safeInit('capture', () => {
            if (window.CopyBotCapture) window.CopyBotCapture.init({ isDebugMode: isDebugMode });
        });

        safeInit('icons', () => {
			if (window.CopyBotIcons) {
				window.CopyBotIcons.init({
					utils: window.CopyBotUtils,
					isDebugMode: isDebugMode,
					// 콜백 함수들 전달
						callbacks: {
							executeGhostwrite: executeGhostwrite,
							removeTagsFromElement: () => window.CopyBotCommands?.removeTagsFromElement('#send_textarea'),
							executeSimpleCommand: (cmd, msg, callback) => window.CopyBotCommands?.executeSimpleCommand(cmd, msg, callback),
							smartDeleteAndRegenerate: () => window.CopyBotCommands?.smartDeleteAndRegenerate(),
							deleteLastMessage: () => window.CopyBotGeneration?.deleteLastMessage(),
							toggleQuickMenu: () => window.CopyBotWandMenu?.toggleQuickMenu()
						}
				});
			}
        });

        safeInit('profiles', () => {
			if (window.CopyBotProfiles) {
				window.CopyBotProfiles.init({
					utils: window.CopyBotUtils,
					isDebugMode: isDebugMode
				});
			}
        });

        safeInit('ghostwrite', () => {
			if (window.CopyBotGhostwrite) {
				window.CopyBotGhostwrite.init({
					utils: window.CopyBotUtils
				});
			}
        });

        safeInit('messageOperations', () => {
			if (window.CopyBotMessageOperations) {
				window.CopyBotMessageOperations.init({
					utils: window.CopyBotUtils,
					commands: window.CopyBotCommands
				});
			}
        });

        safeInit('ui', () => {
			if (window.CopyBotUI) {
				window.CopyBotUI.init({
					isDebugMode: isDebugMode,
					callbacks: {
						// utils 모듈 함수들
						debugLog: window.CopyBotUtils?.debugLog,
						escapeHtml: window.CopyBotUtils?.escapeHtml,
						getLastMessageIndex: getLastMessageIndex,

						// settings 모듈 함수들  
						// 주의: window.CopyBotSettings.saveSettings 를 그대로 넘기면 this 가 callbacks 가 돼 디바운스 타이머 안에서 this.saveSettingsNow 가 없어 저장이 조용히 실패함 → 바인딩된 래퍼로
						saveSettings: saveSettings,
						removeResizeHandle: removeResizeHandle,
						restoreResizeHandle: restoreResizeHandle,
						hidePlaceholder: hidePlaceholder,
						restorePlaceholder: restorePlaceholder,
						safeApplyPlaceholderSetting: safeApplyPlaceholderSetting,
						
						// presets 모듈 함수들
						loadPreset: loadPreset,
						addNewPreset: addNewPreset,
						deletePreset: deletePreset,
						renamePreset: renamePreset,
						copyCurrentPreset: copyCurrentPreset,
						setActivePreset: setActivePreset,
						getActivePreset: getActivePreset,
						updatePresetDropdown: updatePresetDropdown,
						enterPresetEditMode: enterPresetEditMode,
						exitPresetEditMode: exitPresetEditMode,
						updatePresetEditButtonState: updatePresetEditButtonState,
						openReorderModal: openReorderModal,
						closeReorderModal: closeReorderModal,
						reorderPresets: reorderPresets,
						isEditMode: () => window.CopyBotPresets?.isEditMode(),
						
						// commands / generation / actions 모듈 함수들
						jumpToMessage: (index, msg) => window.CopyBotCommands?.jumpToMessage(index, msg),
						deleteLastMessage: () => window.CopyBotGeneration?.deleteLastMessage(),
						deleteAndRegenerate: () => window.CopyBotGeneration?.deleteAndRegenerate(),
						runAction: (id, slotIndex, anchor) => window.CopyBotActions?.run(id, slotIndex, anchor),
						executeCopyCommand: executeCopyCommand,
						removeTagsFromElement: removeTagsFromElement,
						copyTextboxContent: copyTextboxContent,

						// icons 모듈 함수들
						safeUpdateInputFieldIcons: safeUpdateInputFieldIcons,
						updateInputFieldIcons: () => window.CopyBotIcons?.updateInputFieldIcons(),
						
						// profiles 모듈 함수들
						enableHighQualityProfiles: enableHighQualityProfiles,
						disableHighQualityProfiles: disableHighQualityProfiles,
						loadGhostwriteProfiles: loadGhostwriteProfiles,
						
						// ghostwrite 모듈 함수들
						addTempPromptField: addTempPromptField,
						scheduleDebounceAutoSave: scheduleDebounceAutoSave,
						scheduleImmediateAutoSave: scheduleImmediateAutoSave,
						showStatusIcon: showStatusIcon,
						isGhostwritingActive: () => window.CopyBotGhostwrite?.isGhostwritingActive(),
						setGhostwritingActive: (active) => window.CopyBotGhostwrite?.setGhostwritingActive(active),
						getGhostwriteOriginalProfile: () => window.CopyBotGhostwrite?.getGhostwriteOriginalProfile(),
						switchProfile: switchProfile,
						
						// messageOperations 모듈 함수들
						executeHideCommand: executeHideCommand,
						executeUnhideCommand: executeUnhideCommand,
						executeMultiDelete: executeMultiDelete,

						// 기타 필요한 함수들
						setDebugMode: applyDebugMode
					}
				});
			}
        });

        safeInit('wandMenu', () => {
			if (window.CopyBotWandMenu) {
				window.CopyBotWandMenu.init({
					isDebugMode: isDebugMode,
					callbacks: {
						// 메시지 이동
						jumpToMessage: (index, msg) =>
							window.CopyBotCommands?.jumpToMessage(index, msg),

						// 다중(범위) 삭제 — 검증·경고창·/cut 은 messageOperations 한 곳
						executeMultiDelete: executeMultiDelete,

						// 입력값 없는 동작(이동·태그 제거·삭제·삭제 후 재생성·커스텀)은 전부 동작 레지스트리(actions.js) 경유
						runAction: (id, slotIndex, anchor) => window.CopyBotActions?.run(id, slotIndex, anchor),
						getCustomSlots: () => window.CopyBotActions?.getEnabledSlots() || [],

						// 플로팅 메뉴 설정 확인
						getFloatMenuSettings: () => ({
							enabled: $('#copybot_float_toggle').attr('data-enabled') === 'true',
							iconClass: $('#copybot_float_icon_picker').data('icon') || 'fa-bolt'
						}),

						// 복사 (기존 함수 - 텍스트박스 포함)
						executeCopyCommand: (start, end) => 
							window.CopyBotCommands?.executeCopyCommand(start, end),
						
						// 숨기기/보이기
						executeHideCommand: (start, end) => 
							window.CopyBotMessageOperations?.executeHideCommand(start, end),
						executeUnhideCommand: (start, end) => 
							window.CopyBotMessageOperations?.executeUnhideCommand(start, end),
						
						// 메시지 범위 정보
						getMessageRange: () => 
							window.CopyBotMessageOperations?.getMessageRange(),
						
						// 좆됨방지 설정 확인 — 판정은 settings.js 한 곳(fail-closed)에 위임. 모듈이 없으면 확인하는 쪽(true)
						isConfirmDeleteEnabled: () =>
							window.CopyBotSettings?.isConfirmDeleteEnabled ? window.CopyBotSettings.isConfirmDeleteEnabled() : true,

						// 퀵메뉴 설정 확인
						getQuickMenuSettings: () => ({
							enabled: $('#copybot_quickmenu_toggle').attr('data-enabled') === 'true',
							accessWand: $('#copybot_quickmenu_wand').is(':checked'),
							accessInputIcon: $('#copybot_quickmenu_input_icon').is(':checked'),
							inputIconPosition: $('#copybot_quickmenu_icon_position').val() || 'bottom_left'
						})
					}
				});
			}
        });

        // 데이터 마이그레이션 실행 (UI 로드 전)
        safeInit('데이터 마이그레이션', performDataMigration);

        try {
            if ($("#extensions_settings2").length > 0) {
            // settings.html 내용을 수동으로 DOM에 삽입
            try {
                if ($('#copybot_settings').length === 0) {   // 재시도 때 패널이 이미 있으면 다시 붙이지 않는다(id 중복 방지)
                    const response = await fetch(`${BASE_PATH}/settings.html`);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const htmlContent = await response.text();
                    $("#extensions_settings2").append(htmlContent);
                }

                // UI 타이틀 업데이트 (테스트 버전일 경우 자동으로 (테스트) 추가)
                $("#copybot_settings .inline-drawer-header b").empty()
                    .append($('<i>').addClass(`fa-solid ${TITLE_ICON} copybot_title_icon`)).append(document.createTextNode(` ${EXTENSION_NAME}`));

                debugLog(`${EXTENSION_NAME}: 설정 UI 수동 로드 완료`);
            } catch (error) {
                console.error('깡갤 복사기: settings.html 로드 실패', error);
                scheduleInitRetry('settings.html 로드 실패');   // 예전엔 여기서 조용히 죽었음(재시도 없음)
                return;
            }
            
            // 모든 모듈이 초기화된 후 이벤트 핸들러 설정
                setupEventHandlers();

                setTimeout(() => {
					// 통합된 로딩 시스템 (순서 중요). 단계별로 격리 — 한 단계가 실패해도 다음 단계는 진행
					safeInit('설정 로드', loadSettings); // 프리셋 로딩도 여기서 자동 처리됨
					safeInit('임시 프롬프트 로드', loadTempPrompt);
					safeInit('임시 대필칸', addTempPromptField);
					safeInit('액션 버튼', updateActionButtons);
					safeInit('대필 프로필 목록', loadGhostwriteProfiles);

					// 프리셋 관련 UI 업데이트 (순서 중요!)
					safeInit('프리셋 드롭다운', updatePresetDropdown);
					safeInit('프리셋 편집 버튼', updatePresetEditButtonState);
					// 기능을 하나라도 쓰고 있을 때만 문서 스크롤 가드·채팅 전환 재적용 설치 (전부 OFF 면 전역 리스너 없음)
					safeInit('스크롤 가드', () => window.copybot_ensureScrollGuard());

					// 안전한 초기값 동기화 (설정 로드가 끝난 뒤)
					// 대필 지시문 칸의 삭제·잘라내기·붙여넣기·드롭 저장은 ui.js 의 input 핸들러(디바운스 저장)가 전부 받는다 — 별도 keyup/cut/paste/drop 핸들러 없음
					setTimeout(() => {
						safeInit('대필 초기값 동기화', () => {
							if (window.CopyBotGhostwrite) {
								window.CopyBotGhostwrite.syncInitialValues();
								debugLog('🔄 ghostwrite 모듈 안전 초기화 완료');
							} else {
								debugLog('⚠️ ghostwrite 모듈 로드 대기 중, 기본 동작 유지');
							}
						});
					}, 300);

					// 강화된 다중 시점 아이콘 업데이트 시도
					safeInit('입력창 아이콘', scheduleIconUpdates);
				}, 100);

                $(document).off('.copybot_init');   // 초기화 재시도 리스너 해제
                debugLog('깡갤 복사기: ✅ 초기화 완료!');
            } else {
                scheduleInitRetry('#extensions_settings2 요소를 찾을 수 없음');
            }
        } catch(e) {
            console.error("깡갤 복사기: 초기화 실패", e);
            scheduleInitRetry('초기화 중 예외');
        }
    }

    // 문서(window) 스크롤 가드
    // 실리는 body overflow:hidden 레이아웃이라 문서가 스크롤될 일이 없는데, 일부 테마(모바일)에서 문서가 상단바 높이(40px)만큼
    // 더 길어져 있어 포커스·scrollIntoView 등으로 문서가 밀리면 상단 메뉴바가 화면 밖으로 사라진다.
    // 어떤 원인(우리 코드든, 다른 확장이든, 키보드든)으로든 문서가 밀리면 즉시 0 으로 되돌린다.
    // 어떤 기능이든 하나라도 켜져 있을 때만 설치한다 (전부 OFF 면 전역 리스너 0 — 미사용 시 무영향 원칙)
    let scrollGuardInstalled = false;
    function installWindowScrollGuard() {
        if (scrollGuardInstalled) return;
        scrollGuardInstalled = true;
        let scheduled = false;
        const guard = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                const se = document.scrollingElement || document.documentElement;
                if (se.scrollTop > 0 && getComputedStyle(document.body).overflowY === 'hidden') {
                    debugLog(`문서 스크롤 감지(${se.scrollTop}px) → 0 으로 복구`);
                    window.scrollTo(0, 0);
                    se.scrollTop = 0;
                }
            });
        };
        window.addEventListener('scroll', guard, { passive: true });
        guard();
    }
    // 설정 패널의 기능 토글 중 하나라도 ON 이거나, 입력창 안내문 모드가 '기본'이 아니거나, 캡처 미리보기가 떠 있으면 "사용 중"으로 본다
    // 안전장치·보조 토글(좆됨방지, 캡처 익명화, 디버그, 구 안내문 숨김)은 기본 ON 이거나 기능이 아니라서 판정에서 뺀다
    // — 이걸 세면 전 옵션 OFF 여도 항상 true 가 돼 전역 리스너가 깔린다(미사용 시 무영향 위반)
    const NON_FEATURE_TOGGLES = '#copybot_confirm_delete_toggle, #copybot_capture_anonymize_toggle, #copybot_debug_mode_toggle, #copybot_hide_placeholder_toggle';
    function isAnyFeatureOn() {
        if ($('#copybot_settings .copybot_toggle_button[data-enabled="true"]').not(NON_FEATURE_TOGGLES).length > 0) return true;
        const mode = $('#copybot_placeholder_mode').val();
        if (!!mode && mode !== 'off') return true;
        return !!window.CopyBotCapture?.hasPreview?.();
    }

    // 채팅 전환 뒤 재적용(임시 대필칸·입력창 아이콘·안내문) — 기능이 하나라도 ON 일 때만 1회 등록.
    // 전부 OFF 가 된 뒤 채팅이 바뀌면 스스로 구독을 해제한다(남는 리스너 0).
    let chatChangedHook = null;
    function ensureChatChangedHook() {
        if (chatChangedHook) return;
        const context = window.SillyTavern?.getContext?.();
        const eventName = context?.event_types?.CHAT_CHANGED;
        if (!eventName || typeof context?.eventSource?.on !== 'function') return;
        chatChangedHook = () => {
            if (!isAnyFeatureOn()) {
                try { context.eventSource.removeListener?.(eventName, chatChangedHook); } catch (e) { /* 무시 */ }
                chatChangedHook = null;
                return;
            }
            setTimeout(() => {
                safeInit('임시 대필칸(채팅 전환)', addTempPromptField);
                safeInit('임시 프롬프트 로드(채팅 전환)', loadTempPrompt);
                // 아이콘·안내문도 안전한 방식으로 재적용
                safeInit('입력창 아이콘(채팅 전환)', safeUpdateInputFieldIcons);
                safeInit('입력창 안내문(채팅 전환)', safeApplyPlaceholderSetting);
            }, 500);
        };
        context.eventSource.on(eventName, chatChangedHook);
    }

    window.copybot_ensureScrollGuard = function() {
        if (!isAnyFeatureOn()) return;
        installWindowScrollGuard();
        ensureChatChangedHook();
    };

    // 테마(body class) 변경 감시 — 입력창 아이콘·임시 대필칸이 실제로 있을 때만 관찰 (없으면 옵저버 해제)
    let themeObserver = null;
    window.copybot_refreshThemeWatch = function() {
        const needed = !!document.querySelector('.copybot_input_field_icon, #copybot_temp_prompt');
        if (needed && !themeObserver && document.body) {
            themeObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.target === document.body && mutation.attributeName === 'class') {
                        debugLog('깡갤 복사기: 테마 변경 감지, 아이콘 및 임시 프롬프트 창 업데이트');
                        setTimeout(() => {
                            safeUpdateInputFieldIcons();
                            updateTempPromptStyle();
                        }, 100);
                        break;
                    }
                }
            });
            themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: false });
        } else if (!needed && themeObserver) {
            themeObserver.disconnect();
            themeObserver = null;
        }
    };

    $(document).ready(function() {
        debugLog('깡갤 복사기: DOM 준비 완료');
        setTimeout(initialize, 1000);

        // 채팅 전환 뒤 재적용은 ensureChatChangedHook() 가 실리 eventSource(CHAT_CHANGED)로 처리한다
        // (예전의 $(document).on('characterSelected chat_render_complete CHAT_CHANGED') 는 실리가 쏘지 않는 jQuery 이벤트라 제거)

        // 초기화 재시도용 리스너 — 초기화가 끝나면 해제한다 (initialize 끝에서 .copybot_init 네임스페이스 off)
        $(document).on('change.copybot_init', '#character_select', () => {
            setTimeout(() => { if (!isInitialized) initialize(); }, 200);
        });
        $(document).on('click.copybot_init', '[data-i18n="Extensions"]', () => {
            setTimeout(() => { if (!isInitialized) initialize(); }, 500);
        });
        setTimeout(() => {
            if (!isInitialized) {
                debugLog('깡갤 복사기: 타이머 강제 초기화 실행');
                initialize();
            }
        }, 5000);
    });

    if (window.copybot_debug_mode) {
        console.log('깡갤 복사기 확장프로그램이 로드되었습니다.');
    }

})();