const enc = new TextEncoder();
const dec = new TextDecoder();

export function base64Encode(value: string): string {
    const bytes = enc.encode(value);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
}

export function base64Decode(encoded: string): string {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return dec.decode(bytes);
}

export async function readStream(value: ReadableStream): Promise<Uint8Array> {
    const reader = value.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    for (; ;) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        chunks.push(chunk);
        total += chunk.byteLength;
    }

    const out = new Uint8Array(total);
    let off = 0;

    for (const c of chunks) {
        out.set(c, off);
        off += c.byteLength;
    }

    return out;
}
