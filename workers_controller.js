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

const SCWorker = require('socketcluster/scworker');
const async = require('async');
const SlaveWAMPServer = require('wamp-socket-cluster/SlaveWAMPServer');
const WAMPClient = require('wamp-socket-cluster/WAMPClient');
const System = require('./modules/system');
const Handshake = require('./api/ws/workers/middlewares/handshake').middleware
	.Handshake;
const extractHeaders = require('./api/ws/workers/middlewares/handshake')
	.extractHeaders;
const emitMiddleware = require('./api/ws/workers/middlewares/emit');
const logs = require('./api/ws/workers/logs');
const PeersUpdateRules = require('./api/ws/workers/peers_update_rules');
const failureCodes = require('./api/ws/rpc/failure_codes');
const Logger = require('./logger');
const config = require('./config.json');

const Client = require('./api/ws/workers/client/client');
const Connect = require('./api/ws/workers/connect');

console.log('hello moto');

/**
 * Instantiate the SocketCluster SCWorker instance with custom logic
 * inside the run function. The run function is invoked when the worker process
 * is ready to accept requests/connections.
 */
SCWorker.create({
	run() {
		var self = this;
		var scServer = this.getSCServer();

		async.auto(
			{
				logger(cb) {
					cb(
						null,
						new Logger({
							echo: config.consoleLogLevel,
							errorLevel: config.fileLogLevel,
							filename: config.logFileName,
						})
					);
				},
				logs: [
					'logger',
					function(scope, cb) {
						logs.logger = scope.logger;
						return cb(null, logs);
					},
				],
				connect (cb) {
					const TIMEOUT = 10000; // Timeout failed client requests after 1 second
					return cb(
						null,
						new Connect(new WAMPClient(TIMEOUT), null, null)
					);
				},
				client: [
					'connect',
					function(scope, cb) {
						return cb(null, new Client(scope.connect));
					},
				],
				slaveWAMPServer: [
					'client',
					function(scope, cb) {
						new SlaveWAMPServer(
							self,
							20e3,
							(err, slaveWAMPServer) => {
								scope.connect.wampServer = slaveWAMPServer;
								cb(null, slaveWAMPServer);
							},
							scope.client.onRPCRequest,
							scope.client.onEventRequest
						);
					},
				],

				config: [
					'slaveWAMPServer',
					function(scope, cb) {
						cb(null, scope.slaveWAMPServer.config);
					},
				],

				peersUpdateRules: [
					'slaveWAMPServer',
					function(scope, cb) {
						const peersUpdateRules = new PeersUpdateRules(scope.slaveWAMPServer);
						scope.connect.wampServer = scope.slaveWAMPServer;
						cb(null, peersUpdateRules);
					},
				],

				registerRPCSlaveEndpoints: [
					'peersUpdateRules',
					function(scope, cb) {
						scope.slaveWAMPServer.reassignRPCSlaveEndpoints({
							updateMyself: scope.peersUpdateRules.external.update,
						});
						cb();
					},
				],

				system: [
					'config',
					function(scope, cb) {
						new System(cb, { config: scope.config });
					},
				],

				handshake: [
					'system',
					function(scope, cb) {
						return cb(null, Handshake(scope.system));
					},
				],
			},
			(err, scope) => {
				scServer.addMiddleware(
					scServer.MIDDLEWARE_HANDSHAKE_WS,
					(req, next) => {
						req.peerHeaders = extractHeaders(req);
						scope.handshake(req.peerHeaders, (err, peer) => {
							if (err) {
								// Set a custom property on the HTTP request object; we will check this property and handle
								// this issue later.
								// Because of WebSocket protocol handshake restrictions, we can't call next(err) here because the
								// error will not be passed to the client. So we can attach the error to the request and disconnect later during the SC 'handshake' event.
								req.failedHeadersValidationError = err;
							} else {
								req.peerObject = peer.object();
							}
							// Pass through the WebSocket MIDDLEWARE_HANDSHAKE_WS successfully, but
							// we will handle the req.failedQueryValidation error later inside scServer.on('handshake', handler);
							next();
						});
					}
				);

				// ToDo: Asymetric! Client socket doesn't have it!
				scServer.addMiddleware(scServer.MIDDLEWARE_EMIT, emitMiddleware);

				scServer.on('handshake', socket => {
					socket.on('message', message => {
						scope.logs.message.outbound(socket, message);
					});
					// We can access the HTTP request (which instantiated the WebSocket connection) using socket.request
					// so we can access our custom socket.request.failedQueryValidation property here.
					// If the property exists then we disconnect the connection.
					if (socket.request.failedHeadersValidationError) {
						var handshakeFailedCode =
							socket.request.failedHeadersValidationError.code;
						var handshakeFailedDesc =
							socket.request.failedHeadersValidationError.description;
						scope.logger.debug(
							`[Inbound socket :: handshake] WebSocket handshake from ${
								socket.request.remoteAddress
							} failed with code ${handshakeFailedCode} - ${handshakeFailedDesc}`
						);
						return socket.disconnect(handshakeFailedCode, handshakeFailedDesc);
					}

					if (!socket.request.peerObject) {
						var handshakeErrorCode = failureCodes.ON_MASTER.UPDATE.INVALID_PEER;
						var handshakeErrorDesc =
							'Could not find the peerObject property on the handshake request';
						scope.logger.error(
							`[Inbound socket :: handshake] WebSocket handshake from ${
								socket.request.remoteAddress
							} failed with code ${handshakeErrorCode} - ${handshakeErrorDesc}`
						);
						return socket.disconnect(handshakeErrorCode, handshakeErrorDesc);
					}

					scope.logger.trace(
						`[Inbound socket :: handshake] WebSocket handshake from ${
							socket.request.remoteAddress
						} succeeded`
					);

					scope.connect.registerSocket(socket, socket.request.peerObject);
				});

				scope.logger.debug(`Worker pid ${process.pid} started`);
			}
		);
	},
});
