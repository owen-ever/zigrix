# Migration Plan: Python Prototype → Node Zigrix

> Repository structure note: Node/TypeScript is now the root implementation. Python source lives under `legacy-python/` as the migration reference.

## 목적
현재 Python 구현을 어떻게 취급할지 경계를 명확히 한다.

## 원칙
- Python 구현은 **reference prototype**로 동결
- 새 기능은 Node에 우선 구현
- Node parity가 확보되기 전까지 Python은 삭제하지 않음

## Python에서 유지할 것
- command surface 참고
- state/evidence/event file format 참고
- 테스트 시나리오 참고

## Python에서 버릴 것
- 최종 제품 언어라는 전제
- 새 설정 기능의 본 구현
- 본체 배포 artefact 역할

## parity milestone
1. config get/schema/validate
2. init with path setup
3. agent add/include/exclude
4. rule get/set/edit/validate/render
5. task create/list/status
6. worker prepare/register/complete
7. evidence collect/merge
8. report render
9. stale handling
10. pipeline run

## 삭제 기준
아래가 충족되면 Python prototype 삭제 검토 가능:
- Node command surface parity 달성
- Node tests + build + release smoke 통과
- docs가 Node 기준으로 정렬됨
