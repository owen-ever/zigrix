# Zigrix 조사/분석 점수표 (2026-03-13)

## 평가 기준

점수는 **10점 만점**이며, 아래 3가지를 종합해 매겼다.

1. **정확도 / 근거성** — 실제 코드/문서/공식 자료에 기반했는가
2. **실행 가능성** — 바로 설계/구현 결정으로 이어질 수 있는가
3. **공개 배포 적합성** — 오픈소스 릴리즈 기준에서 현실적인가

---

## 총평

이 문서는 처음엔 다소 후한 점수로 보일 수 있게 작성됐다. 냉정하게 재정리하면:

- **조사 품질:** **8.2 / 10**
- **실행 가능한 설계안 성숙도:** **6.8 / 10**
- **실제 오픈소스 공개 준비도:** **4.0 / 10**

즉, 현재 상태는 **좋은 조사/설계 초안**이지, **곧 공개 가능한 CLI 제품**은 아니다.

좋은 점:
- 로컬 실체(`orchestration/`)를 직접 확인한 분석이라 공중전이 아님
- OpenClaw plugin/skill 구조를 실제 설치 소스 기준으로 확인함
- 공개형 CLI로 가기 위한 현실적 병목(절대경로, 제품 경계, install UX)을 잘 짚음
- GitHub Releases + install.sh + skill pack 조합이 현재 자산과 가장 잘 맞는다는 결론이 설득력 있음

아쉬운 점:
- 아직 실제 프로토타입이 없음
- install.sh / release workflow / sample skill pack이 없음
- Windows 배포 전략은 후순위로만 정리돼 있음
- 라이선스 적합성은 방향 제안 수준이고, 의존성 라이선스 실사는 아직 안 함
- install.sh 보안 모델(핀/서명/roll-forward 정책)은 초안 수준

---

## 항목별 점수

### 1. 현재 Zigrix 실체 파악
- **점수: 9.5 / 10**
- 이유:
  - 실제 파일 구조, 스크립트 역할, 이벤트 모델, 메타 구조까지 직접 확인함
  - "운영용 orchestration runtime"이라는 규정이 정확함
  - 공개 제품과 현재 상태의 차이를 잘 설명함
- 감점 이유:
  - 아직 각 스크립트의 입력/출력 계약을 표로 완전히 정리하진 않음

### 2. 공개용 CLI 전환 필요조건 분석
- **점수: 9.2 / 10**
- 이유:
  - 절대경로 제거, 상태 경로 분리, 명령면 재설계, 패키징 메타데이터 필요성을 잘 짚음
  - 제품화 레이어 부족이라는 진단이 핵심을 잘 맞춤
- 감점 이유:
  - config schema와 migration strategy를 아직 세부 명세로 내리진 않음

### 3. OpenClaw 연동 방식 분석
- **점수: 9.0 / 10**
- 이유:
  - plugin, plugin-shipped skills, plain skills의 차이를 실제 로컬 설치 기준으로 확인함
  - `requires.bins` 기반 readiness 모델을 확인해서 현실적인 연동 경로를 제시함
  - v0.1 pluginless, v0.2 companion plugin 단계 구분이 좋음
- 감점 이유:
  - 실제 샘플 skill 세트 초안까지는 아직 없음

### 4. 배포 채널 판단 (GitHub Releases / install.sh / PyPI / pipx / uv)
- **점수: 8.7 / 10**
- 이유:
  - install.sh 중심 전략과 PyPI 후속 전략의 역할 구분이 좋음
  - pipx/uv를 후속 또는 병행 채널로 보는 판단이 현실적임
- 감점 이유:
  - 실제 사용자 여정(완전 초심자 vs Python 사용자)에 대한 비교가 조금 더 있으면 좋음
  - Homebrew / Windows 경로는 아직 러프함

### 5. GitHub Releases / 릴리즈 자산 설계
- **점수: 8.4 / 10**
- 이유:
  - release asset 구성(wheel/sdist/skills/install/checksums) 제안이 실무적임
  - GitHub의 asset digest 자동 노출까지 확인한 건 좋음
- 감점 이유:
  - 태그 전략, prerelease 정책, asset naming convention, rollback 전략은 더 구체화 필요

### 6. 오픈소스 repo 운영 요건 (LICENSE / SECURITY / CONTRIBUTING 등)
- **점수: 8.9 / 10**
- 이유:
  - 공개 가능한 repo와 그냥 public repo의 차이를 잘 정리함
  - LICENSE, SECURITY.md, CONTRIBUTING, CHANGELOG 필요성을 적절히 짚음
- 감점 이유:
  - community health file 우선순위는 좋지만, 실제 초안 템플릿은 아직 없음

### 7. 라이선스 판단
- **점수: 7.8 / 10**
- 이유:
  - MIT vs Apache-2.0의 방향 제안은 적절함
  - Zigrix 성격상 Apache-2.0 추천도 납득 가능함
- 감점 이유:
  - 현재/예정 의존성의 라이선스 조합 검토가 없음
  - contributor policy와 향후 CLA 필요성은 아직 미검토

### 8. install.sh 전략 현실성
- **점수: 8.6 / 10**
- 이유:
  - app-owned venv + `~/.local/bin` 링크 방식은 현실적임
  - OpenClaw skill optional install까지 고려한 건 좋음
- 감점 이유:
  - shell 호환성 범위, 실패 복구, idempotency, uninstall 시나리오를 더 구체화해야 함

### 9. 즉시 다음 단계 제안
- **점수: 9.3 / 10**
- 이유:
  - 조사 → 명세 → scaffold → portable refactor → skill pack → alpha release 순서가 적절함
  - 지금 무엇을 결정해야 하는지 명확함
- 감점 이유:
  - 일정/마일스톤 추정치까지 있으면 더 좋음

---

## 중요도 × 확신도 매트릭스

| 항목 | 중요도 | 확신도 | 한줄 평가 |
|---|---:|---:|---|
| 절대경로 제거 필요성 | 10 | 10 | 무조건 맞음 |
| Zigrix 본체는 독립 CLI여야 함 | 10 | 9 | 거의 맞음 |
| v0.1은 pluginless skill pack이 적합 | 9 | 9 | 현재 최적안 |
| GitHub Releases + install.sh 우선 | 9 | 8 | 가장 현실적 |
| PyPI는 후속 채널이 적절 | 7 | 8 | 무난한 판단 |
| Apache-2.0 추천 | 6 | 7 | 가능성 높지만 확정 전 실사 필요 |
| macOS/Linux 우선 지원 | 8 | 9 | 초기 범위로 적절 |
| install 중 OpenClaw skill opt-in | 7 | 8 | UX상 안전한 선택 |

---

## 최종 점수 요약

- **현황 진단 정확도:** 9.3 / 10
- **아키텍처 방향성:** 9.0 / 10
- **조사 품질 총점:** 8.2 / 10
- **실행 가능한 설계안 성숙도:** 6.8 / 10
- **실제 오픈소스 공개 준비도:** 4.0 / 10

---

## 다음 보강 시 점수를 9.3+까지 끌어올릴 항목

1. **실제 배포 유사체 비교표 추가**
   - gws
   - Python CLI 1~2개
   - OpenClaw skill-pack형 repo 1개

2. **명령/입출력 계약 표준화 문서 작성**
   - 각 명령의 input/output/error schema 정리

3. **install.sh 상세 설계**
   - idempotency
   - rollback
   - version pinning
   - shell compatibility

4. **license/dependency 실사**
   - 예정 의존성 목록
   - 라이선스 충돌 여부

5. **공개 repo health files 초안 작성**
   - LICENSE
   - SECURITY.md
   - CONTRIBUTING.md
   - release workflow 초안

이 5개까지 채우면 조사 단계는 **설계 승인 가능한 수준(8점대 후반~9점대 초반)** 으로 올라갈 수 있다. 다만 제품 점수는 구현/설치 검증 전까지 크게 오르지 않는다.
