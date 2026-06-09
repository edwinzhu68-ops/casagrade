import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.casagrade.lottery.customer',
  appName: 'Lotería',
  webDir: 'www',
  server: {
    // 加载线上顾客端页面；更新代码后无需重装 APP，刷新即得新版
    url: 'https://casagrade.com/index.html',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#16a34a',
  },
};

export default config;
