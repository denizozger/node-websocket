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

var matchData;
var matches = {};

// Receiving new data and pushing it to connected clients
app.post("/match/:id", function(req, res) {
   var matchId = req.params.id;
   matchData = req.body.newMatchData;

   console.log("Received match details (%s) for match id (%s)", matchData, matchId);

   matches[matchId] = matchData;

   webSocketServer.broadcast(JSON.stringify(matchData));

   consoleLogMatch();

   res.writeHead(200, {"Content-Type": "text/plain"});
   res.write("Received match details " + matchData + " for match id " + matchData);
   res.end();
});

// Client connection
webSocketServer.on('connection', function(webSocketClient) {
    console.log('New WebSocket connection'); 

    var matchId = webSocketClient.upgradeReq.url.substring(1);

    console.log('Requested match id: ' + matchId);
    console.log('WebSocket connections size: ' + webSocketServer.clients.length);

    webSocketClient.send(JSON.stringify('Some initial data'), function() { });

    webSocketClient.on('close', function() {
        console.log('WebSocket connection closed');
        console.log('WebSocket connections size: ' + webSocketServer.clients.length);
    });
});

webSocketServer.broadcast = function(data) {
    for(var j in webSocketServer.clients) {
        webSocketServer.clients[j].send(data);
    }
};

var consoleLogMatch = function() {
  console.log('Current Match object:');
  console.log(JSON.stringify(matches, null, 4)); 
}

