// npm install 
var WebSocket = require('ws');
var log = require('npmlog');

log.level = 'verbose';

var sockets = [];
var maxSockets = 150;
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
	    log.info('Closed');
	});

  sockets.push(ws);

	if (connectionAttempts < maxSockets) {
    setTimeout(connectToWebSocket, 1000);
  } 

};

connectToWebSocket();

function censor(censor) {
  return (function() {
    var i = 0;

    return function(key, value) {
      if(i !== 0 && typeof(censor) === 'object' && typeof(value) == 'object' && censor == value) 
        return '[Circular]'; 

      if(i >= 29) // seems to be a harded maximum of 30 serialized objects?
        return '[Unknown]';

      ++i; // so we know we aren't using the original object anymore

      return value;  
    }
  })(censor);
}

/**

Order of Client Events

When you first connect:
connecting
connect

When you momentarily lose connection:
disconnect
reconnecting (1 or more times)
connecting
reconnect
connect

Losing connection completely:
disconnect
reconnecting (repeatedly)

*/