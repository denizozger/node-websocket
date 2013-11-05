var WebSocketServer = require('ws').Server
, http = require('http')
, express = require('express')
, app = express()
, port = process.env.PORT || 5000;

app.use(express.static(__dirname + '/'));

app.use(function(err, req, res, next){
  console.error(err.stack);
  res.send(500, 'Something broke!');
});

app.use(express.bodyParser());

var server = http.createServer(app);
server.listen(port);

console.log('HTTP server listening on port %d', port);

var webSocketServer = new WebSocketServer({server: server});
console.log('WebSocket server created');

var matchData = {};
var matchClients = {};

// Receiving new match data and pushing it to clients who are connected to that match's stream
app.post("/match/:id", function(req, res) {
 var matchId = req.params.id;
 var newMatchData = req.body.newMatchData;

 console.log("Received match details (%s) for match id (%s)", newMatchData, matchId);

 matchData[matchId] = newMatchData;

 var clientsWatchingThisMatch = matchClients[matchId];

 for (var i = 0; i < clientsWatchingThisMatch.length; i++) {
  var watchingClient = clientsWatchingThisMatch[i];

  watchingClient.send(JSON.stringify(newMatchData));
 }

 consoleLogMatch();

 res.writeHead(200, {"Content-Type": "text/plain"});
 res.write("Received match details " + newMatchData + " for match id " + newMatchData);
 res.end();
});

// Handling clients requesting match data
webSocketServer.on('connection', function(webSocketClient) {
  console.log('New WebSocket connection'); 

  var matchId = webSocketClient.upgradeReq.url.substring(1);

  console.log('Requested match id: ' + matchId);
  console.log('WebSocket connections size: ' + webSocketServer.clients.length);


  var requestedMatchsCurrentClients = matchClients[matchId];

    if (requestedMatchsCurrentClients === undefined) { // this is the first client requesting this match
      requestedMatchsCurrentClients = []; 
    } 

    requestedMatchsCurrentClients.push(webSocketClient);

    matchClients[matchId] = requestedMatchsCurrentClients;

    console.log(matchClients);

    webSocketClient.send(JSON.stringify('Curent match data'), function() { });

    webSocketClient.on('close', function() {

      removeClientFromMatchClients(this);

      console.log('WebSocket connection closed');
      console.log('WebSocket connections size: ' + webSocketServer.clients.length);
      console.log('Match clients object:');
      console.log(matchClients);
    });
  });

var consoleLogMatch = function() {
  console.log('Current Match object:');
  console.log(JSON.stringify(matchData, null, 4)); 
}

var removeClientFromMatchClients = function(leavingClient) {
  for(var matchId in matchClients){

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

function removeFromArray(arr, item) {
  for(var i = arr.length; i--;) {
    if(arr[i] === item) {
      arr.splice(i, 1);
    }
  }
}