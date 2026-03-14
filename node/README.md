# Zigrix Node Bootstrap

이 디렉토리는 Zigrix의 **Node/TypeScript 전환용 bootstrap 구현체**다.

현재 범위:
- config-first CLI skeleton
- config load / validate / schema / get
- interactive-free init (`zigrix-node init --yes`)
- minimal sequential workflow runner
- local JSON run persistence / inspect

예시:

```bash
npm install
npm run build
node dist/index.js config validate
node dist/index.js init --yes
node dist/index.js run examples/hello-workflow.json
```
