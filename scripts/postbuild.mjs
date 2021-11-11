import shell from 'shelljs';

shell
	.ShellString(
		'import path from "path";\nimport { createRequire as topLevelCreateRequire } from "module";\nconst require = topLevelCreateRequire(path.resolve(import.meta.url));\n',
	)
	.cat('dist/index.mjs')
	.to('dist/index.mjs');
