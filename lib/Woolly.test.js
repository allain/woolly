const WoollyServer = require('..').WoollyServer
const WoollyClient = require('..').WoollyClient

const buildCountingHandler = (count = 0) => ({
  route: '/count',
  getState: () => count,
  actions: {
    inc: () => ++count
  }
})

describe('Woolly', () => {
  let client
  let client2
  let httpServer

  afterEach(done => {
    function tearDownClient (client, cb) {
      if (!client) return cb()

      client.disconnect(cb)
      client = null
    }

    function tearDownServer (cb) {
      if (!httpServer) return cb()

      setTimeout(() => {
        httpServer.close(cb)
        httpServer = null
      }, 50)
    }

    tearDownClient(client, err => {
      if (err) console.error(err)
      tearDownClient(client2, err => {
        if (err) console.error(err)
        tearDownServer(done)
      })
    })
  })

  it('can be installed onto a server', done => {
    const app = require('express')()
    httpServer = app.listen(3000)
    let w = WoollyServer(httpServer)

    expect(typeof w).toEqual('object')
    expect(typeof w.handler).toEqual('function')

    done()
  })

  it('supports registering a handler', done => {
    const app = require('express')()
    httpServer = app.listen(3000)
    let w = WoollyServer()

    let result = w.handler(buildCountingHandler())

    expect(result).toBe(w) // should be chainable

    done()
  })

  it('handlers pass params to getState and actions', done => {
    const app = require('express')()
    httpServer = app.listen(3000)

    let w = WoollyServer(httpServer)

    client = WoollyClient('http://localhost:3000/foo/bar', state => {
      expect(state).toEqual({ param1: 'foo', param2: 'bar' })
    })

    w.handler('/:param1/:param2', params => params, {
      check: params => {
        expect(params).toEqual({ param1: 'foo', param2: 'bar', x: 10 })
        done()
      }
    })

    client.on('ready', () => {
      client.actions.check({ x: 10 }).catch(done)
    })
  })

  it('active server can be connected to', done => {
    const app = require('express')()
    httpServer = app.listen(3000)

    let w = WoollyServer(httpServer)

    let result = w.handler('/a', () => ['A'], {})

    client = WoollyClient('http://localhost:3000/a/', state => {
      expect(state).toEqual(['A'])
      done()
    })
  })

  it('handler can be configured using an object', done => {
    const app = require('express')()
    httpServer = app.listen(3000)

    let w = WoollyServer(httpServer)

    let result = w.handler(buildCountingHandler())

    let calls = 0
    client = WoollyClient('http://localhost:3000/count/', state => {
      expect(state).toEqual([0, 1][calls++])
      if (calls === 2) done()
    })

    client.do('inc')
  })

  it('actions can return values', done => {
    const app = require('express')()
    httpServer = app.listen(3000)

    let w = WoollyServer(httpServer)

    let result = w.handler(buildCountingHandler())

    let calls = 0
    client = WoollyClient('http://localhost:3000/count/', state => {
      expect(state).toEqual([0, 1][calls++])
      if (calls === 2) done()
    })

    client.do('inc').then(count => {
      expect(count).toEqual(1)
    })
  })

  test('Woolly - actions can reject', done => {
    const app = require('express')()
    httpServer = app.listen(3000)

    let w = WoollyServer(httpServer)

    let count = 0
    let result = w.handler({
      route: '/test',
      getState: () => null,
      actions: {
        tick: () => {
          throw new Error('what!?')
        }
      }
    })

    let calls = 0
    client = WoollyClient('http://localhost:3000/test/', state => {})

    client.do('tick').catch(err => {
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toEqual('what!?')
      done()
    })
  })

  it('client has event emitter ducktype', () => {
    client = WoollyClient('http://localhost:3000/test/', state => {})
    expect(typeof client.on).toEqual('function')
    expect(typeof client.off).toEqual('function')
    expect(typeof client.once).toEqual('function')
    expect(typeof client.emit).toEqual('function')
  })

  it('client emits error event when unable to connect', done => {
    client = WoollyClient('http://localhost:3000/test/', state => {})
    client.on('error', err => {
      expect(err).toBeInstanceOf(Error)
      done()
    })
  })

  it('client emits ready event after initialized', done => {
    const app = require('express')()
    httpServer = app.listen(3000)

    let w = WoollyServer(httpServer).handler(buildCountingHandler())

    let calls = 0
    client = WoollyClient('http://localhost:3000/count', state => {})
    client.on('ready', ({ state, actions }) => {
      expect(state).toEqual(0)
      expect(Object.keys(actions)).toEqual(['inc'])
      expect(actions.inc).toBeInstanceOf(Function)
      done()
    })
  })

  it('receives complete state when connected', async done => {
    const app = require('express')()
    
    httpServer = app.listen(3000)

    let w = WoollyServer(httpServer).handler(buildCountingHandler())

    client = WoollyClient('http://localhost:3000/count', state => {})
    client.on('ready', async ({ state, actions }) => {
      await actions.inc()
      await actions.inc()

      client.disconnect(() => connectClient2())
    })

    async function connectClient2 () {
      client2 = WoollyClient('http://localhost:3000/count', state => {
        expect(state).toEqual(2)
      })

      client2.on('ready', async ({ state, actions }) => {
        expect(state).toEqual(2)

        setTimeout(() => {
          done()
        }, 500)
      })
    }
  })
})
