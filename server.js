'use strict';

const express = require('express'),
  app = express(),
  server = require('http').createServer(app),
  WebSocketServer = require('ws').Server,
  request = require('request'),
  async = require('async'),
  zmq = require('zmq'),
  log = require('npmlog');
  // stronglopp = require('strong-agent').profile();

app.use(express.static(__dirname + '/'));
app.use(express.json());
app.use(express.urlencoded());
app.enable('trust proxy');

log.level = process.env.LOGGING_LEVEL || 'verbose';

const port = process.env.PORT || 5000

server.listen(port, function() {
  log.info('Server ' + process.pid + ' listening on', port);
});

var webSocketServer = new WebSocketServer({
  server: server
});

/**
 * Infrastructure and security settings
 */
const fetcherAddress = process.env.FETCHER_ADDRESS;
const debugMode = process.env.NODE_ENV === 'development';

/**
 * Data models that hold resource -> resourcedata, and resource -> observers data
 */
var resourceData = {};
var resourceObservers = {};

/**
 * Public Endpoints
 */
webSocketServer.on('connection', function (webSocketClient) {
  handleClientConnected(webSocketClient);
});

function handleClientConnected(clientConnection) {
  if (!isValidConnection(clientConnection)) {
    clientConnection.disconnect();
  }

  var resourceId = getResourceId(clientConnection);
  observeResource(clientConnection, resourceId);

  var existingResourceData = resourceData.resourceId;

  if (existingResourceData) {
    sendResourceDataToObserver(clientConnection, resourceId);
  } else {
    requestResource(resourceId);
  }
}

const resourceRequiredPublisher = zmq.socket('pub').bind('tcp://*:5432', function(err) {
  if (err) {
    throw Error(err);
  }
  log.info('Resource Required Publisher listening for subscribers...');
});

const resourceUpdatedSubscriber = zmq.socket('sub').connect('tcp://localhost:5433');
resourceUpdatedSubscriber.subscribe('');

resourceUpdatedSubscriber.on('message', function (data) {
  var resource = JSON.parse(data); 

  handleResourceDataReceived(resource);
});

function handleResourceDataReceived(resource) {
  log.silly('Received resource data for resource id (' + resource.id + ')');

  storeResourceData(resource);
  notifyObservers(resource.id);
}


/**
 * Implementation of public endpoints
 */

var resourceData = {}; // key = resourceId, value = resourceData
var resourceObservers = {}; // key = resourceId, value = clientConnection[]

function isValidConnection(clientConnection) {
  var resourceId = getResourceId(clientConnection);

  if (!resourceId) {
    log.warn('Bad resource id (' + resourceId + ') is requested, closing the socket connection');
    return false;
  }

  return true;
}

function getResourceId(clientConnection) {
  return clientConnection.upgradeReq.url.substring(1);
}

function storeResourceData(resource) {
  resourceData[resource.id] = resource.data;

  logAllResources();
}

function observeResource(clientConnection, resourceId) {
  var currentResourceObservers = resourceObservers[resourceId] || [];

  currentResourceObservers.push(clientConnection);
  resourceObservers[resourceId] = currentResourceObservers;

  logNewObserver(clientConnection);
}

function notifyObservers(resourceId) {
  var currentResourceObservers = resourceObservers[resourceId];
  var data = resourceData[resourceId];

  if (currentResourceObservers) {

    async.forEach(currentResourceObservers, function(thisObserver){

      if (thisObserver.readyState !== 3) {
        sendResourceDataToObserver(thisObserver, data);
      } else {
        // We need to find the index ourselves, see https://github.com/caolan/async/issues/144
        // Discussion: When a resource terminates, and all observers disconnect, 
          // currentResourceObservers will still be full.
        var i = getTheIndexOfTheObserver(currentResourceObservers, thisObserver);

        unobserveResource(currentResourceObservers, resourceId, i);
      }
    },
    function(err){
      log.error('Cant broadcast resource data to watching observer:', err);  
    });        
  } else {
    if (!currentResourceObservers) {
      log.warn('No observers watching this resource');
    } else {
      log.warn('No new resource data (' + data + ')');
    }
  }
}

function getTheIndexOfTheObserver(observersWatchingThisResource, observerToFind) {
  for (var i = 0; i < observersWatchingThisResource.length; i++) {
    var observer = observersWatchingThisResource[i];

    if (observer === observerToFind) {
      return i;
    }
  }
}

function unobserveResource(observersWatchingThisResource, resourceId, indexOfTheObserver) {
  observersWatchingThisResource.splice(indexOfTheObserver, 1);

  if (observersWatchingThisResource.length === 0) { 
    removeResource(resourceId);
  } 

  logRemovedObserver();
}

function removeResource(resourceId) {
  log.silly('Removing resource ( ' + resourceId + ') from memory');

  delete resourceObservers[resourceId];
  delete resourceData[resourceId];   
}

function sendResourceDataToObserver(clientConnection, resource) {
  clientConnection.send(JSON.stringify(resource));  
}

function requestResource(resourceId) {
  log.silly('Requested resource (id: ' + resourceId + ') does not exist, sending a resource request');

  resourceRequiredPublisher.send(JSON.stringify({id: resourceId}));
}

/**
 * Logging
 */

function logNewObserver(clientConnection) {
  log.silly('Requested resource id:', getResourceId(clientConnection));
  log.info('New connection. WebSocket connections size: ', webSocketServer.clients.length);
}

function logAllResources() {
  if (debugMode) {
    log.silly('Current resource data:');
    log.silly(JSON.stringify(resourceData, null, 4));
  }
}

function logRemovedObserver() {
  log.info('Connection closed. WebSocket connections size: ', webSocketServer.clients.length);
  logResourceObservers();
}

function logResourceObservers() {
  if (debugMode) {
    for (var resourceId in resourceObservers) {
      if (resourceObservers.hasOwnProperty(resourceId)) {
        log.info(resourceObservers[resourceId].length + ' observers are watching ' + resourceId );
      }
    }
  }
}

process.on('SIGINT', function() {
  resourceRequiredPublisher.close();
  resourceUpdatedSubscriber.close();
  process.exit();
});