// Copyright 2012 Mark Cavage <mcavage@gmail.com> All rights reserved.

var uuid = require('node-uuid');

var zk = require('../lib');

if (require.cache[__dirname + '/helper.js'])
        delete require.cache[__dirname + '/helper.js'];
var helper = require('./helper.js');



///--- Globals

var after = helper.after;
var before = helper.before;
var test = helper.test;

var ROOT = '/' + uuid().substr(0, 7);
var PATH = ROOT + '/' + uuid().substr(0, 7);
var FILE = PATH + '/unit_test.json';
var SUBDIR = PATH + '/foo/bar/baz';
var ZK;
var connectTimeout;


///--- Tests

before(function (callback) {
        try {
                connectTimeout = setTimeout(function() {
                        console.error('Could not connect to a ZK instance, did you start one?');
                }, 1500);

                ZK = zk.createClient({
                        log: helper.createLogger('zk.client.test.js'),
                        servers: [ {
                                host: (process.env.ZK_HOST || 'localhost'),
                                port: (process.env.ZK_PORT || 2181)
                        }],
                        timeout: 1000
                });
                ZK.on('connect', function () {
                        clearTimeout(connectTimeout);
                        ZK.mkdirp(PATH, function (err) {
                                if (err) {
                                        console.error(err.stack);
                                        process.exit(1);
                                }

                                callback();
                        });
                });
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
                ZK.on('close', callback);
                ZK.close();
        });
});


test('connect no-op', function (t) {
        ZK.connect(function (err) {
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
