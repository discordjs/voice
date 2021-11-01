<div align="center">
	<br />
	<p>
		<a href="https://discord.js.org"><img src="https://discord.js.org/static/logo.svg" width="546" alt="discord.js" /></a>
	</p>
	<br />
		<p>
		<a href="https://discord.gg/djs"><img src="https://img.shields.io/discord/222078108977594368?color=5865F2&logo=discord&logoColor=white" alt="Discord server" /></a>
		<a href="https://www.npmjs.com/package/@discordjs/voice"><img src="https://img.shields.io/npm/v/@discordjs/voice.svg?maxAge=3600" alt="npm version" /></a>
		<a href="https://www.npmjs.com/package/@discordjs/voice"><img src="https://img.shields.io/npm/dt/@discordjs/voice.svg?maxAge=3600" alt="npm downloads" /></a>
		<a href="https://github.com/discordjs/voice/actions"><img src="https://github.com/discordjs/voice/workflows/Tests/badge.svg" alt="Build status" /></a>
		<a href="https://codecov.io/gh/discordjs/voice"><img src="https://codecov.io/gh/discordjs/voice/branch/main/graph/badge.svg" alt="Code coverage" /></a>
		<a href="https://www.patreon.com/discordjs"><img src="https://img.shields.io/badge/donate-patreon-F96854.svg" alt="Patreon" /></a>
	</p>
</div>

## About

An implementation of the Discord Voice API for Node.js, written in TypeScript.

**Features:**

- Send and receive* audio in Discord voice-based channels
- A strong focus on reliability and predictable behaviour
- Horizontal scalability and libraries other than [discord.js](https://discord.js.org/) are supported with custom adapters
- A robust audio processing system that can handle a wide range of audio sources

\**Audio receive is not documented by Discord so stable support is not guaranteed*

## Installation

**Node.js 16.0.0 or newer is required.**

```sh-session
npm install @discordjs/voice
yarn add @discordjs/voice
pnpm add @discordjs/voice
```

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

## Links

- [Website](https://discord.js.org/) ([source](https://github.com/discordjs/website))
- [Documentation](https://discord.js.org/#/docs/voice)
- [Examples](https://github.com/discordjs/voice/tree/main/examples)
- [discord.js Discord server](https://discord.gg/djs)
- [GitHub](https://github.com/discordjs/voice)
- [npm](https://www.npmjs.com/package/@discordjs/voice)

## Contributing

Before creating an issue, please ensure that it hasn't already been reported/suggested, and double-check the
[documentation](https://discord.js.org/#/docs/voice).  
See [the contribution guide](https://github.com/discordjs/voice/blob/main/.github/CONTRIBUTING.md) if you'd like to submit a PR.

## Help

If you don't understand something in the documentation, you are experiencing problems, or you just need a gentle
nudge in the right direction, please don't hesitate to join our official [discord.js Server](https://discord.gg/djs).
