# Node.js Websocket Demo [ ![Codeship Status for denizozger/node-websocket](https://www.codeship.io/projects/f23cd630-2d5e-0131-ef60-2e2c57662156/status?branch=master)](https://www.codeship.io/projects/9341)

A small demo using the [einaros/ws](http://einaros.github.io/ws/) WebSockets implementation, built on [Heroku's template](https://github.com/heroku-examples/node-ws-test).

Running on http://dry-wildwood-3323.herokuapp.com/ and http://node-websocket-match.jit.su/

# Running Locally

``` bash
npm install
foreman start
```

## How it works

This node server receives some match data from another server's Http POSTs, 
  and pushes that information to connected clients who are monitoring that specific match.

Pushing some match data to node server:
``` bash
curl -X POST --data "newMatchData={RefereeName: "Deniz"}" http://localhost:5000/match/1985
```

Go to [localhost:5000/?1985](localhost:5000/?1985) to see the most recent match data, and get updates when the node server receives/forwards 
  new data. Node server can receive data on any number of matches and clients can monitor those matches on different browser tabs.

# Running on Heroku

``` bash
heroku create
heroku labs:enable websockets
git push heroku master
heroku open
```


[![Bitdeli Badge](https://d2weczhvl823v0.cloudfront.net/denizozger/node-websocket/trend.png)](https://bitdeli.com/free "Bitdeli Badge")

