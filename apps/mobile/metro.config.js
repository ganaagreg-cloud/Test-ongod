// Sentry's Metro config adds debug ids to the bundle so crash reports can be matched with the
// uploaded source maps. It wraps Expo's default config, which already handles the monorepo.
// Metro loads this file as CommonJS, so `require` is required here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

const config = getSentryExpoConfig(__dirname);

// ADR-0109: the store build has NO payment code. Unless EXPO_PUBLIC_PAYMENTS_CODE=true, every
// import of src/inpay or src/testpay from outside those folders resolves to a stub that renders
// nothing and answers "payments off", so the screens, their texts and their API calls are not in
// the bundle and no server setting can turn them on. The default is off; turn it on only for a
// test build or the reviewed update that brings in-app payments back.
if (process.env.EXPO_PUBLIC_PAYMENTS_CODE !== 'true') {
  const stub = path.join(__dirname, 'src', 'payments-off.js');
  const insidePayments = (file) => /[\\/]src[\\/](inpay|testpay)[\\/]/.test(file ?? '');
  const defaultResolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (
      /(^|[\\/])(inpay|testpay)[\\/]/.test(moduleName) &&
      !insidePayments(context.originModulePath)
    ) {
      return { type: 'sourceFile', filePath: stub };
    }
    return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
  };
}

module.exports = config;
