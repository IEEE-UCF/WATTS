// Monorepo Prettier config. Every workspace inherits this; apps/ieeeucfcom keeps a
// thin re-export of its own so editor tooling resolves it from within the app dir.
export { default } from '@watts/eslint-config/prettier';
