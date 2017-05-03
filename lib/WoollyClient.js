const ioClient = require('socket.io-client')
const jiff = require('jiff')

class WoollyClient {
  constructor (uri, onChange) {
    let match = uri.match(/^(https?:\/\/[^/]+)(.*)$/)
    this.uri = uri // match[1] + "/";
    this.path = match[2]
    this.onChange = onChange
    this.state = null
  }

  connect () {
    if (this.socket) return

    let socket = (this.socket = ioClient(this.uri))

    socket.on('error', err => {
      console.error(err)
    })

    socket.on('init', state => {
      this.state = state
      this.onChange(state)
    })

    socket.on('change', patch => {
      this.state = jiff.patch(patch, this.state)
      this.onChange(this.state)
    })

    this.socket = socket
    return this
  }

  disconnect (cb) {
    if (!this.socket) return

    this.socket.once('disconnect', () => {
      // this.socket.removeAllListeners()
      this.socket = null
      setTimeout(() => {
        cb()
      }, 0)
    })
    this.socket.disconnect()
    return this
  }

  do (action, params = {}) {
    this.socket.emit('a-' + action, params)
  }
}

module.exports = (uri, onChange) => {
  let client = new WoollyClient(uri, onChange)

  return client.connect()
}
