'use strict';

var logger = console;

const logs = {
	connections: {
		insert: {
			error: (err, peer) => {
				logger.error(
					`Peer ${peer.ip}:${peer.wsPort} insert error: ${err.toString()}`
				);
			},
			success: peer => {
				logger.info(`Insert peer - ${peer.ip}:${peer.wsPort} success`);
			},
			exists: peer => {
				logger.info(
					`Insert peer discarded, socket already exists- ${peer.ip}:${
						peer.wsPort
					}`
				);
			},
		},
		remove: {
			error: (err, peer) => {
				logger.error(
					`Peer ${peer.ip}:${peer.wsPort} remove error: ${err.toString()}`
				);
			},
			success: peer => {
				logger.info(`Remove peer - ${peer.ip}:${peer.wsPort} success`);
			},
			notExists: peer => {
				logger.info(
					`Remove peer discarded, socket does not exist- ${peer.ip}:${
						peer.wsPort
					}`
				);
			},
		},
	},
	listeners: {
		connect: peer => {
			logger.info(
				`[Event on socket :: connect] Peer connection to ${peer.ip} connected`
			);
		},
		disconnect: peer => {
			logger.info(
				`[Event on socket :: disconnect] Peer connection from ${
					peer.ip
				} disconnected`
			);
		},
		close: (peer, code, reason) => {
			logger.info(
				`[Event on socket :: closed] Peer connection from ${
					peer.ip
				} closed - code: ${code}, reason: ${reason}`
			);
		},
		error: (peer, err) => {
			logger.info(
				`[Event on socket :: error] Peer connection error ${peer.ip}`
			);
		},
		connectionAbort: peer => {
			logger.info(
				`[Event on socket :: connectionAbort] Peer connection to ${
					peer.string
				} failed on handshake`
			);
		},
		message: {
			inbound: (message, peer) => {
				logger.info(
					`[Inbound socket :: message] Peer message from ${
						peer.ip
					} received - ${message}`
				);
			},
			outbound: (socket, message) => {
				logger.info(
					`[Outbound socket :: message] Received message from ${
						socket.request.remoteAddress
					} - ${message}`
				);
			},
		},
	},
	handshake: {},
	debug: {
		connections: connections => {
			logger.info('*** connections state START***');
			Object.keys(connections).map(address => {
				logger.info(`${address} - ${connections[address].id}`);
			});
			logger.info('*** connections state END***');
		},
	},
};

class Logs {
	constructor(__logger) {
		this.logger = __logger;
		logger = __logger;
		Object.assign(this, logs);
	}
}

module.exports = new Logs(console);
