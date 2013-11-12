/**
 * Setting up the server
 */
var WebSocketServer = require('ws').Server,
  http = require('http'),
  express = require('express'),
  _ = require('underscore'),
  app = express(),
  request = require('request'),
  port = process.env.PORT || 5000;

app.use(express.static(__dirname + '/'));
app.enable('trust proxy');

app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.send(500, 'Something broke!');
});

app.use(express.bodyParser());

var server = http.createServer(app);
server.listen(port);

console.log('HTTP server listening on port %d', port);

// Infrastructure and security settings
var allowedIPaddressesThatCanPushMatchData;  // Do not initialise it if you want to allow all IPs
var applicationBaseUrl; // ie. 'http://localhost:5000'
var hubAddress = 'http://www.cjihrig.com/development/php/hello_form.php';

// Initiate the server
var webSocketServer = new WebSocketServer({
  server: server
});
console.log('WebSocket server created, allowing incoming match data from ' + JSON.stringify(allowedIPaddressesThatCanPushMatchData));

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
  var ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;

  if (allowedIPaddressesThatCanPushMatchData && _.indexOf(allowedIPaddressesThatCanPushMatchData, ip) === -1) {
    console.warn('Unknown server (%s) tried to post match data', ip);
    res.writeHead(403, {
      'Content-Type': 'text/plain'
    }); 
    res.shouldKeepAlive = false;
    res.write('You are not allowed to post data to this server\n');
    res.end();
    return;
  }

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
  res.write('Received new match details ' + newMatchData + ' for match id ' + matchId + '\n');
  res.end();
});

/**
 * Handling clients connections
 */
webSocketServer.on('connection', function (webSocketClient) {
  consoleLogNewConnection(webSocketClient);

  var origin = webSocketClient.upgradeReq.headers['origin'];

  if (applicationBaseUrl && origin && origin !== applicationBaseUrl) {
    console.warn('[TERMINATED] WebSocket connection attempt from and unknown origin %s', origin);
    return;
  }

  var matchId = webSocketClient.upgradeReq.url.substring(1);

  if (!matchId || !isNumber(matchId)) {
    console.warn('[CLOSED] Bad match id (%s) is requested, closing the socket connection', matchId);
    webSocketClient.terminate();
    return;
  }

  var currentMatchData = matchData[matchId];

  if(!currentMatchData) {
    // We don't wait for this to complete before opening the connection
    boardcastMatchRequestMessageToHubAsync(matchId, function(val){
        boardcastMatchRequestMessageToHubSync(val);
    });
  }

  var requestedMatchsCurrentClients = matchClients[matchId];
  if (!requestedMatchsCurrentClients) { // this is the first client requesting this match
    requestedMatchsCurrentClients = [];
  }

  // add the new client to current clients
  requestedMatchsCurrentClients.push(webSocketClient);
  matchClients[matchId] = requestedMatchsCurrentClients;

  consoleLogMatchClients();

  // send current match data to the new client
  if (currentMatchData) {
    webSocketClient.send(JSON.stringify('Curent match data: ' + currentMatchData), function (error) {
      if(error) {
        console.error('Error when sending data to client on match ' + matchId + '. The error is: ' + error);
      }
    });
  }

  /**
   * Handle leaving clients
   */
  webSocketClient.on('close', function () {
    // remove the client from matches he's watching
    removeClientFromMatchClients(this);
    consoleLogLeavingClientEvent();
  });

  /**
   * Handle errors
   */
  webSocketClient.on('error', function (e) {
    console.error('Client error: %s', e.message);
  });
});

function boardcastMatchRequestMessageToHubAsync(val, callback){
  process.nextTick(function() {
      callback(val);
  });
};

function boardcastMatchRequestMessageToHubSync(matchId) {
    console.log('Requested match (id: %s) does not exist, broadcasting a match request', matchId);

    request({
      uri: hubAddress,
      method: 'POST',
      form: {
        matchId: matchId
      }
    }, function(error, response, body) {
      if (!error && response.statusCode == 200) {
        console.log('Successfully broadcasted match (id: %s) request message to %s, the response is %s', 
          matchId, hubAddress, body); 
      } else {
        console.error('Can not broadcast match request message to Hub. Response: @s, Error: @s', 
          response.statusCode, error);
      }
    });
}

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
    console.error('Cant remove item %s from array %s because of type mismatch', item, array);
  }
}

function isNumber(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

