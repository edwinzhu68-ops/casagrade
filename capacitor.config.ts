import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.casagrade.lottery.merchant',
  appName: 'Lotería Caja',
  webDir: 'www',
  server: {
    // 加载线上老板端页面；更新代码后无需重装 APP，刷新即得新版
    url: 'https://casagrade.com/merchant.html',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#111827',
  },
  plugins: {
    BluetoothLe: {
      // displayStrings 可按需国际化
      displayStrings: {
        scanning: 'Buscando impresora...',
        cancel: 'Cancelar',
        availableDevices: 'Impresoras disponibles',
        noDeviceFound: 'No se encontró impresora',
      },
    },
  },
};

export default config;
