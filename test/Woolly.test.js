const test = require('tape')

test.onFinish(() => process.exit()) // takes a while for the server to tear itself down

const WoollyServer = require('..').WoollyServer
const WoollyClient = require('..').WoollyClient

const tearDown = (client, server, cb) => {
  client.disconnect(
    err => (err ? cb(err) : setTimeout(() => server.close(cb), 50))
  )
}

const buildCountingHandler = (count = 0) => ({
  route: '/count',
  getState: () => count,
  actions: {
    inc: () => ++count
  }
})

test('Woolly - can be installed onto a server', t => {
  const app = require('express')()
  const server = app.listen(3000)
  let w = WoollyServer(server)

  t.equal(typeof w, 'object', 'factory builds objects')
  t.equal(typeof w.handler, 'function', 'should have handle method')

  server.close(t.end)
})

test('Woolly - registering a handler is doable', t => {
  const app = require('express')()
  const server = app.listen(3000)
  let w = WoollyServer()

  let result = w.handler(buildCountingHandler())

  t.equal(result, w, 'handler should be chainable')

  server.close(t.end)
})

test('Woolly - actions sent to server get processed', t => {
  const app = require('express')()
  const server = app.listen(3000)

  let w = WoollyServer(server)
  w.handler(buildCountingHandler())

  let calls = 0
  let client = WoollyClient('http://localhost:3000/count/', state => {
    t.equal(state, [0, 1][calls++], 'expected change content')
    if (calls === 2) tearDown(client, server, t.end)
  })

  client.do('inc')
})

test('Woolly - handlers pass params to their view and actions', t => {
  const app = require('express')()
  const server = app.listen(3000)

  let w = WoollyServer(server)

  let client = WoollyClient('http://localhost:3000/foo/bar', state => {
    t.deepEqual(state, {param1: 'foo', param2: 'bar'})
  })

  let result = w.handler('/:param1/:param2', params => params, {
    check: params => {
      t.deepEqual(params, {param1: 'foo', param2: 'bar', x: 10})
      tearDown(client, server, t.end)
    }
  })

  client.do('check', {x: 10})
})

test('Woolly - active server can be connected to', t => {
  const app = require('express')()
  const server = app.listen(3000)

  let w = WoollyServer(server)

  let result = w.handler('/a', () => ['A'], {})

  let client = WoollyClient('http://localhost:3000/a/', state => {
    t.deepEqual(state, ['A'], 'received correct state in change callback')
    tearDown(client, server, t.end)
  })
})

test('Woolly - handler can be configured using an object', t => {
  const app = require('express')()
  const server = app.listen(3000)

  let w = WoollyServer(server)

  let result = w.handler(buildCountingHandler())

  let calls = 0
  let client = WoollyClient('http://localhost:3000/count/', state => {
    t.deepEqual(state, [0, 1][calls++], 'expected state content')
    if (calls === 2) tearDown(client, server, t.end)
  })

  client.do('inc')
})

test('Woolly - actions can return values', t => {
  const app = require('express')()
  const server = app.listen(3000)

  let w = WoollyServer(server)

  let result = w.handler(buildCountingHandler())

  let calls = 0
  let client = WoollyClient('http://localhost:3000/count/', state => {
    t.deepEqual(state, [0, 1][calls++], 'expected state content')
    if (calls === 2) tearDown(client, server, t.end)
  })

  client.do('inc').then(count => {
    t.equal(count, 1, 'response was available from action')
  })
})

test('Woolly - actions can reject', t => {
  const app = require('express')()
  const server = app.listen(3000)

  let w = WoollyServer(server)

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
  let client = WoollyClient('http://localhost:3000/test/', state => {})

  client.do('tick').catch(err => {
    t.ok(err instanceof Error)
    t.equal(err.message, 'what!?', 'message on error should be passed through')
    tearDown(client, server, t.end)
  })
})
