import { defineConfig } from 'tsup';

export default defineConfig((options) => {
	return {
		banner: {
			js:
				options.format[0] === 'esm'
					? 'import{resolve as requireResolve}from"path";import{createRequire as topLevelCreateRequire}from"module";const require=topLevelCreateRequire(requireResolve(""));'
					: '',
		},
		entryPoints: ['src/index.ts'],
		minify: true,
		skipNodeModulesBundle: true,
		sourcemap: true,
		target: 'es2021',
	};
});
