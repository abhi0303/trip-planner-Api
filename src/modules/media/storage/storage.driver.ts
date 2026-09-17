/**
 * Storage abstraction.
 *
 * The rest of the app never touches a storage SDK — it works off the `Media`
 * row, which holds the key and the resolved URL. Swapping providers therefore
 * means writing one class, not touching trips, posts or photos.
 */
export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export abstract class StorageDriver {
  /** Writes the object and returns the URL clients should load it from. */
  abstract put(input: PutObjectInput): Promise<string>;

  /** Removes the object. Must not throw when the object is already gone. */
  abstract delete(key: string): Promise<void>;

  /** Resolves a stored key to a URL, without a round trip where possible. */
  abstract urlFor(key: string): string;

  /** Human-readable driver name, surfaced by /health. */
  abstract readonly name: string;
}
