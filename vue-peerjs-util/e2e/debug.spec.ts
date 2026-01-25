import { test, expect } from '@playwright/test';

test.describe('页面诊断测试', () => {
  test('检查页面基本状态', async ({ page }) => {
    // 监听所有控制台消息
    const consoleLogs: string[] = [];
    const errors: string[] = [];

    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', (error) => {
      errors.push(error.toString());
    });

    // 访问页面
    await page.goto('/wechat', { timeout: 10000 });

    // 等待页面加载
    await page.waitForTimeout(2000);

    // 获取页面内容
    const bodyText = await page.locator('body').textContent();
    console.log('页面内容:', bodyText?.substring(0, 200));

    // 检查是否有 #app
    const appElement = await page.locator('#app').count();
    console.log('#app 元素数量:', appElement);

    // 检查路由视图
    const routerView = await page.locator('router-view').count();
    console.log('router-view 元素数量:', routerView);

    // 打印所有控制台日志
    console.log('\n=== 控制台日志 ===');
    consoleLogs.forEach(log => console.log(log));

    // 打印所有错误
    if (errors.length > 0) {
      console.log('\n=== 错误 ===');
      errors.forEach(err => console.error(err));
    } else {
      console.log('\n没有捕获到错误');
    }

    // 检查页面标题
    const title = await page.title();
    console.log('页面标题:', title);

    // 截图
    await page.screenshot({ path: 'test-results/screenshot.png' });
    console.log('截图已保存到 test-results/screenshot.png');
  });

  test('检查 DOM 结构', async ({ page }) => {
    await page.goto('/wechat', { timeout: 10000 });

    await page.waitForTimeout(2000);

    // 检查关键元素
    const elements = {
      '#app': await page.locator('#app').count(),
      '.header': await page.locator('.header').count(),
      '.logo': await page.locator('.logo').count(),
      '.menu': await page.locator('.menu').count(),
      '.ant-menu': await page.locator('.ant-menu').count(),
      '.wechat-container': await page.locator('.wechat-container').count(),
      '.contacts-panel': await page.locator('.contacts-panel').count(),
      '.chat-panel': await page.locator('.chat-panel').count(),
    };

    console.log('\n=== DOM 元素检查 ===');
    Object.entries(elements).forEach(([selector, count]) => {
      console.log(`${selector}: ${count}`);
    });

    // 获取 HTML 片段
    const bodyHTML = await page.locator('body').innerHTML();
    console.log('\n=== HTML 片段（前500字符）===');
    console.log(bodyHTML.substring(0, 500));
  });
});
