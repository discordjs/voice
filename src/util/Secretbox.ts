const libs = {
	sodium: (sodium: any) => ({
		open: sodium.api.crypto_secretbox_open_easy,
		close: sodium.api.crypto_secretbox_easy,
		random: (n: any, buffer?: Buffer) => {
			if (!buffer) buffer = Buffer.allocUnsafe(n);
			sodium.api.randombytes_buf(buffer);
			return buffer;
		},
	}),
	'libsodium-wrappers': (sodium: any) => ({
		open: sodium.crypto_secretbox_open_easy,
		close: sodium.crypto_secretbox_easy,
		random: (n: any) => sodium.randombytes_buf(n),
	}),
	tweetnacl: (tweetnacl: any) => ({
		open: tweetnacl.secretbox.open,
		close: tweetnacl.secretbox,
		random: (n: any) => tweetnacl.randomBytes(n),
	}),
};

const fallbackError = () => {
	throw new Error(
		`Cannot play audio as no valid encryption package is installed.
- Install sodium, libsodium-wrappers, or tweetnacl.
- Use the generateDependencyReport() function for more information.\n`,
	);
};

const methods: Record<any, any> = {
	open: fallbackError,
	close: fallbackError,
	random: fallbackError,
};

void (async () => {
	for (const libName of Object.keys(libs)) {
		try {
			// eslint-disable-next-line
			const lib = require(libName);
			if (libName === 'libsodium-wrappers' && lib.ready) await lib.ready; // eslint-disable-line no-await-in-loop
			Object.assign(methods, (libs as any)[libName](lib));
			break;
		} catch {} // eslint-disable-line no-empty
	}
})();

export { methods };
