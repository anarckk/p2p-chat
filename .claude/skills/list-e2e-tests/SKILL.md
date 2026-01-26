---
name: list-e2e
description: 列出项目所有 E2E 测试文件、测试套件和单个测试用例，附带运行命令
argument-hint: [filter]
---

# E2E 测试列表

当前项目包含以下 E2E 测试：

&#33;`cd .claude/skills/list-e2e-tests/scripts && node parse-e2e-tests.mjs $ARGUMENTS`

---

## 使用方式

- `/list-e2e` - 列出所有测试
- `/list-e2e center` - 筛选包含 "center" 的测试文件
- `/list-e2e --json` - 以 JSON 格式输出

## 运行测试

运行单个测试文件：
```bash
npx playwright test e2e/center.spec.ts
```

运行特定测试用例：
```bash
npx playwright test e2e/center.spec.ts -g "测试用例名称"
```

运行所有 E2E 测试：
```bash
npm run test:e2e
```
