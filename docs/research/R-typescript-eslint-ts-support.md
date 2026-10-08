---
topic: typescript-eslint does not support TypeScript 7
status: VERIFIED
checked: 2026-10-08
recheck_after: 2026-12-07
source: 'computed locally: npm view typescript-eslint@8.71.1 peerDependencies'
tags: [research, tooling]
---

## Fact

typescript-eslint 8.71.1 declares `typescript: ">=4.8.4 <6.1.0"`, while the npm `latest` tag for TypeScript is 7.0.2. The repo therefore pins `typescript ~6.0.3`.

## How it was checked

`npm view typescript-eslint@8.71.1 peerDependencies` and `npm view typescript dist-tags`.

## Used by

- [[ADR-0017-toolchain-version-pins|ADR-0017]]
