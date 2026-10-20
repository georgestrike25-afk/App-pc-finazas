import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ar.finanzas.personales',
  appName: 'Finanzas Personales',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Permite sincronizar con la PC por la red local (http://192.168.x.x).
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
