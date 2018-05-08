'use strict';

const fs = require('fs');
const config = require('../../config.json');
const MasterWAMPServer = require('wamp-socket-cluster/MasterWAMPServer');
const SocketCluster = require('socketcluster');
const wsRPC = require('./rpc/ws_rpc').wsRPC;

module.exports = {
	initializeWSClient: (
		socketCluster,
		version,
		minVersion,
		nethash,
		port,
		nonce
	) => {
		return wsRPC.setServer(
			new MasterWAMPServer(socketCluster, {
				version,
				minVersion,
				nethash,
				port,
				nonce,
			})
		);
	},

	initializeWSServer: (
		port,
		workersNumber,
		workersPath,
		sslEnabled,
		logger,
		cb
	) => {
		const webSocketConfig = {
			port: port,
			workers: workersNumber,
			host: '0.0.0.0',
			workerController: workersPath,
			wsEngine: 'sc-uws',
			appName: 'lisk',
			perMessageDeflate: false,
			secretKey: 'liskSecretKey',
			// Because our node is constantly sending messages, we don't
			// need to use the ping feature to detect bad connections.
			pingTimeoutDisabled: true,
			// Maximum amount of milliseconds to wait before force-killing
			// a process after it was passed a 'SIGTERM' or 'SIGUSR2' signal
			processTermTimeout: 10000,
			logLevel: 0,
		};

		if (sslEnabled) {
			Object.assign(webSocketConfig, {
				protocol: 'https',
				protocolOptions: {
					key: fs.readFileSync(config.ssl.options.key),
					cert: fs.readFileSync(config.ssl.options.cert),
					ciphers:
						'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384:DHE-RSA-AES256-SHA384:ECDHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA256:HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA',
				},
			});
		}

		const socketCluster = new SocketCluster(webSocketConfig);

		// The 'fail' event aggregates errors from all SocketCluster processes.
		socketCluster.on('fail', err => {
			logger.error(err);
		});

		socketCluster.on('workerExit', workerInfo => {
			let exitMessage = `Worker with pid ${workerInfo.pid} exited`;
			if (workerInfo.signal) {
				exitMessage += ` due to signal: '${workerInfo.signal}'`;
			}
			logger.error(exitMessage);
		});

		socketCluster.on('ready', () => {
			logger.info('Socket Cluster ready for incoming connections');
			cb();
		});

		return socketCluster;
	},
};
