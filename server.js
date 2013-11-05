var webSocketServer = require('ws').Server
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

var webSocketServer = new webSocketServer({server: server});
console.log('WebSocket server created');

var matchData;
var webSocketClients = [];
var matches = {};

// Receiving new data and pushing it to connected webSocketClients
app.post("/match/:id", function(req, res) {
  var matchId = req.params.id;
  matchData = req.body.newMatchData;

  console.log("Received match details (%s) for match id (%s)", matchData, matchId);

  matches[matchId] = matchData;

   if (webSocketClients !== undefined) { // if at least one client is connected
      webSocketServer.broadcast(JSON.stringify(matchData));
   }

   consoleLogMatch();

   res.writeHead(200, {"Content-Type": "text/plain"});
   res.write("Received match details " + matchData + " for match id " + matchData);
   res.end();
});

// Client connection
webSocketServer.on('connection', function(webSocketClient) {
    console.log('WebSocket connection open'); 
    
    webSocketClients.push(webSocketClient);

    console.log('webSocketClients size: ' + webSocketClients.length);

    for(var i in this.webSocketClients) {
        console.log(this.webSocketClients[i]._socket._connecting);
    }
    
    webSocketClient.send(JSON.stringify('Some initial data'), function() { });

    webSocketClient.on('close', function() {
        console.log('WebSocket connection close');
        removeFromArray(webSocketClients, webSocketClient);

        console.log('webSocketClients size: ' + webSocketClients.length);
    });
});

webSocketServer.broadcast = function(data) {
    for(var j in webSocketClients) {
        webSocketClients[j].send(data);
    }
};

function removeFromArray(arr, item) {
    for(var i = arr.length; i--;) {
        if(arr[i] === item) {
            arr.splice(i, 1);
        }
    }
}

var consoleLogMatch = function() {
  console.log('Current Match object:');
  console.log(JSON.stringify(matches, null, 4)); 
}

