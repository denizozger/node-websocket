// npm install 
var WebSocket = require('ws');
var log = require('npmlog');

log.level = 'verbose';

var sockets = [];
var maxSockets = 415; // max 400
var connectionAttempts = 0;

function connectToWebSocket() {
	connectionAttempts++;

	var socket = {};

	var ws;

  (function() {
      ws = new WebSocket('http://localhost:5000/matchesfeed/1/matchcentre');
  })();

  ws.on('open', function() {
	    log.info('Connected');
	});

	ws.on('error', function() {
	    log.error('Error');
	});

	ws.on('close', function() {
	    log.warn('Closed');
	});

  sockets.push(ws);

	if (connectionAttempts < maxSockets) {
    setTimeout(connectToWebSocket, 500);
  } 

};

connectToWebSocket();

