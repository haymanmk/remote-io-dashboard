// Types and helpers for the Remote IO text protocol (commands terminated by \r\n)

export type CommandType = 'R' | 'W'

export type ParsedReply =
  | { kind: 'read';       id: number; variant: number | null; values: string[] }
  | { kind: 'write';      id: number }
  | { kind: 'event-input'; pin: number; state: boolean }
  | { kind: 'event-uart'; channel: number; payload: string }
  | { kind: 'error';      code: number }
  | { kind: 'unknown';    raw: string }

/**
 * Build a command string to send to the device.
 * @example buildCommand('R', 3, null, -1)  → "R3 -1\r\n"
 * @example buildCommand('W', 4, null, 3, 1) → "W4 3 1\r\n"
 * @example buildCommand('W', 7, 0, 5, 'hello') → "W7.0 5 hello\r\n"
 */
export function buildCommand(
  type: CommandType,
  id: number,
  variant: number | null,
  ...params: (string | number)[]
): string {
  const idStr = variant !== null ? `${id}.${variant}` : `${id}`
  const paramStr = params.length > 0 ? ` ${params.join(' ')}` : ''
  return `${type}${idStr}${paramStr}\r\n`
}

/**
 * Compute the reply prefix we expect for a given command.
 * Write commands always reply as W<id> (variant dropped).
 * Read commands reply as R<id>[.<variant>].
 */
export function expectedReplyPrefix(
  type: CommandType,
  id: number,
  variant: number | null,
): string {
  if (type === 'W') return `W${id}`
  if (variant !== null) return `R${id}.${variant}`
  return `R${id}`
}

/**
 * Parse one line (without trailing \r\n) from the device.
 */
export function parseReply(line: string): ParsedReply {
  // Async: input subscription event  "S5 <pin> <state>"
  if (line.startsWith('S5 ')) {
    const parts = line.split(' ')
    return { kind: 'event-input', pin: parseInt(parts[1]), state: parts[2] === '1' }
  }

  // Async: UART data received  "R7.<uart> <payload>"
  if (/^R7\.\d/.test(line)) {
    const spaceIdx = line.indexOf(' ')
    const channel = parseInt(line.slice(3, spaceIdx))
    const payload = line.slice(spaceIdx + 1)
    return { kind: 'event-uart', channel, payload }
  }

  // Error reply  "ERR<code>"
  if (line.startsWith('ERR')) {
    return { kind: 'error', code: parseInt(line.slice(3)) }
  }

  // Write reply  "W<id>[.<variant>] OK"
  if (line.startsWith('W')) {
    const spaceIdx = line.indexOf(' ')
    const idPart = spaceIdx >= 0 ? line.slice(1, spaceIdx) : line.slice(1)
    const dotIdx = idPart.indexOf('.')
    const id = parseInt(dotIdx >= 0 ? idPart.slice(0, dotIdx) : idPart)
    return { kind: 'write', id }
  }

  // Read reply  "R<id>[.<variant>] <values...>"
  if (line.startsWith('R')) {
    const spaceIdx = line.indexOf(' ')
    if (spaceIdx < 0) return { kind: 'unknown', raw: line }
    const idPart = line.slice(1, spaceIdx)
    const dotIdx = idPart.indexOf('.')
    const id = parseInt(dotIdx >= 0 ? idPart.slice(0, dotIdx) : idPart)
    const variant = dotIdx >= 0 ? parseInt(idPart.slice(dotIdx + 1)) : null
    const values = line.slice(spaceIdx + 1).split(' ')
    return { kind: 'read', id, variant, values }
  }

  return { kind: 'unknown', raw: line }
}

/** Parse a 16-bit bitfield reply (from R3 -1 or R4 -1) into a boolean array (index 0 = pin 1). */
export function parseBitfield(values: string[]): boolean[] {
  const n = parseInt(values[0] ?? '0')
  return Array.from({ length: 16 }, (_, i) => Boolean((n >> i) & 1))
}
