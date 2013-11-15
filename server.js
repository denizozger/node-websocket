/**
 * Setting up the server
 */
var WebSocketServer = require('ws').Server,
  http = require('http'),
  express = require('express'),
  _ = require('underscore'),
  app = express(),
  request = require('request'),
  async = require('async'),
  port = process.env.PORT || 5000;

app.use(express.static(__dirname + '/'));
app.enable('trust proxy');

app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.send(500, 'Internal server error');
});

app.use(express.json());
app.use(express.urlencoded());

var server = http.createServer(app);
server.listen(port);

console.log('HTTP server listening on port %d', port);

// Infrastructure and security settings
var applicationBaseUrl; // ie. 'http://localhost:5000'
const fetcherAddress = process.env.FETCHER_ADDRESS || 'http://node-fetcher.herokuapp.com/fetchlist/new/';
const authorizationHeaderKey = 'bm9kZS1mZXRjaGVy';
const nodeFetcherAuthorizationHeaderKey = 'bm9kZS13ZWJzb2NrZXQ=';

// Initiate the server
var webSocketServer = new WebSocketServer({
  server: server
});

/**
 * Data models that hold resource -> resourcedata, and resource -> clients data
 */
var resourceData = {};
var resourceClients = {};

/**
 * Receiving new resource data and pushing it to clients who are connected to that resource's stream.
 * This method processes a basic HTTP post with form data sumitted as JSON.
 * Form data should contain resource data.
 */
app.post('/broadcast/?*', function (req, res) {

  // Security
  if (req.header('Authorization') !== authorizationHeaderKey) {
    var ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;

    console.warn('Unknown server (%s) tried to post resource data', ip);

    res.writeHead(403, {
      'Content-Type': 'text/plain'
    }); 
    res.shouldKeepAlive = false;
    res.write('You are not allowed to get data from this server\n');
    res.end();
    return;
  }

  var resourceId = req.params[0];
  var newResourceData = req.body.newResourceData;

  console.log('Received resource details (%s) for resource id (%s)', newResourceData, resourceId);
  
  resourceData[resourceId] = newResourceData;

  /**
   * Braodcast the new resource data to clients watching it
   */
  var clientsWatchingThisResource = resourceClients[resourceId];

  broadcastMessageToClientsWatchingThisResourceAsync(clientsWatchingThisResource, newResourceData);

  consoleLogResource();

  res.writeHead(200, {
    'Content-Type': 'text/plain'
  });
  res.write('Received new resource details ' + newResourceData + ' for resource id ' + resourceId + '\n');
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

  var resourceId = webSocketClient.upgradeReq.url.substring(1);

  if (!resourceId) {
    console.warn('[CLOSED] Bad resource id (%s) is requested, closing the socket connection', resourceId);
    webSocketClient.terminate();
    return;
  }

  var currentResourceData = resourceData[resourceId];

  if(!currentResourceData) {
    // We don't wait for this to complete before opening the connection
    boardcastResourceRequestMessageToFetcherAsync(resourceId, function(val){
        boardcastResourceRequestMessageToFetcherSync(val);
    });
  }

  var requestedResourcesCurrentClients = resourceClients[resourceId];
  if (!requestedResourcesCurrentClients) { // this is the first client requesting this resource
    requestedResourcesCurrentClients = [];
  }

  // add the new client to current clients
  requestedResourcesCurrentClients.push(webSocketClient);
  resourceClients[resourceId] = requestedResourcesCurrentClients;

  consoleLogResourceClients();

  // send current resource data to the new client
  if (currentResourceData) {
    webSocketClient.send(JSON.stringify('Curent resource data: ' + currentResourceData), function (error) {
      if(error) {
        console.error('Error when sending data to client on resource ' + resourceId + '. The error is: ' + error);
      }
    });
  }

  /**
   * Handle leaving clients
   */
  webSocketClient.on('close', function () {
    // remove the client from resources he's watching
    removeClientFromResourceClients(this);
    consoleLogLeavingClientEvent();
  });

  /**
   * Handle errors
   */
  webSocketClient.on('error', function (e) {
    console.error('Client error: %s', e.message);
  });
});

function boardcastResourceRequestMessageToFetcherAsync(val, callback){
  if (val) {
    process.nextTick(function() {
        callback(val);
        return;
    });  
  }
};

function boardcastResourceRequestMessageToFetcherSync(resourceId) {
    console.log('Requested resource (id: %s) does not exist, broadcasting a resource request', resourceId);

    request({
      uri: fetcherAddress + resourceId,
      method: 'GET',
      form: {
        resourceId: resourceId
      },
      headers: {
        Authorization: nodeFetcherAuthorizationHeaderKey
      }
    }, function(error, response, body) {
      if (!error && response.statusCode == 200) {
        console.log('Successfully broadcasted resource (id: %s) request message to %s, the response is %s', 
          resourceId, fetcherAddress, body); 
      } else {
        console.error('Can not broadcast resource request message to Fetcher (): %s', fetcherAddress + resourceId, error);
      }
    });
}

function broadcastMessageToClientsWatchingThisResourceAsync(clientsWatchingThisResource, newResourceData) {
  if (clientsWatchingThisResource && newResourceData) {
    async.forEach(clientsWatchingThisResource, function(watchingClient){
        if (_.isObject(watchingClient)) {
          watchingClient.send(JSON.stringify(newResourceData));  
        } else {
          console.error('Cant send new resource data to watching client - watching client is not an object');
        }   
    },
    function(err){
      console.error('Cant broadcast resource data to watching client:', err)  
    });
  } else {
    console.error('No clients watching this resource (%s) or no new resource data (%s)', 
      clientsWatchingThisResource, newResourceData);
  }
}

function removeClientFromResourceClients(leavingClient) {
  if (_.isObject(leavingClient) && resourceClients) {
    for (var resourceId in resourceClients) {
      
      if(resourceClients.hasOwnProperty(resourceId)){
        var clientsWatchingThisResource = resourceClients[resourceId];

        if (_.isArray(clientsWatchingThisResource)) {
          for (var i = 0; i < clientsWatchingThisResource.length; i++) {
            var client = clientsWatchingThisResource[i];

            if (client && client === leavingClient) {
              removeFromArray(clientsWatchingThisResource, client);
              console.log('Removed the leaving client from ResourceClients object');

              // If this was the last client watching this resource, remove the resource from ResourceClients and ResourceData
              if (clientsWatchingThisResource.length === 0) { 
                console.log('This was the last client watching this resource, removing the resource from memory');
                delete resourceClients[resourceId];
                delete resourceData[resourceId];
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
    console.log('Requested resource id: ' + webSocketClient.upgradeReq.url.substring(1));
    console.log('WebSocket connections size: ' + webSocketServer.clients.length);
  } else {
    console.error('New WebSocketClient is not passed as a parameter');
  }
}

function consoleLogLeavingClientEvent() {
  console.log('[CLOSED] WebSocket connection');
  console.log('WebSocket connections size: ' + webSocketServer.clients.length);
  consoleLogResourceClients();
}

function consoleLogResource() {
  console.log('Current Resource object:');
  console.log(JSON.stringify(resourceData, null, 4));
}

function consoleLogResourceClients() {
  console.log('Current Resource clients:');
  console.log(resourceClients);
}

function removeFromArray(array, item) {
  if (_.isArray(array) && _.isObject(item)) {
    for (var i = array.length; i--;) {
      if (array[i] === item) {
        array.splice(i, 1);
      }
    }
  } else {
    console.error('Cant remove item %s from array %s because of type misresource', item, array);
  }
}
