// Copyright (c) 2012, Mark Cavage. All rights reserved.

var bunyan = require('bunyan');
var zookeeper = require('zookeeper');

var ZKClient = require('./client').ZKClient;
var Election = require('./election').Election;
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

module.exports = {

        createClient: function createClient(options) {
                options = options || {};
                var opts = {
                        connect: (options.connect !== undefined ?
                                  options.connect : true),
                        servers: [],
                        log: options.log || createLogger(),
                        timeout: options.timeout || 30000,
                        autoReconnect: (options.autoReconnect !== undefined ?
                            options.autoReconnect : true)
                };
                if (options.servers) {
                        options.servers.forEach(function(server) {
                                if(!server.host) {
                                        // handle cases where we receive a connection string
                                        // "localhost:2181"
                                        server = server.split(':');
                                        opts.servers.push({
                                                host: server[0],
                                                port: server[1] && parseInt(server[1], 10) || 2181
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
        },

        createElection: function createElection(options) {
                options = options || {};
                var opts = {
                        client: options.client,
                        log: options.log,
                        object: options.object || {},
                        path: options.path
                };

                return (new Election(opts));
        },

        ZKClient: ZKClient,
        ZKError: ZKError
};

// Reexport ZooKeeper macros
Object.keys(zookeeper).forEach(function (k) {
        if (typeof (zookeeper[k]) === 'number')
                module.exports[k] = zookeeper[k];
});
