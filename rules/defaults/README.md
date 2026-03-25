# Zigrix Rule Templates

이 폴더는 Zigrix 오케스트레이션용 기본 규칙 템플릿 모음이다.

## 구성
- `pro-zig.md` — orchestrator 역할 규칙 템플릿
- `worker-common.md` — 모든 워커 공통 규칙
- `front-zig.md` — frontend 워커 규칙
- `back-zig.md` — backend 워커 규칙
- `sys-zig.md` — system 워커 규칙
- `sec-zig.md` — security 워커 규칙
- `qa-zig.md` — qa 워커 규칙

> 파일명은 기본 번들 호환성을 위해 유지하지만,
> 실제 선택/검증은 agentId 고정이 아닌 **role-based routing**을 우선한다.
