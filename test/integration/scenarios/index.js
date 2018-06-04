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

module.exports = {
	network: {
		peers: require('./network/peers'),
		peerDisconnect: require('./network/peer_disconnect'),
		peerBlacklist: require('./network/peer_blacklist'),
	},
	propagation: {
		blocks: require('./propagation/blocks'),
		transactions: require('./propagation/transactions'),
		multisignature: require('./propagation/rpc/transactions/multisignature'),
	},
	stress: {
		transfer: require('./stress/0.transfer'),
		transfer_with_data: require('./stress/0.transfer_with_data.js'),
		second_passphrase: require('./stress/1.second_passphrase'),
		register_delegate: require('./stress/2.register_delegate'),
		cast_vote: require('./stress/3.cast_vote'),
		register_multisignature: require('./stress/4.register_multisignature'),
		register_dapp: require('./stress/5.register_dapp'),
	},
};
