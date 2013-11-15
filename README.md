# Node.js Websocket Server [ ![Codeship Status for denizozger/node-websocket](https://www.codeship.io/projects/f23cd630-2d5e-0131-ef60-2e2c57662156/status?branch=master)](https://www.codeship.io/projects/9341)

This node application perioducally receives JSON data from another web application, and serves it to clients connected to it.

Uses the [einaros/ws](http://einaros.github.io/ws/) WebSockets implementation, and is built on [Heroku's template](https://github.com/heroku-examples/node-ws-test).

# Running Locally

``` bash
npm install
foreman start
```

## How it works

1. A client connects to the application. ie. ws://node-websocket/some-key
2. App checks if it has some-key's data on memory
3. If some-key's data is on memory already, it serves it to connected client
4. If some-key's data is not found, then requests it with a HTTP POST from a specific server [node-fetcher](https://github.com/denizozger/node-fetcher)
5. Waits to receive data for some-key with a HTTP POST endpoint. When data is received, transmits it to clients who are connected via some-key.

![Schema](http://i39.tinypic.com/2hnrght.png)

Please see [node-fetcher](https://github.com/denizozger/node-fetcher) and [node-dataprovider](https://github.com/denizozger/node-dataprovider) implementations too. You can either set these up on your local, or use the deployed apps running on Heroku.

Pushing some match data to node server (for the server to transmit data to connected clients via Web Sockets):
``` bash
curl -X POST --data "newResourceData={id: 2, data: "Lorem", version: 5}" http://localhost:5000/broadcast/some-key
```

Go to [localhost:5000/?some-key](localhost:5000/?some-key) to see the most recent data, and get updates when the node server receives/forwards 
  new data. Node server can receive data on any number of keys and clients can monitor those keys on different browser tabs.

# Running on Heroku

``` bash
heroku create
heroku labs:enable websockets
git push heroku master
heroku open
```


[![Bitdeli Badge](https://d2weczhvl823v0.cloudfront.net/denizozger/node-websocket/trend.png)](https://bitdeli.com/free "Bitdeli Badge")
 
