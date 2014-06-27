// Copyright (c) 2014, Mark Cavage. All rights reserved.

var assert = require('assert-plus');
var bunyan = require('bunyan');
var zookeeper = require('node-zookeeper-client');

var ZKClient = require('./client').ZKClient;
var errors = require('./error');



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

function createClient(options) {
    assert.optionalObject(options, 'options');

    options = options || {};
    var opts = {
        clientId: options.clientId,
        clientPassword: options.clientPassword,
        servers: [],
        log: options.log || createLogger(),
        retry: options.retry || {
            delay: 1000,
            max: Number.MAX_VALUE
        },
        timeout: options.timeout || 30000
    };

    if (options.connectTimeout === undefined) {
        opts.connectTimeout = 4000;
    } else if (options.connectTimeout !== false) {
        opts.connectTimeout = options.connectTimeout;
    } else {
        opts.connectTimeout = 0;
    }

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
            host: '127.0.0.1',
            port: 2181
        });
    }

    return (new ZKClient(opts));
}



///--- Exports

module.exports = {
    Client: ZKClient,
    createClient: createClient
};

Object.keys(errors).forEach(function (k) {
    module.exports[k] = errors[k];
});
