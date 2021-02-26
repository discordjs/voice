import { GatewayVoiceServerUpdateDispatchData, GatewayVoiceStateUpdateDispatchData } from 'discord-api-types/v8';

/**
 * Methods that are provided by the @discordjs/voice library to implementations of
 * Discord gateway DiscordGatewayAdapters.
 */
export interface DiscordGatewayAdapterLibraryMethods {
	onVoiceServerUpdate(data: GatewayVoiceServerUpdateDispatchData): void;
	onVoiceStateUpdate(data: GatewayVoiceStateUpdateDispatchData): void;
}

/**
 * Methods that are provided by the implementer of a Discord gateway DiscordGatewayAdapter.
 */
export interface DiscordGatewayAdapterImplementerMethods {
	sendPayload(payload: any): void;
	destroy?(): void;
}

export type DiscordGatewayAdapterCreator = (
	methods: DiscordGatewayAdapterLibraryMethods,
) => DiscordGatewayAdapterImplementerMethods;
