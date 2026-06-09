
## APK 下载服务 (2026-03-23)
- 下载路径: https://casagrade.com/download/
- 服务器目录: /var/www/lottery-system/download/
- Nginx alias 已配置，APK 直接下载不经过 API

## APP 项目
- 顾客端: ~/lottery-customer-app (Capacitor)
- 老板端: ~/lottery-merchant-app (Capacitor)
- 下载链接: /download/lottery-customer.apk, /download/lottery-merchant.apk

## APK 何时需重打包
- Capacitor 插件变更
- capacitor.config.ts 修改
- @capacitor/android 版本升级

## 代码变更 (2026-03-23)
- merchant.html: _isCapApp bug 修复；设置面板 APP 内隐藏"桌面快捷方式"，Android 改为"📥 Descargar APP"
- index.html: _isCapApp 检测；Android 浏览器下载横幅；iOS 保留添加桌面逻辑
