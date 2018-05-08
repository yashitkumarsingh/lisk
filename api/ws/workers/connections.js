'use strict';

const logs = require('./logs');

class Connections {
	constructor() {
		this.connections = {};
		// Debug purposes
		setInterval(function () {
			logs.debug.connections(this.connections);
		}.bind(this), 5000);
	}

	remove(peer, peersUpdateRules) {
		if (!this.connections[peer.string]) {
			return logs.connections.remove.notExists(peer);
		}

		peersUpdateRules.removeOnMaster(peer, err => {
			// Remove on master can fail only in 2 circumstances
			// 1. Attempt to remove frozen peer - master assigns DISCONNECT state and returns an error
			// 2. Attempt to remove peer that is not present on PeersList
			if (err) {
				logs.connections.remove.error(err, peer);
			} else {
				logs.connections.remove.success(peer);
			}
		});
	}

	insert(peer, socket, peersUpdateRules) {
		if (this.connections[peer.string]) {
			return logs.connections.insert.exists(peer);
		}
		this.connections[peer.string] = socket;
		peersUpdateRules.insertOnMaster(peer, err => {
			// Insert on master can fail only in 3 circumstances:
			// 1. ON_MASTER.UPDATE.INVALID_PEER - invalid peer address - ToDo: Remove from connections
			// 2. ON_MASTER.INSERT.NOT_ACCEPTED - did not pass through peers.acceptable - ToDo: Remove from connections
			// 3. ON_MASTER.INSERT.NONCE_EXISTS - nonce already exists - ToDo: Remove from connections
			if (err) {
				logs.connections.insert.error(err, peer);
			} else {
				logs.connections.insert.success(peer);
			}
		});
	}
}

module.exports = new Connections();
