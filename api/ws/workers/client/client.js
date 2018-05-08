'use strict';

const scClient = require('socketcluster-client');
const System = require('../../../../modules/system');
const connections = require('../connections');

const TIMEOUT = 10000;

var connect = null;

const generateConnectionOptions = peer => {
	return {
		autoConnect: false, // Lazy connection establishment
		autoReconnect: false,
		connectTimeout: TIMEOUT,
		ackTimeout: TIMEOUT,
		pingTimeoutDisabled: true,
		port: peer.wsPort,
		hostname: peer.ip,
		query: System.getHeaders(),
		multiplex: true,
	};
};

const getClientSocket = (peer, cb) => {
	if (connections.connections[peer.string]) {
		return cb(null, connections.connections[peer.string]);
	}
	const socket = scClient.connect(generateConnectionOptions(peer));
	connect.registerSocket(socket, peer);
	return cb(null, socket);
};

class Client {
	constructor(__connect) {
		connect = __connect;
	}

	onEventRequest(peer, procedure, payload) {
	    getClientSocket(peer, (err, socket) => {
			socket.emit(procedure, payload);
		});
	}

	onRPCRequest(peer, procedure, payload, cb) {
		getClientSocket(peer, (err, socket) => {
			socket
				.call(procedure, payload)
				.then(res => {
					setImmediate(cb, null, res);
				})
				.catch(err => {
					setImmediate(cb, err);
				});
		});
	}
}

module.exports = Client;
