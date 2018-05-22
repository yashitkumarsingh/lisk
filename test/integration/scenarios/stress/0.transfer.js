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

var Promise = require('bluebird');
var lisk = require('lisk-js').default;
var accountFixtures = require('../../../fixtures/accounts');
var constants = require('../../../../helpers/constants');
var randomUtil = require('../../../common/utils/random');
var waitFor = require('../../../common/utils/wait_for');
var sendTransactionsPromise = require('../../../common/helpers/api')
	.sendTransactionsPromise;
var getTransaction = require('../../utils/http').getTransaction;

module.exports = function(params) {
	describe('postTransactions @slow', () => {
		var transactions = [];
		var maximum = 1000;
		var waitForExtraBlocks = 4; // Wait for extra blocks to ensure all the transactions are included in the block

		function confirmTransactionsOnAllNodes() {
			return Promise.all(
				_.flatMap(params.configurations, configuration => {
					return transactions.map(transaction => {
						return getTransaction(transaction.id, configuration.httpPort);
					});
				})
			).then(results => {
				results.forEach(transaction => {
					expect(transaction)
						.to.have.property('id')
						.that.is.an('string');
				});
			});
		}

		const sendBundledTransactions = transactions => {
			const firstNode = params.sockets[0];
			firstNode.emit('postTransactions', { transactions });
		};

		describe('sending 1000 bundled transfers to random addresses', () => {
			before(() => {
				_.range(maximum).map(() => {
					var transaction = lisk.transaction.transfer({
						amount: randomUtil.number(100000000, 1000000000),
						passphrase: accountFixtures.genesis.password,
						recipientId: randomUtil.account().address,
					});
					transactions.push(transaction);
				});

				const limit = params.configurations[0].broadcasts.releaseLimit;

				return _.chunk(transactions, limit).map(bundledTransactions => {
					return sendBundledTransactions(bundledTransactions);
				});
			});

			it('should confirm all transactions on all nodes', done => {
				var blocksToWait =
					Math.ceil(maximum / constants.maxTransactionsPerBlock) +
					waitForExtraBlocks;
				waitFor.blocks(blocksToWait, () => {
					confirmTransactionsOnAllNodes()
						.then(done)
						.catch(err => {
							done(err);
						});
				});
			});
		});

		describe('sending 1000 single transfers to random addresses', () => {
			before(() => {
				transactions = [];
				return Promise.all(
					_.range(maximum).map(() => {
						var transaction = lisk.transaction.transfer({
							amount: randomUtil.number(100000000, 1000000000),
							passphrase: accountFixtures.genesis.password,
							recipientId: randomUtil.account().address,
						});
						transactions.push(transaction);
						return sendTransactionsPromise([transaction]);
					})
				);
			});

			it('should confirm all transactions on all nodes', done => {
				var blocksToWait =
					Math.ceil(maximum / constants.maxTransactionsPerBlock) +
					waitForExtraBlocks;
				waitFor.blocks(blocksToWait, () => {
					confirmTransactionsOnAllNodes()
						.then(done)
						.catch(err => {
							done(err);
						});
				});
			});
		});
	});
};
