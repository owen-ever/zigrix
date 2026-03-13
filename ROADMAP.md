# Zigrix Roadmap

이 문서는 Zigrix를 **10점짜리 오픈소스 CLI**로 만들기 위한 상위 로드맵이다.

현재 판단:
- 조사 품질: 높음
- 방향성: 대체로 맞음
- 실제 공개 준비도: 낮음

즉, 지금 상태는 **좋은 설계 초안**이지 **곧 공개 가능한 제품**은 아니다.

## North Star

Zigrix는 아래 조건을 만족할 때 `10/10 open-source CLI`로 본다.

1. **3분 내 설치 가능**
2. **macOS/Linux에서 동일한 golden path 동작**
3. **`zigrix doctor`로 환경 진단 가능**
4. **명령 출력이 사람이 읽기 좋고, `--json`으로 기계가 읽기 좋음**
5. **README만 읽어도 첫 성공 경험 가능**
6. **GitHub Releases 기반 설치/업데이트/롤백 경로가 명확함**
7. **OpenClaw skill pack으로 즉시 활용 가능**
8. **테스트/CI/릴리즈 자동화가 갖춰짐**
9. **LICENSE / SECURITY / CONTRIBUTING 포함**
10. **외부 사용자가 설치해도 개인 로컬 환경 가정이 없음**

## Phase

- Phase 0: 제품 결정 고정
- Phase 1: portable core 추출
- Phase 2: CLI 표면/JSON 계약 정리
- Phase 3: install/release 시스템 구축
- Phase 4: OpenClaw skill pack 구축
- Phase 5: hardening / alpha
- Phase 6: beta / 외부 검증
- Phase 7: v1.0 release

세부 계획은 `docs/ten-out-of-ten-plan-2026-03-13.md` 참조.
