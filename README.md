# Node.js Websocket Test

A tiny demo using the [einaros/ws](http://einaros.github.io/ws/) WebSockets implementation. Built on [Heroku's template](https://github.com/heroku-examples/node-ws-test).

# Running Locally

``` bash
npm install
foreman start
```

# Running on Heroku

``` bash
heroku create
heroku labs:enable websockets
git push heroku master
heroku open
```
