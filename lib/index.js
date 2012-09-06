// Copyright (c) 2012, Mark Cavage. All rights reserved.

var bunyan = require('bunyan');
var zookeeper = require('zookeeper');

var ZKClient = require('./client').ZKClient;
var Election = require('./election').Election;
var GenericElection = require('./generic-election').Election;
var ZKError = require('./error').ZKError;



///--- Helpers

function createLogger() {
        var log = bunyan.createLogger({
                name: 'zookeeper',
                serializers: {err: bunyan.stdSerializers.err},
                stream: process.stderr,
                level: (process.env.LOG_LEVEL || 'info')
        });

        return (log);
}



///--- API

function ZKPlus(options) {
        options = options || {};
        var opts = {
                connect: (options.connect !== undefined ?
                          options.connect : true),
                servers: [],
                log: options.log || createLogger(),
                timeout: options.timeout || 30000,
                pollInterval: options.pollInterval || 0,
                autoReconnect: (options.autoReconnect !== undefined ?
                                options.autoReconnect : true)
        };
        if (options.servers) {
                options.servers.forEach(function (server) {
                        if (!server.host) {
                                // handle cases where we receive a
                                // connection string:
                                // "localhost:2181"
                                server = server.split(':');
                                var port = 2181;
                                if (server[1])
                                        port = parseInt(server[1], 10);
                                opts.servers.push({
                                        host: server[0],
                                        port: port
                                });
                        } else {
                                opts.servers.push(server);
                        }
                });
        } else if (options.host) {
                opts.servers.push({
                        host: options.host,
                        port: options.port || 2181
                });
        } else {
                opts.servers.push({
                        host: 'localhost',
                        port: 2181
                });
        }

        return (new ZKClient(opts));
}


function createGenericElection(options) {
        options = options || {};
        var opts = {
                client: options.client,
                log: options.log,
                object: options.object || {},
                path: options.path,
                pathPrefix: options.pathPrefix
        };

        return (new GenericElection(opts));
}


function createElection(options) {
        options = options || {};
        var opts = {
                client: options.client,
                log: options.log,
                object: options.object || {},
                path: options.path,
                pathPrefix: options.pathPrefix
        };

        return (new Election(opts));
}



///--- Exports

module.exports = ZKPlus;
module.exports.createClient = ZKPlus;
module.exports.createGenericElection = createGenericElection;
module.exports.createElection = createElection;
module.exports.ZKError = ZKError;
module.exports.ZKClient = ZKClient;

// Reexport ZooKeeper macros
Object.keys(zookeeper).forEach(function (k) {
        if (typeof (zookeeper[k]) === 'number')
                module.exports[k] = zookeeper[k];
});
