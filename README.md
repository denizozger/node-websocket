# Node.js Websocket Demo

A small demo using the [einaros/ws](http://einaros.github.io/ws/) WebSockets implementation. Built on [Heroku's template](https://github.com/heroku-examples/node-ws-test).

# Running Locally

``` bash
npm install
foreman start
```

## How it works

This node server receives some match data from another server, and pushes that information to connected clients who are 'watching' that match.

Pushing some match data to the server:
``` bash
curl -X POST --data "newMatchData={RefereeName: "Deniz"}" http://localhost:5000/match/1985
```

Go to localhost:5000/?1985 to see the most recent data, and get updates when server receives new data. 
You can post data to any number of matches and monitor their data from different browser tabs.

# Running on Heroku

``` bash
heroku create
heroku labs:enable websockets
git push heroku master
heroku open
```
