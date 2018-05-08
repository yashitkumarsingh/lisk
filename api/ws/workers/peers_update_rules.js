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

var Peer = require('../../../logic/peer');
var failureCodes = require('../rpc/failure_codes');
var PeerUpdateError = require('../rpc/failure_codes').PeerUpdateError;
var swaggerHelper = require('../../../helpers/swagger');
var connections = require('./connections');
var SlaveToMasterSender = require('./slave_to_master_sender');

var definitions = swaggerHelper.getSwaggerSpec().definitions;
var z_schema = swaggerHelper.getValidator();

var self;

/**
 * Secures peers updates. Used only by workers.
 *
 * @class
 * @memberof api.ws.workers
 * @see Parent: {@link api.ws.workers}
 * @requires api/ws/rpc/failureCodes
 * @requires api/ws/workers/connectionsTable
 * @requires api/ws/workers/rules
 * @requires api/ws/workers/slaveToMaster
 * @requires helpers/swagger
 * @requires helpers/z_schema
 * @requires logic/peer
 * @param {Object} slaveWAMPServer - Used to send verified update requests to master process
 */
function PeersUpdateRules(slaveWAMPServer) {
	this.slaveToMasterSender = new SlaveToMasterSender(slaveWAMPServer);
	self = this;
}

/**
 * Insert peer on a master process
 * @param {Object} peer
 * @param {function} cb
 */
PeersUpdateRules.prototype.insertOnMaster = function(peer, cb) {
	peer.state = Peer.STATE.CONNECTED;
	self.slaveToMasterSender.send(
		'updatePeer',
		Rules.UPDATES.INSERT,
		peer,
		err => {
			if (err) {
				if (!err.code) {
					err = new PeerUpdateError(
						failureCodes.ON_MASTER.UPDATE.TRANSPORT,
						failureCodes.errorMessages[failureCodes.ON_MASTER.UPDATE.TRANSPORT],
						err
					);
				}
			}
			return setImmediate(cb, err);
		}
	);
};

/**
 * Remove peer on a master process
 * @param {Object} peer
 * @param {function} cb
 */
PeersUpdateRules.prototype.removeOnMaster = function(peer, cb) {
	self.slaveToMasterSender.send(
		'updatePeer',
		Rules.UPDATES.REMOVE,
		peer,
		err => {
			if (err && !err.code) {
				err = new PeerUpdateError(
					failureCodes.ON_MASTER.UPDATE.TRANSPORT,
					failureCodes.errorMessages[failureCodes.ON_MASTER.UPDATE.TRANSPORT],
					err
				);
			}
			return setImmediate(cb, err);
		}
	);
};

/**
 * Description of the object.
 */
PeersUpdateRules.prototype.external = {
	/**
	 * Description of the function.
	 *
	 * @memberof api.ws.workers.PeersUpdateRules
	 * @param {Object} request - Peer object with extra requests fields added by SlaveWAMPServer
	 * @param {Object} request.data - Peer data
	 * @param {string} request.socketId - Connection id
	 * @param {string} request.workerId - Worker id
	 * @param {function} cb
	 * @todo Add description for the function and the params
	 * @todo Add @returns tag
	 */
	update(request, cb) {
		z_schema.validate(request, definitions.WSPeerUpdateRequest, err => {
			if (err) {
				return setImmediate(cb, err[0].message);
			}
			if (!request.peerObject) {
				return console.error('External update request called without pre-handshake process');
			}
			const peerString = request.peerObject.ip + ':' + request.peerObject.wsPort;
			if (!connections[peerString]) {
				return setImmediate(
					cb,
					new Error('External update request called for non-existing connection')
				);
			}
			self.slaveToMasterSender.send(
				'updatePeer',
				PeersUpdateRules.UPDATES.INSERT,
				request.data,
				cb
			);
		});
	},
};

PeersUpdateRules.UPDATES = {
	INSERT: 0,
	REMOVE: 1
};
module.exports = PeersUpdateRules;
