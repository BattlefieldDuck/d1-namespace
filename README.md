# d1-kv-store

A key-value store library for Cloudflare D1.

## Installation

```bash
npm install d1-kv-store
```

## Usage

```typescript
import { D1KVStore } from 'd1-kv-store';

const store = new D1KVStore();

// Set a value
await store.set('key', 'value');

// Get a value
const value = await store.get('key');

// Delete a key
await store.delete('key');
```

## Development

### Build

```bash
npm run build
```

## License

ISC
