/**
 * Setting up the server
 */
var WebSocketServer = require('ws').Server,
  http = require('http'),
  express = require('express'),
  _ = require('underscore'),
  app = express(),
  port = process.env.PORT || 5000;

app.use(express.static(__dirname + '/'));

app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.send(500, 'Something broke!');
});

app.use(express.bodyParser());

var server = http.createServer(app);
server.listen(port);

console.log('HTTP server listening on port %d', port);

var webSocketServer = new WebSocketServer({
  server: server
});
console.log('WebSocket server created');

/**
 * Data models that hold match -> matchdata, and match -> clients data
 */
var matchData = {};
var matchClients = {};

/**
 * Receiving new match data and pushing it to clients who are connected to that match's stream
 */
app.post('/match/:id', function (req, res) {
  var matchId = req.params.id;
  var newMatchData = req.body.newMatchData;

  console.log('Received match details (%s) for match id (%s)', newMatchData, matchId);

  matchData[matchId] = newMatchData;

  /**
   * Braodcast the new match data to clients watching it
   */
  var clientsWatchingThisMatch = matchClients[matchId];

  if (clientsWatchingThisMatch) {
    for (var i = 0; i < clientsWatchingThisMatch.length; i++) {
      var watchingClient = clientsWatchingThisMatch[i];

      watchingClient.send(JSON.stringify(newMatchData));
    }
  }

  consoleLogMatch();

  res.writeHead(200, {
    'Content-Type': 'text/plain'
  });
  res.write('Received new match details ' + newMatchData + ' for match id ' + newMatchData);
  res.end();
});

/**
 * Handling clients requesting a specific match data
 */
webSocketServer.on('connection', function (webSocketClient) {
  consoleLogNewConnection(webSocketClient);

  var matchId = webSocketClient.upgradeReq.url.substring(1);

  var requestedMatchsCurrentClients = matchClients[matchId];
  if (!requestedMatchsCurrentClients) { // this is the first client requesting this match
    requestedMatchsCurrentClients = [];
  }

  // add the new client to current clients
  requestedMatchsCurrentClients.push(webSocketClient);
  matchClients[matchId] = requestedMatchsCurrentClients;

  consoleLogMatchClients();

  // send current match data to the new client
  if (matchData[matchId]) {
    webSocketClient.send(JSON.stringify('Curent match data: ' + matchData[matchId]), function () {});
  }

  /**
   * Handle leaving clients
   */
  webSocketClient.on('close', function () {
    // remove the client from matches he's watching
    removeClientFromMatchClients(this);
    consoleLogLeavingClientEvent();
  });
});

function removeClientFromMatchClients(leavingClient) {
  for (var matchId in matchClients) {

    var clientsWatchingThisMatch = matchClients[matchId];

    for (var i = 0; i < clientsWatchingThisMatch.length; i++) {
      var client = clientsWatchingThisMatch[i]

      if (client === leavingClient) {
        removeFromArray(clientsWatchingThisMatch, client);
        console.log('Removed the leaving client from MatchClients object');

        if (clientsWatchingThisMatch.length == 0) { // delete the match from MatchClients completely
          delete matchClients[matchId];
        }
      }
    }
  }
}

function consoleLogNewConnection(webSocketClient) {
  console.log('[OPEN] WebSocket connection');
  console.log('Requested match id: ' + webSocketClient.upgradeReq.url.substring(1));
  console.log('WebSocket connections size: ' + webSocketServer.clients.length);
}

function consoleLogLeavingClientEvent() {
  console.log('[CLOSED] WebSocket connection');
  console.log('WebSocket connections size: ' + webSocketServer.clients.length);
  consoleLogMatchClients();
}

function consoleLogMatch() {
  console.log('Current Match object:');
  console.log(JSON.stringify(matchData, null, 4));
}

function consoleLogMatchClients() {
  console.log('Current Match clients:');
  console.log(matchClients);
}

function removeFromArray(arr, item) {
  for (var i = arr.length; i--;) {
    if (arr[i] === item) {
      arr.splice(i, 1);
    }
  }
}