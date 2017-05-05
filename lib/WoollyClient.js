const ioClient = require('socket.io-client')
const {diff, patch} = require('dffptch')

class WoollyClient {
  constructor (uri, onChange) {
    this.uri = uri
    this.onChange = onChange
    this.state = null
  }

  connect () {
    if (this.socket) return

    let socket = (this.socket = ioClient(this.uri, {
      path: '/woolly'
    }))

    socket.on('error', err => {
      console.error(err)
    })

    socket.on('init', state => {
      this.state = state
      this.onChange(state)
    })

    socket.on('change', delta => {
      if (typeof delta === 'object') {
        patch(this.state, delta)
      } else {
        this.state = delta
      }
      this.onChange(this.state)
    })

    this.socket = socket
    return this
  }

  disconnect (cb) {
    if (!this.socket) return

    this.socket.once('disconnect', () => {
      this.socket.removeAllListeners()
      this.socket = null
      if (cb) setTimeout(() => cb(), 0)
    })
    this.socket.disconnect()
    return this
  }

  do (action, params = {}) {
    return new Promise((resolve, reject) => {
      this.socket.emit('a-' + action, params, (err, result) => {
        err ? reject(new Error(err)) : resolve(result)
      })
    })
  }
}

module.exports = (uri, onChange) => {
  let client = new WoollyClient(uri, onChange)

  return client.connect()
}
