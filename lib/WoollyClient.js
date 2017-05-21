const ioClient = require('socket.io-client')
const EventEmitter = require('tiny-emitter')
const patch = require('./patch.js')
const debug = require('debug')('woolly:client')

class WoollyClient extends EventEmitter {
  constructor (uri) {
    super()
    this.uri = uri
    this.state = null
    this.actions = {}
  }

  connect () {
    if (this.socket) return

    let socket = (this.socket = ioClient(this.uri, {
      path: '/woolly'
    }))

    socket.on('connect', () => {
      this.emit('connected')
    })

    socket.on('disconnect', () => {
      this.emit('disconnected')
    })

    socket.on('connect_error', err => {
      this.emit('error', err)
    })

    socket.on('connect_timeout', err => {
      this.emit('error', err)
    })

    socket.on('error', err => {
      this.emit('error', err)
    })

    socket.on('init', ({ state, actions }) => {
      this.state = state
      this.emit('changed', state)

      this.actions = actions.reduce((result, action) => {
        result[action] = params => {
          return this.do(action, params)
        }
        return result
      }, {})

      this.emit('ready', {
        state,
        actions: this.actions
      })
    })

    socket.on('change', delta => {
      if (Array.isArray(delta)) {
        patch(delta, this.state)
      } else {
        this.state = delta
      }
      this.emit('changed', this.state)
    })

    this.socket = socket
    return this
  }

  disconnect (cb) {
    if (!this.socket) return cb()

    const afterDisconnect = () => {
      this.socket.removeAllListeners()
      this.socket = null
      if (cb) setTimeout(() => cb(), 0)
    }

    if (this.socket.id) {
      this.socket.once('disconnect', afterDisconnect)
      this.socket.disconnect()
    } else {
      afterDisconnect()
    }

    return this
  }

  do (action, params = {}) {
    return new Promise((resolve, reject) => {
      this.socket.emit(
        'a-' + action,
        params,
        (err, result) => (err ? reject(new Error(err)) : resolve(result))
      )
    })
  }
}

module.exports = (uri, onChange) => {
  let client = new WoollyClient(uri, onChange)
  client.on('changed', onChange)

  return client.connect()
}
