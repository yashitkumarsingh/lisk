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

'use strict';

const connections = require('./connections');
const Peer = require('../../../logic/peer');

const logs = require('./logs');

class Connect {
	constructor(wampClient, wampServer, peersUpdateRules) {
		this.wampClient = wampClient;
		this.wampServer = wampServer;
		this.peersUpdateRules = peersUpdateRules;
	}

	// Private
	upgradeSocket(socket) {
		this.wampClient.upgradeToWAMP(socket);
		this.wampServer.upgradeToWAMP(socket);
	}

	registerSocketListeners(socket, peerObject) {
		const peer = new Peer(peerObject);
		// Possible ToDo: connection timeout listener to discard/notify about success through callback
		socket.on('connect', () => {
			logs.listeners.connect(peer);
			connections.insert(peer, socket, this.peersUpdateRules);
		});

		socket.on('close', (code, reason) => {
			logs.listeners.close(peer, code, reason);
			if (socket.destroy) {
				socket.destroy();
			}
			connections.remove(peer, this.peersUpdateRules);
		});

		socket.on('disconnect', () => {
			logs.listeners.disconnect(peer);
		});

		socket.on('connectAbort', () => {
			logs.listeners.connectionAbort(peer);
		});

		socket.on('error', err => {
			logs.listeners.error(peer, err);
		});

		socket.on('message', message => {
			logs.listeners.message.inbound(message, peer);
		});
		return socket;
	}

	// Public
	registerSocket(socket, peer) {
		this.upgradeSocket(socket);
		this.registerSocketListeners(socket, peer);
	}
}

module.exports = Connect;
