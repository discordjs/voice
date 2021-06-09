# @discordjs/voice

<p>
	<a href="https://discord.gg/bRCvFy9"><img src="https://img.shields.io/discord/222078108977594368?color=5865F2&logo=discord&logoColor=white" alt="Discord server" /></a>
	<a href="https://www.npmjs.com/package/@discordjs/voice"><img src="https://img.shields.io/npm/v/@discordjs/voice.svg?maxAge=3600" alt="NPM version" /></a>
	<a href="https://www.npmjs.com/package/@discordjs/voice"><img src="https://img.shields.io/npm/dt/@discordjs/voice.svg?maxAge=3600" alt="NPM downloads" /></a>
	<a href="https://github.com/discordjs/voice/actions"><img src="https://github.com/discordjs/voice/actions/workflows/test.yml/badge.svg" alt="Build status" /></a>
	<a href="https://codecov.io/gh/discordjs/voice"><img src="https://codecov.io/gh/discordjs/voice/branch/main/graph/badge.svg?token=u7oQ23UoxX" alt="Test coverage"/></a>
	<a href="https://www.patreon.com/discordjs"><img src="https://img.shields.io/badge/donate-patreon-F96854.svg" alt="Patreon" /></a>
</p>

## About

An implementation of the Discord Voice API for Node.js, written in TypeScript.

**Features:**

- Send and receive* audio in Discord voice-based channels
- A strong focus on reliability and predictable behaviour
- Horizontal scalability and libraries other than [discord.js](https://discord.js.org/) are supported with custom adapters
- A robust audio processing system that can handle a wide range of audio sources

\**Audio receive is not documented by Discord so stable support is not guaranteed*

**Useful links:**

- [Documentation](https://discordjs.github.io/voice)
- [Examples](https://github.com/discordjs/voice/tree/main/examples)
- [GitHub Discussions](https://github.com/discordjs/voice/discussions)
- [Discord.js Server](https://discord.gg/djs)
- [Repository](https://github.com/discordjs/voice)

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

See [Contributing Guide](https://github.com/discordjs/voice/blob/main/.github/CONTRIBUTING.md).
