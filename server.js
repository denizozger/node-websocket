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
 * Receiving new match data and pushing it to clients who are connected to that match's stream.
 * This method processes a basic HTTP post with form data sumitted as JSON.
 * Form data should contain match data.
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

  broadcastMessageToClientsWatchingThisMatch(clientsWatchingThisMatch, newMatchData);

  consoleLogMatch();

  res.writeHead(200, {
    'Content-Type': 'text/plain'
  });
  res.write('Received new match details ' + newMatchData + ' for match id ' + matchId);
  res.end();
});

/**
 * Handling clients connections
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

function broadcastMessageToClientsWatchingThisMatch(clientsWatchingThisMatch, newMatchData) {
  if (clientsWatchingThisMatch && newMatchData) {
    for (var i = 0; i < clientsWatchingThisMatch.length; i++) {
      var watchingClient = clientsWatchingThisMatch[i];

      if (_.isObject(watchingClient)) {
        watchingClient.send(JSON.stringify(newMatchData));  
      } else {
        console.error('Cant send new match data to watching client');
      }      
    }
  }
}

function removeClientFromMatchClients(leavingClient) {

  if (_.isObject(leavingClient) && matchClients) {
    for (var matchId in matchClients) {
      
      if(matchClients.hasOwnProperty(matchId)){
        var clientsWatchingThisMatch = matchClients[matchId];

        if (_.isArray(clientsWatchingThisMatch)) {
          for (var i = 0; i < clientsWatchingThisMatch.length; i++) {
            var client = clientsWatchingThisMatch[i];

            if (client && client === leavingClient) {
              removeFromArray(clientsWatchingThisMatch, client);
              console.log('Removed the leaving client from MatchClients object');

              if (clientsWatchingThisMatch.length === 0) { // delete the match from MatchClients completely
                delete matchClients[matchId];
              }
            }
          }
        }  
      }
    }
  } else {
    console.error('Leaving WebSocketClient is not passed as a parameter'); 
  }
}

function consoleLogNewConnection(webSocketClient) {
  if (_.isObject(webSocketClient)) {
    console.log('[OPEN] WebSocket connection');
    console.log('Requested match id: ' + webSocketClient.upgradeReq.url.substring(1));
    console.log('WebSocket connections size: ' + webSocketServer.clients.length);
  } else {
    console.error('New WebSocketClient is not passed as a parameter');
  }
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

function removeFromArray(array, item) {
  if (_.isArray(array) && _.isObject(item)) {
    for (var i = array.length; i--;) {
      if (array[i] === item) {
        array.splice(i, 1);
      }
    }
  } else {
    console.error('Cant remove item ' + item + ' from array ' + array + '  because of type mismatch');
  }
}




