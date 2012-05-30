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
                        connect: options.connect || true,
                        servers: [],
                        log: options.log || createLogger()
                };
                if (options.servers) {
                        opts.servers = options.servers.slice();
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
