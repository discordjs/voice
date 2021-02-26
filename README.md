# @discordjs/voice

<p>
	<a href="https://discord.gg/bRCvFy9"><img src="https://img.shields.io/discord/222078108977594368?color=7289da&logo=discord&logoColor=white" alt="Discord server" /></a>
	<a href="https://www.npmjs.com/package/@discordjs/voice"><img src="https://img.shields.io/npm/v/@discordjs/voice.svg?maxAge=3600" alt="NPM version" /></a>
	<a href="https://www.npmjs.com/package/@discordjs/voice"><img src="https://img.shields.io/npm/dt/@discordjs/voice.svg?maxAge=3600" alt="NPM downloads" /></a>
	<a href="https://github.com/discordjs/voice/actions"><img src="https://github.com/discordjs/voice/workflows/Testing/badge.svg" alt="Build status" /></a>
	<a href="https://www.patreon.com/discordjs"><img src="https://img.shields.io/badge/donate-patreon-F96854.svg" alt="Patreon" /></a>
</p>

> Provides audio streaming functionality to Discord.js

## Status: alpha

> This library is still in development - the API is subject to change!

## Dependencies

This library has several optional dependencies to support a variety
of different platforms. Install one dependency from each of the
categories shown below. The dependencies are listed in order of
preference for performance. If you can't install one of the options,
try installing another.

**Encryption Libraries (npm install):**

- `sodium`: ^3.0.2
- `tweetnacl`: ^1.0.3
- `libsodium-wrappers`: ^0.7.9

**Opus Libraries (npm install):**

- `@discordjs/opus`: ^0.4.0
- `opusscript`: ^0.0.7

**FFmpeg:**

- [`FFmpeg`](https://ffmpeg.org/) (installed and added to environment)
- `ffmpeg-static`: ^4.2.7 (npm install)

## Contribution

See [Contributing Guide](https://github.com/discordjs/voice/blob/master/.github/CONTRIBUTING.md).
