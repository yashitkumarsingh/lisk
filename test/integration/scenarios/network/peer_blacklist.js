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

const childProcess = require('child_process');
const Peer = require('../../../../logic/peer');
const utils = require('../../utils');

const totalPeers = 10;
// Each peer connected to 9 other pairs and have 2 connection for bi-directional communication
const expectedOutgoingConnections = (totalPeers - 1) * totalPeers * 2;
const expectedConnectionsAfterBlacklisting = (totalPeers - 2) * (totalPeers - 1) * 2;

module.exports = params => {
	describe('Peer Blacklisted', () => {
		const getAllPeers = sockets => {
			return Promise.all(
				sockets.map(socket => {
					if (socket.state === 'open') {
						return socket.call('list', {});
					}
				})
			);
		};

		const stopNode = nodeName => {
			return childProcess.execSync(`pm2 stop ${nodeName}`);
		};

		const startNode = nodeName => {
			childProcess.execSync(`pm2 start ${nodeName}`);
		};

		const wsPorts = new Set();

		describe('when peers are mutually connected in the network', () => {
			before(() => {
				return getAllPeers(params.sockets).then(mutualPeers => {
					mutualPeers.forEach(mutualPeer => {
						if (mutualPeer) {
							mutualPeer.peers.map(peer => {
								wsPorts.add(peer.wsPort);
								expect(peer.state).to.be.eql(Peer.STATE.CONNECTED);
							});
						}
					});
				});
			});

			it(`there should be ${expectedOutgoingConnections} established connections from 500[0-9] ports`, done => {
				utils.getEstablishedConnections(
					Array.from(wsPorts),
					(err, numOfConnections) => {
						if (err) {
							return done(err);
						}

						if ((numOfConnections - 20) <= expectedOutgoingConnections) {
							done();
						} else {
							done(
								`There are ${numOfConnections} established connections on web socket ports.`
							);
						}
					}
				);
			});


			describe('when a node blacklists the rest', () => {
				before(done => {
                    stopNode('node_0');
					setTimeout(() => {
                        // Change config of node_0 to blacklist the rest of peers
                        params.configurations[0].peers.access.blackList.push('127.0.0.1');
						startNode('node_0');
						setTimeout(() => {
							done();
						}, 2000);
					}, 2000);
				});

				it(`there should be ${expectedConnectionsAfterBlacklisting} established connections from 500[0-9] ports`, done => {
					utils.getEstablishedConnections(
						Array.from(wsPorts),
						(err, numOfConnections) => {
							if (err) {
								return done(err);
							}

							if ((numOfConnections - 20) <= expectedConnectionsAfterBlacklisting) {
								done();
							} else {
								done(
									`There are ${numOfConnections} established connections on web socket ports.`
								);
							}
						}
					);
				});

				// it('peers should have node_0 disconnected', () => {
				// 	return getAllPeers(params.sockets).then(mutualPeers => {
				// 		console.log()
				// 		mutualPeers.forEach(mutualPeer => {
				// 			if (mutualPeer) {
				// 				mutualPeer.peers.map(peer => {
				// 					if (peer.wsPort == 5000) {
				// 						expect(peer.state).to.be.eql(Peer.STATE.DISCONNECTED);
				// 					} else {
				// 						expect(peer.state).to.be.eql(Peer.STATE.CONNECTED);
				// 					}
				// 				});
				// 			}
				// 		});
				// 	});
				// });

				// it('node_0 should have the rest banned', () => {
				// 	return getAllPeers(params.sockets).then(mutualPeers => {
				// 		mutualPeers.forEach(mutualPeer => {
				// 			if (mutualPeer) {
				// 				const peer_0 = mutualPeer.peers.filter(peer => peer.wsPort === 5000);
				// 				mutualPeer.peers.map(peer => {
				// 					expect(peer.state).to.be.eql(Peer.STATE.BANNED);
				// 				});
				// 			}
				// 		});
				// 	});
				// });


				// it(`peers manager should have only ${expectedOutgoingConnections}`, () => {
				// 	return utils.ws.establishWSConnectionsToNodes(
				// 		params.configurations,
				// 		(err, socketsResult) => {
				// 			params.sockets = socketsResult;
				// 			getAllPeers(socketsResult).then(mutualPeers => {
				// 				mutualPeers.forEach(mutualPeer => {
				// 					if (mutualPeer) {
				// 						mutualPeer.peers.map(peer => {
				// 							if (peer.wsPort >= 5000 && peer.wsPort <= 5009) {
				// 								wsPorts.add(peer.wsPort);
				// 							}
				// 							expect(peer.state).to.be.eql(Peer.STATE.CONNECTED);
				// 						});
				// 					}
				// 				});
				// 			});
				// 		}
				// 	);
				// });
			});
		});
	});
};
