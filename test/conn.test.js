// Copyright 2014 Mark Cavage <mcavage@gmail.com> All rights reserved.

var net = require('net');

var bunyan = require('bunyan');
var test = require('tape');
var uuid = require('node-uuid');

var helper = require('./helper');
var zkplus = require('../lib');



///--- Globals

var CLIENT;
var PROXY;



///--- Helpers

function createProxy(cb) {
    var server = net.createServer(function (conn) {
        var zk = net.connect(helper.zkServer, function () {
            zk.pipe(conn);
            conn.pipe(zk);
        });
        var id = conn.remoteAddress + ':' + conn.remotePort;

        zk.once('close', function () {
            if (!server._conns[id])
                return;

            server._conns[id].client.destroy();
            delete server._conns[id];
        });

        conn.once('close', function () {
            if (!server._conns[id])
                return;

            server._conns[id].zk.destroy();
            delete server._conns[id];
        });

        server._conns[id] = {
            client: conn,
            zk: zk
        };
    });

    server._conns = {};

    var _close = server.close;
    server.close = function () {
        Object.keys(server._conns).forEach(function (k) {
            var obj = server._conns[k];
            setImmediate(function () {
                obj.client.destroy();
                obj.zk.destroy();
            });
            delete server._conns[k];
        });
        server._conns = {};
        _close.apply(server, arguments);
    };

    server.listen(2181, '127.0.0.1', function () {
        cb(null, server);
    });
}


function heartbeat(t) {
    CLIENT.stat('/', function (err, stats) {
        t.ifError(err);
        t.ok(stats);
        t.end();
    });
}



///--- Tests

test('setup', function (t) {
    createProxy(function (err, proxy) {
        t.ifError(err);
        PROXY = proxy;

        CLIENT = zkplus.createClient({
            connectTimeout: false,
            log: helper.log,
            servers: [
                {
                    host: 'localhost',
                    port: 2181
                }
            ],
            timeout: 1000
        });
        t.ok(CLIENT);
        CLIENT.connect(function (err2) {
            t.ifError(err2);
            CLIENT.mkdirp(helper.subdir, function (err3) {
                t.ifError(err3);
                t.end();
            });
        });
    });
});


test('heartbeat', heartbeat);


test('stop proxy', function (t) {
    CLIENT.once('close', function () {
        t.end();
    });
    PROXY.close();
});


test('start proxy', function (t) {
    CLIENT.once('connect', function () {
        heartbeat(t);
    });
    PROXY.listen(2181, '127.0.0.1');
});


test('rewatch', function (t) {
    CLIENT.watch(helper.dir, {method: 'list'}, function (err, w) {
        t.ifError(err);
        if (err) {
            t.end();
            return;
        }

        // Fires once on reconnect, and then again on new data
        w.once('data', function (update) {
            t.ok(update);

            w.once('data', function (update2) {
                t.ok(update2);
                w.end();
                t.end();
            });

            CLIENT.create(helper.file, {hello: 'world'}, function (err2) {
                t.ifError(err2);
            });
        });

        PROXY.close();

        process.nextTick(function () {
            PROXY.listen(2181, '127.0.0.1');
        });
    });
});


test('re-ephemeral', function (t) {
    var opts = {
        flags: ['ephemeral_plus', 'sequence']
    };
    CLIENT.create(helper.subdir, {}, opts, function (err, p) {
        t.ifError(err);

        CLIENT.once('close', function () {
            CLIENT.once('connect', function () {
                CLIENT.stat(p, function (err2, stat) {
                    t.ifError(err2);
                    t.ok(stat);
                    t.ok(stat.ephemeralOwner);
                    t.end();
                });
            });

            PROXY.listen(2181, '127.0.0.1');
        });
        PROXY.close();
    });
});


test('teardown', function (t) {
    CLIENT.rmr(helper.dir, function (err) {
        t.ifError(err);
        CLIENT.close(function (err2) {
            t.ifError(err2);
            PROXY.close();
            t.end();
        });
    });
});
