// Copyright 2012 Mark Cavage <mcavage@gmail.com> All rights reserved.

var uuid = require('node-uuid');

var zk = require('../lib');

if (require.cache[__dirname + '/helper.js'])
        delete require.cache[__dirname + '/helper.js'];
var helper = require('./helper.js');
var ZK = require('zookeeper');



///--- Globals

var after = helper.after;
var before = helper.before;
var test = helper.test;

var ROOT = '/' + uuid().substr(0, 7);
var PATH = ROOT + '/' + uuid().substr(0, 7);
var FILE = PATH + '/unit_test.json';
var SUBDIR = PATH + '/foo/bar/baz';

var HOST = process.env.ZK_HOST || 'localhost';
var PORT = parseInt(process.env.ZK_PORT, 10) || 2181;



///--- Tests

before(function (callback) {
        try {
                ZK = zk.createClient({
                        connectTimeout: false,
                        log: helper.createLogger('zk.client.test.js'),
                        servers: [ {
                                host: HOST,
                                port: PORT
                        }],
                        timeout: 1000,
                        pollInterval: 200
                });
                ZK.once('connect', function () {
                        ZK.mkdirp(PATH, function (err) {
                                if (err) {
                                        console.error(err.stack);
                                        process.exit(1);
                                }

                                callback();
                        });
                });
                ZK.connect();
        } catch (e) {
                console.error(e.stack);
                process.exit(1);
        }
});


after(function (callback) {
        ZK.rmr(ROOT, function (err) {
                if (err) {
                        console.error('Unable to clean up %s', ROOT);
                        process.exit(1);
                }
                ZK.once('close', callback);
                ZK.close();
        });
});


test('connect no-op', function (t) {
        ZK.connect(function (err) {
                t.ifError(err);
                t.end();
        });
        ZK.on('connect', function () {
                t.end();
        });
        ZK.on('error', function (err) {
                t.ifError(err);
                t.end();
        });
});

test('creat no options', function (t) {
        ZK.create(FILE, function (err, path) {
                t.ifError(err);
                t.ok(path);
                t.equal(FILE, path);
                t.end();
        });
});


test('get', function (t) {
        var opts = {
                object: {
                        hello: 'world'
                }
        };
        ZK.create(FILE, opts, function (err, path) {
                t.ifError(err);
                t.ok(path);
                t.equal(FILE, path);
                ZK.get(FILE, function (err2, obj) {
                        t.ifError(err2);
                        t.deepEqual(opts.object, obj);
                        t.end();
                });
        });
});


test('getState', function (t) {
        t.equal(ZK.getState(), 'connected');
        t.end();
});


test('put not exists', function (t) {
        var obj = {
                hello: 'world'
        };
        ZK.put(FILE, obj, function (err) {
                t.ifError(err);
                ZK.get(FILE, function (err2, obj2) {
                        t.ifError(err2);
                        t.deepEqual(obj, obj2);
                        t.end();
                });
        });
});


test('put overwrite', function (t) {
        var obj = {
                hello: 'world'
        };
        ZK.put(FILE, {foo: 'bar'}, function (err) {
                t.ifError(err);
                ZK.put(FILE, obj, function (err2) {
                        t.ifError(err2);
                        ZK.get(FILE, function (err3, obj2) {
                                t.ifError(err3);
                                t.deepEqual(obj, obj2);
                                t.end();
                        });
                });
        });
});


test('readdir', function (t) {
        ZK.readdir(ROOT, function (err, children) {
                t.ifError(err);
                t.ok(children);
                t.equal(children.length, 1);
                t.equal(PATH.split('/').pop(), children[0]);
                t.end();
        });
});


test('update', function (t) {
        ZK.create(FILE, function (err) {
                t.ifError(err);
                var obj = {
                        hello: 'world'
                };
                ZK.update(FILE, obj, function (err2) {
                        t.ifError(err2);
                        ZK.get(FILE, function (err3, obj2) {
                                t.ifError(err3);
                                t.deepEqual(obj, obj2);
                                t.end();
                        });
                });
        });
});


test('unlink', function (t) {
        ZK.create(FILE, function (err) {
                t.ifError(err);
                ZK.unlink(FILE, function (err2) {
                        t.ifError(err2);
                        ZK.get(FILE, function (err3) {
                                t.ok(err3);
                                t.equal(err3.code, zk.ZNONODE);
                                t.end();
                        });
                });
        });
});


test('watch (data)', function (t) {
        ZK.create(FILE, function (err) {
                t.ifError(err);
                ZK.watch(FILE, function (err2, watcher) {
                        t.ifError(err2);
                        t.ok(watcher);

                        var object = {
                                hello: 'world'
                        };
                        watcher.on('data', function (obj) {
                                t.ok(obj);
                                t.deepEqual(object, obj);
                                watcher.stop();
                                t.end();
                        });

                        ZK.update(FILE, object, function (err3) {
                                t.ifError(err3);
                        });
                });
        });
});


test('watch (data+initialRead)', function (t) {
        ZK.create(FILE, function (err) {
                t.ifError(err, 'unable to create znone');

                var events = 0;
                var opts = {
                        initialData: true
                };
                ZK.watch(FILE, opts, function (err2, watcher) {
                        t.ifError(err2);
                        t.ok(watcher);

                        var object = {
                                hello: 'world'
                        };
                        watcher.on('data', function (obj) {
                                t.ok(obj);

                                // Should fire once for the initial read,
                                // and then again due to the update
                                if (++events === 2) {
                                        t.deepEqual(object, obj);
                                        watcher.stop();
                                        t.end();
                                }
                        });

                        ZK.update(FILE, object, function (err3) {
                                t.ifError(err3);
                        });
                });
        });
});


test('trigger close', function (t) {
        var ZK2 = zk.createClient({
                connectTimeout: false,
                log: helper.createLogger('zk.client.test.js'),
                servers: [ {
                        host: (process.env.ZK_HOST || 'localhost'),
                        port: (parseInt(process.env.ZK_PORT, 10) || 2181)
                }],
                timeout: 1000,
                autoReconnect: false
        });
        ZK2.on('close', function () {
                t.end();
        });
        ZK2.connect();
        ZK2.close();
});


test('connect to expired session', function (t) {
        var ZK2 = zk.createClient({
                connectTimeout: false,
                log: helper.createLogger('zk.client.test.js'),
                servers: [ {
                        host: (process.env.ZK_HOST || 'localhost'),
                        port: (parseInt(process.env.ZK_PORT, 10) || 2181)
                }],
                timeout: 1000,
                clientId: '13ae15da1420111',
                clientPassword: '9A9F0236749B498451DB8AD918491CAD'
        });
        ZK2.on('error', function (err) {
                t.equal(err.code, zk.ZSESSIONEXPIRED);
                t.end();
        });
        ZK2.connect();
});


test('connect to non-existent zk', function (t) {
        var ZK2 = zk.createClient({
                log: helper.createLogger('zk.client.test.js'),
                servers: [ {
                        host: 'localhost',
                        port: 9999
                }],
                timeout: 5000
        });
        var gotConEvent;
        ZK2.on('error', function (err) {
                t.equal(err.code, -112);
                t.ok(gotConEvent);
                t.end();
        });
        ZK2.once('not_connected', function () {
                gotConEvent = true;
        });
        ZK2.connect();
});
