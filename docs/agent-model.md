# Zigrix Agent Model

## 목적
에이전트의 "존재"와 "오케스트레이션 참여"를 분리해서 관리한다.

## 핵심 개념

### 1. registry
시스템이 알고 있는 전체 agent 목록.

### 2. participants
현재 orchestration에서 실제로 활용하는 agent 목록.

### 3. excluded
registry에는 있지만 orchestration에서 제외한 agent 목록.

## 왜 분리해야 하는가
- 새 agent를 미리 등록해둘 수 있음
- 프로젝트나 환경마다 subset만 선택 가능
- 과거 participant를 제거해도 registry 기록은 보존 가능

## role model
- 한 agent는 1개 기본 role을 가진다
- 필요 시 secondary roles 확장 가능
- orchestration rule은 agent label이 아니라 role 중심으로 정의하는 것이 안전함

## 예상 명령
- `zigrix agent list`
- `zigrix agent add`
- `zigrix agent remove`
- `zigrix agent include`
- `zigrix agent exclude`
- `zigrix agent enable`
- `zigrix agent disable`
- `zigrix agent set-role`

## selection policy
- scale rule은 required/optional roles를 정의
- registry에서 해당 role 후보를 찾음
- participants에 포함되고 enabled=true인 agent만 실제 후보가 됨

## validation
- participant는 반드시 registry에 존재해야 함
- excluded는 반드시 registry에 존재해야 함
- 같은 agent가 participants/excluded 동시 존재 불가
- role 없는 agent는 orchestration candidate가 될 수 없음
