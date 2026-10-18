/**
 * Archive utilities (agnostic: no Playwright, no domain).
 *
 * Silent-fail by contract: malformed input returns null instead of throwing,
 * so the calling ATC decides how to assert on it.
 */

import { unzipSync } from 'fflate';

/**
 * Extract a ZIP archive into a map of entry path -> UTF-8 text.
 * Directory entries are skipped. Returns null when the bytes are not a valid ZIP.
 */
export function extractArchive(buffer: Uint8Array): Record<string, string> | null {
  try {
    const entries = unzipSync(buffer);
    const decoder = new TextDecoder('utf-8');
    const files: Record<string, string> = {};
    for (const [path, bytes] of Object.entries(entries)) {
      if (path.endsWith('/')) {
        continue;
      }
      files[path] = decoder.decode(bytes);
    }
    return files;
  }
  catch {
    return null;
  }
}
