// Stands in for src/inpay and src/testpay in a build without payment code (metro.config.js,
// ADR-0109). Every name it is asked for is a function that renders nothing and returns nothing,
// so `useInAppPayment()` is falsy and the payment screens are empty. Plain JavaScript on purpose:
// Metro loads it directly and TypeScript never sees it.
const nothing = () => null;
module.exports = new Proxy(
  { __esModule: true },
  { get: (target, key) => (key in target ? target[key] : nothing) },
);
