// Retired: /auth/me now requires a real database user. Use password login instead.
console.error('请先调用 POST /auth/signup 注册，再通过 POST /auth/login 获取 accessToken。');
console.error('本脚本不再生成 local-dev-user 测试 Token。详见 docs/auth-step-3.md。');
process.exitCode = 1;
