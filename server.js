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

var wss = new WebSocketServer({server: server});
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

// Receiving new data and pushing it to connected clients
app.post("/match", function(req, res) {
   matchData = req.body.newMatchData;

   if (clients !== undefined) { // if at least one client is connected
      wss.broadcast(JSON.stringify(matchData));
   }

   res.writeHead(200, {"Content-Type": "text/plain"});
   res.write("Received match details (" + matchData + ")");
   res.end(); 
});

// Client connection
wss.on('connection', function(client) {
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

wss.broadcast = function(data) {
    for(var i in this.clients) {
        this.clients[i].send(data);
    }
};


