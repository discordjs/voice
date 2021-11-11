import shell from 'shelljs';

shell
	.ShellString('import { createRequire } from "module";const require = createRequire(import.meta.url);')
	.cat('dist/index.mjs')
	.to('dist/index.mjs');
