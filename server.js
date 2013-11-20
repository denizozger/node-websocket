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
  
var webSocketServer = new WebSocketServer({
  server: server
});

// Infrastructure and security settings
var applicationBaseUrl; // ie. 'http://localhost:5000'
const fetcherAddress = process.env.FETCHER_ADDRESS || 'http://node-fetcher.herokuapp.com/fetchlist/new/';
const authorizationHeaderKey = 'bm9kZS1mZXRjaGVy';
const nodeFetcherAuthorizationHeaderKey = 'bm9kZS13ZWJzb2NrZXQ=';

/**
 * Data models that hold resource -> resourcedata, and resource -> observers data
 */
var resourceData = {};
var resourceObservers = {};

/**
 * Public Endpoints
 */

webSocketServer.on('connection', function (webSocketClient) {
  handleNewClientConnection(webSocketClient); 
});

app.post('/broadcast/?*', function (req, res) {
  // Security
  if (!isThisHTTPRequestAllowedToPostData(req)) {
    res.writeHead(403, {
      'Content-Type': 'text/plain'
    }); 
    res.shouldKeepAlive = false;
    res.end();
    return;
  }

  var resourceId = req.params[0];
  var newResourceData = req.body.newResourceData;

  handleReceivedResourceData(resourceId, newResourceData);

  // Send success to data fetcher
  res.writeHead(200, {
    'Content-Type': 'text/plain'
  });
  res.end();
});

/**
 *  Internal business logic implementation
 */

function handleNewClientConnection(webSocketClient) {
  consoleLogNewConnection(webSocketClient);

  var origin = webSocketClient.upgradeReq.headers.origin;
  var resourceId = webSocketClient.upgradeReq.url.substring(1);

  if (!isValidConnection) {
    webSocketClient.terminate();
    return;
  }

  addClientAsAnObserverToThisResource(resourceId, webSocketClient);

  var existingResourceData = resourceData[resourceId];

  if (existingResourceData) {
    sendResourceDataToObserver(webSocketClient);
  } else {
    requestResourceFromFetcherAsync(resourceId, function(val){
        requestResourceFromFetcherSync(val);
    });
  }
}

function addClientAsAnObserverToThisResource(resourceId, webSocketClient) {
  var requestedResourcesCurrentObservers = resourceObservers[resourceId];

  if (!requestedResourcesCurrentObservers) { // this is the first observer requesting this resource
    requestedResourcesCurrentObservers = [];
  }

   // add the new observer to current observers
  requestedResourcesCurrentObservers.push(webSocketClient);
  resourceObservers[resourceId] = requestedResourcesCurrentObservers;
  consoleLogResourceObservers();

  // Actions to take when client leaves
  webSocketClient.on('close', function () {
    removeObserverFromResourceObservers(this);
    consoleLogLeavingObserverEvent();
  });

  webSocketClient.on('error', function (e) {
    console.error('Client error: %s', e.message);
  });
}

function requestResourceFromFetcherAsync(val, callback){
  if (val) {
    process.nextTick(function() {
        callback(val);
        return;
    });  
  }
}

function requestResourceFromFetcherSync(resourceId) {
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
        console.log('Successfully requested resource (id: %s) from %s, the response is %s', 
          resourceId, fetcherAddress, body); 
      } else {
        console.error('Can not request resource from Fetcher (%s):', fetcherAddress + resourceId, error);
      }
    });
}

function sendResourceDataToObserver(webSocketClient) {
  webSocketClient.send(JSON.stringify('Curent resource data: ' + existingResourceData), function (error) {
    if(error) {
      console.error('Error when sending data to observer on resource ' + resourceId + '. The error is: ' + error);
    }
  }); 
}

/**
 * Receiving new resource data and pushing it to observers who are connected to that resource's stream.
 * This method processes a basic HTTP post with form data sumitted as JSON.
 * Form data should contain resource data.
 */
function handleReceivedResourceData(resourceId, newResourceData) {
  console.log('Received resource details (%s) for resource id (%s)', newResourceData, resourceId);
  
  // store new data
  resourceData[resourceId] = newResourceData;

  // notify observers
  var observersWatchingThisResource = resourceObservers[resourceId];
  broadcastMessageToObserversWatchingThisResourceAsync(observersWatchingThisResource, newResourceData);

  consoleLogResource();
}  

function broadcastMessageToObserversWatchingThisResourceAsync(observersWatchingThisResource, newResourceData) {
  if (observersWatchingThisResource && newResourceData) {
    async.forEach(observersWatchingThisResource, function(watchingClient){
        if (_.isObject(watchingClient)) {
          watchingClient.send(JSON.stringify(newResourceData));  
        } else {
          console.error('Cant send new resource data to watching observer - watching observer is not an object');
        }   
    },
    function(err){
      console.error('Cant broadcast resource data to watching observer:', err);  
    });
  } else {
    console.error('No observers watching this resource (%s) or no new resource data (%s)', 
      observersWatchingThisResource, newResourceData);
  }
}

function removeObserverFromResourceObservers(leavingClient) {
  if (_.isObject(leavingClient) && resourceObservers) {
    for (var resourceId in resourceObservers) {
      
      if(resourceObservers.hasOwnProperty(resourceId)){
        var observersWatchingThisResource = resourceObservers[resourceId];

        if (_.isArray(observersWatchingThisResource)) {
          for (var i = 0; i < observersWatchingThisResource.length; i++) {
            var observer = observersWatchingThisResource[i];

            if (observer && observer === leavingClient) {
              observersWatchingThisResource.splice(i, 1);
              console.log('Removed the leaving observer from ResourceClients object');

              // If this was the last observer watching this resource, remove the resource from ResourceClients and ResourceData
              if (observersWatchingThisResource.length === 0) { 
                console.log('This was the last observer watching this resource, removing the resource from memory');
                delete resourceObservers[resourceId];
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

function isThisHTTPRequestAllowedToPostData(req) {
  if (req.header('Authorization') !== authorizationHeaderKey) {
    var ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;

    console.warn('Unknown server (%s) tried to post resource data', ip);
    return false;
  }
  return true;
}

function isValidConnection(origin, resourceId) {
  if (!isOriginAllowed(origin)) {
    console.warn('[UNKNOWN CLIENT ORIGIN] WebSocket connection attempt from and unknown origin %s', origin);
    return false;
  }
  
  if (!resourceId) {
    console.warn('[BAD REQUEST] Bad resource id (%s) is requested, closing the socket connection', resourceId);
    return false;
  }

  return true;
}

function isOriginAllowed(origin) {
  return !(applicationBaseUrl && origin && origin !== applicationBaseUrl);
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

function consoleLogLeavingObserverEvent() {
  console.log('[CLOSED] WebSocket connection');
  console.log('WebSocket connections size: ' + webSocketServer.clients.length);
  consoleLogResourceObservers();
}

function consoleLogResource() {
  console.log('Current Resource object:');
  console.log(JSON.stringify(resourceData, null, 4));
}

function consoleLogResourceObservers() {
  console.log('Current Resource observers:');
  console.log(resourceObservers);
}