const EventEmitter = require('events')
const jiff = require('jiff')
const debug = require('debug')('woolly:server')

const NAMESPACE_WATCH_INTERVAL = 100

class WoollyServer extends EventEmitter {
  constructor (server) {
    super()

    this.dio = require('dynamic.io')(server, {
      serveClient: false,
      transports: ['websocket', 'polling']
    })
  }

  handler (route, viewer, actions = {}) {
    let namespaceRegex = new RegExp(
      `^${route.replace(/\/:[^\/]+/g, '/([^/]+)')}/?$`
    )

    let parseRoute = routeParser(route)

    this.dio.setupNamespace(namespaceRegex, (nsp, match) => {
      const routeParams = parseRoute(match[0])
      let state = invokeAsync(viewer, routeParams)

      // After  3 seconds of having no clients, the namespace should be torn down
      nsp.retirement = 3 * 1000

      let lastPatch = 0
      let lastChange = 0
      let patching = false
      setInterval(() => {
        if (lastPatch === lastChange || patching) return

        patching = true
        lastPatch = lastChange

        state
          .then(oldState => {
            // replace old state promise
            state = invokeAsync(viewer, routeParams)
            return state.then(newState => {
              nsp.emit('change', jiff.diff(oldState, newState))
              patching = false
            })
          })
          .catch(err => {
            debug('Error while patching %s', err.message, err)
            patching = false
          })
      }, NAMESPACE_WATCH_INTERVAL)

      nsp.on('connect', socket => {
        state.then(state => {
          // on first connect send state
          socket.emit('init', state)
        })

        socket.on('disconnect', () => {
          Object.keys(actions).forEach(action => {
            socket.removeAllListeners(`a-${action}`)
          })
        })

        for (let [action, handler] of Object.entries(actions)) {
          socket.on(`a-${action}`, params => {
            const actionParams = Object.assign({}, params, routeParams)
            invokeAsync(handler, actionParams).then(
              () => (lastChange = Date.now())
            )
          })
        }
      })
    })

    return this
  }

  close () {
    this.dio.disconnect()
  }
}

function routeParser (route) {
  let routeParts = route.split('/')
  return path => {
    let pathParts = path.split('/')
    return routeParts.reduce((result, part, index) => {
      if (part[0] === ':') {
        result[part.substr(1)] = pathParts[index]
      }
      return result
    }, {})
  }
}

function invokeAsync (func, params) {
  let result
  try {
    result = func(params)
  } catch (err) {
    return Promise.reject(err)
  }

  return result && result.then ? result : Promise.resolve(result)
}

module.exports = function (server) {
  return new WoollyServer(server)
}
