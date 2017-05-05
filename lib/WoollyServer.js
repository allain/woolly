const EventEmitter = require('events')
const {diff, patch} = require('dffptch')
const debug = require('debug')('woolly:server')

const FLUSH_INTERVAL = 100

class WoollyServer extends EventEmitter {
  constructor (servers) {
    super()

    servers = [].concat(servers)

    this.dios = servers.map(server =>
      require('dynamic.io')(server, {
        serveClient: false,
        path: '/woolly',
        transports: ['websocket', 'polling']
      })
    )
  }

  handler (route, getState, actions) {
    if (typeof getState === 'undefined' && typeof route === 'object') {
      getState = route.getState
      actions = route.actions
      route = route.route
    } else {
      actions = actions || {}
    }

    let namespaceRegex = new RegExp(
      `^${route.replace(/\/:[^\/]+/g, '/([^/]+)')}/?$`
    )

    let parseRoute = routeParser(route)

    this.dios.forEach(dio =>
      dio.setupNamespace(namespaceRegex, (nsp, match) => {
        debug('setting up namespace %s', match[0])
        const routeParams = parseRoute(match[0])
        let state = invokeAsync(getState, routeParams)

        // After  3 seconds of having no clients, the namespace should be torn down
        nsp.retirement = 3 * 1000

        let lastPatch = 0
        let lastChange = 0
        let patching = false
        let flushIntervalId = setInterval(() => {
          if (lastPatch !== lastChange && !patching) pushStatePatch()
        }, FLUSH_INTERVAL)

        function pushStatePatch () {
          patching = true
          lastPatch = lastChange

          state
            .then(oldState => {
              // replace old state promise
              state = invokeAsync(getState, routeParams)
              return state.then(newState => {
                if (typeof newState === 'object') {
                  let d = diff(oldState, newState)
                  if (Object.keys(d)) {
                    debug('emitting patch %j', d)
                    nsp.emit('change', d)
                  }
                } else if (
                  JSON.stringify(newState) !== JSON.stringify(oldState)
                ) {
                  nsp.emit('change', newState)
                }
                patching = false
              })
            })
            .catch(err => {
              debug('Error while patching %s', err.message, err)
              patching = false
            })
        }

        nsp.expire(() => {
          debug('tearing down namespace %s', match[0])
          clearInterval(flushIntervalId)
          flushIntervalId = null

          state = null
        })

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
            socket.on(`a-${action}`, (params, cb) => {
              const actionParams = Object.assign({}, params, routeParams)
              invokeAsync(handler, actionParams)
                .then(result => {
                  cb(null, result)
                  lastChange = Date.now()
                })
                .catch(err => {
                  cb(err instanceof Error ? err.message : err)
                })
            })
          }
        })
      })
    )

    return this
  }

  close () {
    this.dios.forEach(dio => dio.disconnect())
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
