#!/usr/bin/env node

/**
 * 解析 E2E 测试文件，提取测试套件和测试用例
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 项目 e2e 目录
const E2E_DIR = join(__dirname, '../../../../e2e');

/**
 * 解析单个测试文件
 */
function parseTestFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const fileName = filePath.split(/[/\\]/).pop();

  const tests = [];

  // 匹配 test.describe 块
  const describeRegex = /test\.describe\(['"`]([^'"`]+)['"`](?:,\s*\(\)\s*=>\s*{)?/g;
  // 匹配 test 块
  const testRegex = /test\s*\(\s*['"`]([^'"`]+)['"`]/g;

  let describeMatch;
  const describes = [];

  while ((describeMatch = describeRegex.exec(content)) !== null) {
    describes.push({
      name: describeMatch[1],
      index: describeMatch.index,
    });
  }

  // 对每个 describe 块，找到其包含的 test
  for (let i = 0; i < describes.length; i++) {
    const describe = describes[i];
    const nextIndex = i + 1 < describes.length ? describes[i + 1].index : content.length;
    const blockContent = content.slice(describe.index, nextIndex);

    const testCases = [];
    let testMatch;

    while ((testMatch = testRegex.exec(blockContent)) !== null) {
      testCases.push({
        name: testMatch[1],
        command: `npx playwright test ${fileName} -g "${testMatch[1]}"`,
      });
    }

    tests.push({
      suite: describe.name,
      tests: testCases,
    });
  }

  // 如果没有 describe，直接找 test
  if (describes.length === 0) {
    const testCases = [];
    let testMatch;
    while ((testMatch = testRegex.exec(content)) !== null) {
      testCases.push({
        name: testMatch[1],
        command: `npx playwright test ${fileName} -g "${testMatch[1]}"`,
      });
    }
    if (testCases.length > 0) {
      tests.push({
        suite: '(无分组)',
        tests: testCases,
      });
    }
  }

  return {
    file: fileName,
    suites: tests,
    fileCommand: `npx playwright test ${fileName}`,
  };
}

/**
 * 获取所有测试文件
 */
function getAllTests() {
  const files = readdirSync(E2E_DIR).filter((f) => f.endsWith('.spec.ts'));

  const results = [];

  for (const file of files) {
    const filePath = join(E2E_DIR, file);
    try {
      const parsed = parseTestFile(filePath);
      results.push(parsed);
    } catch (error) {
      console.error(`解析文件 ${file} 失败:`, error.message);
    }
  }

  return results;
}

/**
 * 格式化输出
 */
function formatOutput(tests, format = 'text') {
  if (format === 'json') {
    console.log(JSON.stringify(tests, null, 2));
    return;
  }

  // 文本格式
  for (const testFile of tests) {
    console.log(`\n📄 ${testFile.file}`);
    console.log(`   运行: ${testFile.fileCommand}`);
    console.log(`   ─────────────────────────────────────`);

    for (const suite of testFile.suites) {
      console.log(`\n   📋 ${suite.suite}`);
      for (const testCase of suite.tests) {
        console.log(`      • ${testCase.name}`);
        console.log(`        命令: ${testCase.command}`);
      }
    }
  }
  console.log();
}

// CLI 入口
const args = process.argv.slice(2);
const format = args.includes('--json') ? 'json' : 'text';
const filter = args.find((a) => !a.startsWith('--'));

const allTests = getAllTests();

if (filter) {
  const filtered = allTests.filter((t) => t.file.includes(filter));
  formatOutput(filtered, format);
} else {
  formatOutput(allTests, format);
}
