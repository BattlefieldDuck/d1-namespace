// https://github.com/cloudflare/workers-sdk/blob/main/packages/miniflare/src/workers/kv/constants.ts#L3
export const KVLimits = {
	MIN_CACHE_TTL: 60 /* 60s */,
	MAX_LIST_KEYS: 1000,
	MAX_KEY_SIZE: 512 /* 512B */,
	MAX_VALUE_SIZE: 25 * 1024 * 1024 /* 25MiB */,
	MAX_VALUE_SIZE_TEST: 1024 /* 1KiB */,
	MAX_METADATA_SIZE: 1024 /* 1KiB */,
	MAX_BULK_SIZE: 25 * 1024 * 1024 /* 25MiB */,
} as const;
