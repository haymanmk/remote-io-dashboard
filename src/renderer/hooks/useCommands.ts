/** Typed wrappers around window.remoteio.command */
export function useCommands() {
  const cmd = window.remoteio.command

  return {
    readStatus:       ()                                          => cmd('R', 1, null, []),
    readInfo:         ()                                          => cmd('R', 2, null, []),
    readInput:        (pin: number)                              => cmd('R', 3, null, [pin]),
    readAllInputs:    ()                                          => cmd('R', 3, null, [-1]),
    readOutput:       (pin: number)                              => cmd('R', 4, null, [pin]),
    readAllOutputs:   ()                                          => cmd('R', 4, null, [-1]),
    setOutput:        (pin: number, value: 0 | 1)               => cmd('W', 4, null, [pin, value]),
    subscribeInputs:  (...pins: number[])                        => cmd('W', 5, null, pins),
    unsubscribeInputs:(...pins: number[])                        => cmd('W', 6, null, pins),
    sendUart:         (ch: number, payload: string)              => cmd('W', 7, ch,   [payload.length, payload]),
    readLed:          (index: number)                            => cmd('R', 8, null, [index]),
    setLed:           (index: number, r: number, g: number, b: number) => cmd('W', 8, null, [index, r, g, b]),

    // Settings
    readIP:           ()                                          => cmd('R', 101, null, []),
    writeIP:          (a: number, b: number, c: number, d: number) => cmd('W', 101, null, [a, b, c, d]),
    readPortOffset:   ()                                          => cmd('R', 102, null, []),
    writePortOffset:  (offset: number)                           => cmd('W', 102, null, [offset]),
    readNetmask:      ()                                          => cmd('R', 103, null, []),
    writeNetmask:     (a: number, b: number, c: number, d: number) => cmd('W', 103, null, [a, b, c, d]),
    readGateway:      ()                                          => cmd('R', 104, null, []),
    writeGateway:     (a: number, b: number, c: number, d: number) => cmd('W', 104, null, [a, b, c, d]),
    readMAC:          ()                                          => cmd('R', 105, null, []),
    writeMAC:         (a: number, b: number, c: number, d: number, e: number, f: number) =>
                                                                   cmd('W', 105, null, [a, b, c, d, e, f]),
    readUartBaud:     (ch: number)                               => cmd('R', 106, ch,   []),
    writeUartBaud:    (ch: number, baud: number)                 => cmd('W', 106, ch,   [baud]),
  }
}
