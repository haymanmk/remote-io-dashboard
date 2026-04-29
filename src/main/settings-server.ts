import http from 'node:http'

export interface DeviceConfig {
  host: string
  portOffset: number
  autoConnect: boolean
}

const SCHEMA_JSON = JSON.stringify({
  type: 'object',
  required: ['host'],
  properties: {
    host: { type: 'string', title: 'Device IP', default: '192.168.1.10' },
    portOffset: { type: 'integer', title: 'Port Offset', description: 'Effective TCP port = 8500 + offset', default: 0, minimum: 0, maximum: 65035 },
    autoConnect: { type: 'boolean', title: 'Auto-connect', description: 'Connect to the device automatically on launch and after disconnects so background alerts continue to fire.', default: false },
  },
})

/**
 * Start an HTTP server implementing the NodalCore Connect-protocol paths
 * for NodalSettings (ReadSettings / WriteSettings / GetSchema).
 *
 * Returns the port it bound to. The caller should print
 * `NODALCORE_READY <port>` after this resolves.
 */
export function startSettingsServer(
  config: DeviceConfig,
  onConfigChange: (updated: Partial<DeviceConfig>) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405).end()
        return
      }

      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        try {
          const body: Record<string, unknown> = chunks.length
            ? (JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>)
            : {}

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          const url = req.url ?? ''

          if (url.endsWith('/ReadSettings')) {
            res.end(JSON.stringify({
              settings: {
                entries: {
                  host: { string_value: config.host },
                  portOffset: { number_value: config.portOffset },
                  autoConnect: { bool_value: config.autoConnect },
                },
              },
            }))
          } else if (url.endsWith('/WriteSettings')) {
            const entries = (body.settings as Record<string, unknown> | undefined)?.entries as Record<string, Record<string, unknown>> | undefined
            if (entries) {
              const partial: Partial<DeviceConfig> = {}
              if (typeof entries['host']?.['string_value'] === 'string') {
                partial.host = entries['host']['string_value'] as string
                config.host = partial.host
              }
              if (typeof entries['portOffset']?.['number_value'] === 'number') {
                partial.portOffset = entries['portOffset']['number_value'] as number
                config.portOffset = partial.portOffset
              }
              if (typeof entries['autoConnect']?.['bool_value'] === 'boolean') {
                partial.autoConnect = entries['autoConnect']['bool_value'] as boolean
                config.autoConnect = partial.autoConnect
              }
              if (Object.keys(partial).length > 0) onConfigChange(partial)
            }
            res.end(JSON.stringify({ success: true, message: '' }))
          } else if (url.endsWith('/GetSchema')) {
            res.end(JSON.stringify({ schema_json: SCHEMA_JSON }))
          } else {
            res.writeHead(404).end(JSON.stringify({ error: 'Not found' }))
          }
        } catch (err) {
          res.writeHead(500).end(JSON.stringify({ error: String(err) }))
        }
      })
    })

    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      resolve(addr.port)
    })
  })
}
