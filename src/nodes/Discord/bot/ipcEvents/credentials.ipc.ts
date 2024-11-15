import { Client } from 'discord.js'
import Ipc from 'node-ipc'

import commands from '../commands'
import { addLog, ICredentials, withTimeout } from '../helpers'
import state from '../state'

export default async function (ipc: typeof Ipc, client: Client) {
  ipc.server.on('credentials', (data: ICredentials, socket: any) => {
    try {
      addLog(`credentials state login ${state.login}, ready ${state.ready}`, client)
      if (
        (!state.login && !state.ready) ||
        (state.ready && (state.clientId !== data.clientId || state.token !== data.token))
      ) {
        if (data.token && data.clientId) {
          addLog(`credentials login authenticating`, client)
          state.login = true
          commands(data.token, data.clientId, client).catch((e) => {
            addLog(`${e}`, client)
          })
          withTimeout(client.login(data.token), 3000)
            .then(() => {
              state.ready = true
              state.login = false
              state.clientId = data.clientId
              state.token = data.token
              ipc.server.emit(socket, 'credentials', 'ready')
              addLog(`credentials ready`, client)
            })
            .catch((e) => {
              state.login = false
              ipc.server.emit(socket, 'credentials', 'error')
              addLog(`credentials error - ${e}`, client)
            })
        } else {
          ipc.server.emit(socket, 'credentials', 'missing')
          addLog(`credentials missing`, client)
        }
      } else if (state.login) {
        ipc.server.emit(socket, 'credentials', 'login')
        addLog(`credentials login`, client)
      } else {
        ipc.server.emit(socket, 'credentials', 'already')
      }
    } catch (e) {
      state.login = false
      ipc.server.emit(socket, 'credentials', 'error')
      addLog(`credentials error - ${e}`, client)
    }
  })
}
