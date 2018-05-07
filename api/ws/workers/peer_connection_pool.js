/*
 * Copyright © 2018 Lisk Foundation
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Unless otherwise agreed in a custom licensing agreement with the Lisk Foundation,
 * no part of this software, including this file, may be copied, modified,
 * propagated, or distributed except according to the terms contained in the
 * LICENSE file.
 *
 * Removal or modification of this copyright notice is prohibited.
 */
// TODO: Consider moving the server connection handling logic from
// workers_controller.js to this file.

'use strict';

const crypto = require('crypto');
const scClient = require('socketcluster-client');
const WAMPClient = require('wamp-socket-cluster/WAMPClient');
const failureCodes = require('../rpc/failure_codes');

const TIMEOUT = 2000;

function sha1(string) {
	const hasher = crypto.createHash('sha1');
	hasher.update(string);
	return hasher.digest('hex');
}

/**
 * PeerConnectionPool - Helps to manage peer connections efficiently.
 *
 * @class
 * @memberof api.ws.workers
 * @see Parent: {@link api.ws.workers}
 */
function PeerConnectionPool(options) {
	this.system = options.system;
	this.logger = options.logger;
	this.noncePeerMap = {};
	this.wampClient = new WAMPClient(options.requestTimeout || TIMEOUT);
}

PeerConnectionPool.prototype.peerHasPriority = function(
	peerNonce,
	systemNonce
) {
	// We use this hashing algorithm so that the proportion of inbound vs outbound
	// connections will be approximately even across all peers.
	const nonceHashA = sha1(peerNonce + systemNonce);
	const nonceHashB = sha1(systemNonce + peerNonce);

	return nonceHashA > nonceHashB;
};

PeerConnectionPool.prototype._peerHasUsableSocket = function(peer) {
	if (peer && peer.socket) {
		// Outbound sockets are lazy so they are usable even if disconnected.
		if (peer.socket.clientId) {
			return true;
		}
		return peer.socket.state === peer.socket.OPEN;
	}
	return false;
};

PeerConnectionPool.prototype._sortPeersBySocketPriority = function(
	peerList,
	prioritizeInbound
) {
	peerList.sort((peerA, peerB) => {
		const socketA = (peerA || {}).socket;
		const socketB = (peerB || {}).socket;

		if (typeof socketA !== 'object') {
			return 1;
		}
		if (typeof socketB !== 'object') {
			return -1;
		}

		const inboundBit = prioritizeInbound ? 1 : 0;
		const outboundBit = inboundBit ^ 1;

		const socketAScore =
			((socketA.clientId ? outboundBit : inboundBit) << 2) |
			((socketA.state === socketA.OPEN ? 1 : 0) << 1) |
			(socketA.id < socketB.id ? 1 : 0);
		const socketBScore =
			((socketB.clientId ? outboundBit : inboundBit) << 2) |
			((socketB.state === socketB.OPEN ? 1 : 0) << 1) |
			(socketB.id < socketA.id ? 1 : 0);
		if (socketAScore > socketBScore) {
			return -1;
		}
		if (socketAScore < socketBScore) {
			return 1;
		}
		return 0;
	});
	return peerList;
};

/**
 * Adds a peer if it is not already in the pool and connects to it if there are
 * no existing connections to it.
 *
 * @param {Object} newPeerData should have a nonce property.
 * If peer is inbound then it should also have a socket property.
 */
PeerConnectionPool.prototype.addPeer = function(newPeerData) {
	const systemHeaders = this.system.getHeaders();
	const peerNonce = newPeerData.nonce;

	if (peerNonce === systemHeaders.nonce) {
		this.logger.error('Node tried to connect to itself as a peer');
		return false;
	}

	let peer;
	const existingPeer = this.noncePeerMap[peerNonce];

	if (existingPeer) {
		peer = existingPeer;
	} else {
		peer = newPeerData;
	}

	const existingPeerHasUsableSocket = this._peerHasUsableSocket(existingPeer);
	const newPeerHasUsableSocket = this._peerHasUsableSocket(newPeerData);

	if (!existingPeerHasUsableSocket && !newPeerHasUsableSocket) {
		const connectionOptions = {
			autoConnect: true,
			autoReconnect: false,
			connectTimeout: TIMEOUT,
			ackTimeout: TIMEOUT,
			pingTimeoutDisabled: true,
			port: peer.wsPort,
			hostname: peer.ip,
			query: systemHeaders,
			multiplex: false,
		};
		peer.socket = scClient.connect(connectionOptions);
	} else if (existingPeerHasUsableSocket && newPeerHasUsableSocket) {
		// If there is more than one socket to choose from for a given peer, this
		// algorithm will make sure that both peers independently agree on which
		// socket to prioritize - That way peers don't accidentally close each
		// other's sockets.
		const useInboundConnection = this.peerHasPriority(
			peerNonce,
			systemHeaders.nonce
		);
		const sortedPeers = this._sortPeersBySocketPriority(
			[existingPeer, newPeerData],
			useInboundConnection
		);
		const deprecatedSocket = sortedPeers[1].socket;
		const reason =
			'Peer connection was deprecated because a better connection was found';
		this._destroySocket(deprecatedSocket, 1000, reason);
		// Choose the best socket for the peer.
		peer.socket = sortedPeers[0].socket;
	} else if (existingPeerHasUsableSocket) {
		peer.socket = existingPeer.socket;
	} else {
		peer.socket = newPeerData.socket;
	}
	if (!peer.socket.call) {
		this._upgradeSocket(peer.socket);
		if (peer.socket.clientId) {
			this._registerPeerOutboundSocketListeners(peer);
		} else {
			this._registerPeerInboundSocketListeners(peer);
		}
	}

	this.noncePeerMap[peerNonce] = peer;
};

PeerConnectionPool.prototype.removePeer = function(peerData) {
	const peerNonce = peerData.nonce;
	const existingPeer = this.noncePeerMap[peerNonce];
	if (!existingPeer) {
		this.logger.error(
			`Failed to remove non-existent peer ${peerNonce} from PeerConnectionPool`
		);
		return false;
	}
	if (existingPeer.socket) {
		existingPeer.socket.destroy();
	}
	delete this.noncePeerMap[peerNonce];
	return true;
};

PeerConnectionPool.prototype.callPeer = function(
	peerNonce,
	procedure,
	data,
	callback
) {
	const peer = this.noncePeerMap[peerNonce];
	if (!peer) {
		const message = `Failed to call RPC "${procedure}" on non-existent peer ${peerNonce}`;
		this.logger.debug(message);
		return Promise.reject(message);
	}
	return peer.socket.call(procedure, data, callback);
};

PeerConnectionPool.prototype.emitToPeer = function(peerNonce, event, data) {
	const peer = this.noncePeerMap[peerNonce];
	if (!peer) {
		const message = `Failed to emit event "${event}" on non-existent peer ${peerNonce}`;
		this.logger.debug(message);
		return Promise.reject(message);
	}
	return peer.socket.emit(event, data);
};

PeerConnectionPool.prototype._upgradeSocket = function(socket) {
	this.wampClient.upgradeToWAMP(socket);
};

PeerConnectionPool.prototype._destroySocket = function(socket, code, reason) {
	if (socket.destroy) {
		socket.destroy(code, reason);
	} else {
		socket.disconnect(code, reason);
	}
};

PeerConnectionPool.prototype._registerPeerInboundSocketListeners = function(
	peer
) {
	const socket = peer.socket;

	socket.on('close', () => {
		this._destroySocket(socket);
		if (socket === peer.socket) {
			delete peer.socket;
		}
		const currentPeer = this.noncePeerMap[peer.nonce];
		if (!currentPeer.socket) {
			delete this.noncePeerMap[peer.nonce];
		}
	});
};

PeerConnectionPool.prototype._registerPeerOutboundSocketListeners = function(
	peer
) {
	const socket = peer.socket;

	socket.on('connect', () => {
		this.logger.trace(
			`[Outbound socket :: connect] Peer connection to ${peer.ip} established`
		);
	});

	socket.on('disconnect', () => {
		this.logger.trace(
			`[Outbound socket :: disconnect] Peer connection to ${
				peer.ip
			} disconnected`
		);
	});

	// When handshake process will fail - disconnect
	// ToDo: Use parameters code and description returned while handshake fails
	socket.on('connectAbort', () => {
		socket.disconnect(
			failureCodes.HANDSHAKE_ERROR,
			failureCodes.errorMessages[failureCodes.HANDSHAKE_ERROR]
		);
	});

	// When error on transport layer occurs - disconnect
	socket.on('error', err => {
		this.logger.debug(
			`[Outbound socket :: error] Peer error from ${peer.ip} - ${err.message}`
		);
		socket.disconnect(
			1000,
			'Intentionally disconnected from peer because of error'
		);
	});

	socket.on('close', (code, reason) => {
		this.logger.debug(
			`[Outbound socket :: close] Peer connection to ${
				peer.ip
			} closed with code ${code} and reason - ${reason}`
		);

		this._destroySocket(socket);
		if (socket === peer.socket) {
			delete peer.socket;
		}
		const currentPeer = this.noncePeerMap[peer.nonce];
		if (!currentPeer.socket) {
			delete this.noncePeerMap[peer.nonce];
		}
	});

	// The 'message' event can be used to log all low-level WebSocket messages.
	socket.on('message', message => {
		this.logger.trace(
			`[Outbound socket :: message] Peer message from ${
				peer.ip
			} received - ${message}`
		);
	});
};

module.exports = PeerConnectionPool;
