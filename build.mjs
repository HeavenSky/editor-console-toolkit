import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** 扩展宿主是 CJS, 因此必须 bundle 成 cjs 才能被 require. */
const extensionOptions = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  logLevel: 'info',
  entryPoints: ['src/extension.ts'],
  outfile: 'out/extension.js',
  sourcemap: !production,
  minify: production
};

if (watch) {
  const context = await esbuild.context(extensionOptions);
  await context.watch();
} else {
  await esbuild.build(extensionOptions);
}
