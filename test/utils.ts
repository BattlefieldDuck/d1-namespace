import { expect } from "vitest";

async function readStream(stream: ReadableStream) {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
    }

    // Combine all chunks
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
    }

    return merged;
}

async function expectReadableStreamsEqual(
    stream1: ReadableStream,
    stream2: ReadableStream
) {
    // Read both streams fully
    const kvBytes = await readStream(stream1);
    const d1Bytes = await readStream(stream2);

    // Compare binary contents
    expect(kvBytes.byteLength).toBe(d1Bytes.byteLength);
    expect(Array.from(kvBytes)).toStrictEqual(Array.from(d1Bytes));
}

export async function expectEqual<T>([kvResult, d1Result]: Awaited<T>[]) {
    expect(kvResult, "results should match between KV and D1").toStrictEqual(d1Result);

    if (kvResult instanceof ArrayBuffer && d1Result instanceof ArrayBuffer) {
        expect(kvResult.byteLength).toBe(d1Result.byteLength);
        expect(new Uint8Array(kvResult)).toStrictEqual(new Uint8Array(d1Result));
    } else if (kvResult instanceof ReadableStream && d1Result instanceof ReadableStream) {
        await expectReadableStreamsEqual(kvResult, d1Result);
    }
}
