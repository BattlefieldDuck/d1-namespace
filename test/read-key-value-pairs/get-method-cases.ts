export const singleKeyCases = [
    { key: "KEY", type: "text", value: () => "123456789" },
    { key: "KEY", type: "json", value: () => JSON.stringify({ number: 12345 }) },
    { key: "KEY", type: "arrayBuffer", value: () => new Uint8Array([0xff, 0x00, 0x01, 0xab]).buffer },
    { key: "KEY", type: "stream", value: () => new Blob(["123456789"]).stream() },
    { key: "KEY_DOES_NOT_EXIST", type: "text", value: null },
    { key: "KEY_DOES_NOT_EXIST", type: "json", value: null },
    { key: "KEY_DOES_NOT_EXIST", type: "arrayBuffer", value: null },
    { key: "KEY_DOES_NOT_EXIST", type: "stream", value: null },
];

export const multipleKeysCases = [
    { putKeys: ["KEY1", "KEY2", "KEY3"], keys: ["KEY1", "KEY2", "KEY3"], type: "text", value: (i: number) => `value${i + 1}` },
    { putKeys: ["KEY1", "KEY2", "KEY3"], keys: ["KEY1", "KEY2", "KEY3"], type: "json", value: (i: number) => JSON.stringify({ number: i + 1 }) },
    { putKeys: ["KEY1", "KEY2", "KEY3"], keys: ["KEY1", "KEY2", "KEY_DOES_NOT_EXIST"], type: "text", value: (i: number) => `value${i + 1}` },
    { putKeys: ["KEY1", "KEY2", "KEY3"], keys: ["KEY1", "KEY2", "KEY_DOES_NOT_EXIST"], type: "json", value: (i: number) => JSON.stringify({ number: i + 1 }) },
];
