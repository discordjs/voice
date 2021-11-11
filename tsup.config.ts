import type { Options } from 'tsup';

export const tsup: Options = {
	banner: {
		js: 'import path from "path";\nimport { createRequire as topLevelCreateRequire } from "module";\nconst require = topLevelCreateRequire(path.resolve(import.meta.url));\n',
	},
	clean: true,
	dts: true,
	entryPoints: ['src/index.ts'],
	format: ['esm', 'cjs'],
	minify: true,
	skipNodeModulesBundle: true,
	sourcemap: true,
	target: 'es2021',
};
