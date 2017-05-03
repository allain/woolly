# woolly

Woolly is a tool that simplifes the sharing of state across clients.

The basic idea comes from an observation that most of the screens I write in my apps can be broken down into:

1. state
2. actions on that state

Given the above, I sought to find the simplest interface that would suffice.

To that end, Woolly has two parts. WoollyClient and WoollyServer.

## Example Usage

### server.js
```js
// Woolly Server
const app = require('express')()
const server = app.listen(3000)

let w = WoollyServer(server)

// This example stores all messages in an in memory map of topicName => [messages...]
let messages = {}

const route = '/topics/:topic'
const getState = ({topic}) => messages[topic] || []
const actions = {
  addMessage: (message) => {
    // Modify the state
    messages[topic] = (messages[topic] || []).concat([message])
  }
}

w.handler(route, getState, actions)
```

### client.js
```js
const WoollyClient = require('woolly/lib/WoollyClient.js')

const client = WoollyClient('/topics/testing', (messages) => {
  //Update the view here
  console.log('topic messages:', messages)
})

client.do('addMessage', {text: `Tick ${new Date()}`})
```

## WoollyServer

### API

#### WoollyServer(server)

Returns a WoollyServer attached to the HTTP server.

#### WoollyServer.handler(route, getState, actions) : WoollyServer

Makes a resource available at the given `route`. When a client connects to it, they start receiving its current state as determined by calling `getState()`

`actions` is a map of action names to handler functions. After  an action is completed, the state is considered updated, and all connected clients will receive a new state.

#### WoollyClient(uri, onChange) : WoollyClient
Generates a WoollyClient and connects it to the uri provided. When a state change occurs, the onChange handler will be called.

#### WoollyClient.do(action, params = {})
Sends a request for the server to perform the action with the provided params (if any)

#### WoollyClient.disconnect()
Disconnects the client from the WoollyServer