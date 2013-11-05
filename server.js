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

var websocketServer = new WebSocketServer({server: server});
console.log('WebSocket server created');

var matchData;
var clients = [];

function removeFromArray(arr, item) {
    for(var i = arr.length; i--;) {
        if(arr[i] === item) {
            arr.splice(i, 1);
        }
    }
}

var matches = {};

// Receiving new data and pushing it to connected clients
app.post("/match/:id", function(req, res) {
  var matchId = req.params.id;
  matchData = req.body.newMatchData;

  console.log("Received match details (%s) for match id (%s)", matchData, matchId);

  matches[matchId] = matchData;

   if (clients !== undefined) { // if at least one client is connected
      websocketServer.broadcast(JSON.stringify(matchData));
   }

   consoleLogMatch();

   res.writeHead(200, {"Content-Type": "text/plain"});
   res.write("Received match details " + matchData + " for match id " + matchData);
   res.end();
});

// Client connection
websocketServer.on('connection', function(client) {
    console.log('WebSocket connection open'); 
    
    clients.push(client);

    console.log('clients size: ' + clients.length);

    for(var i in this.clients) {
        console.log(this.clients[i]._socket._connecting);
    }
    
    client.send(JSON.stringify('Some initial data'), function() { });

    client.on('close', function() {
        console.log('WebSocket connection close');
        removeFromArray(clients, client);

        console.log('clients size: ' + clients.length);
    });
});

websocketServer.broadcast = function(data) {
    for(var i in this.clients) {
        this.clients[i].send(data);
    }
};



var consoleLogMatch = function() {
  console.log('Current Match object:');
  console.log(JSON.stringify(matches, null, 4)); 
}

