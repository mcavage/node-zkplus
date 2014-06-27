// Copyright 2014 Mark Cavage <mcavage@gmail.com> All rights reserved.

var path = require('path');

var bunyan = require('bunyan');
var test = require('tape');
var uuid = require('node-uuid');
var vasync = require('vasync');

var helper = require('./helper');
var zkplus = require('../lib');



///--- Globals

var CLIENT;



///--- Tests

test('setup', function (t) {
    CLIENT = zkplus.createClient({
        connectTimeout: false,
        log: helper.log,
        servers: [helper.zkServer],
        timeout: 1000
    });

    t.ok(CLIENT);

    CLIENT.connect(function (err) {
        t.ifError(err);
        if (err) {
            t.end();
            return;
        }

        CLIENT.mkdirp(helper.subdir, function (err2) {
            t.ifError(err2);

            CLIENT.create(helper.file, {}, function (err3, p) {
                t.ifError(err3);
                t.ok(p);
                t.equal(helper.file, p);
                t.end();
            });
        });
    });
});


test('watch (data)', function (t) {
    var f = helper.file;
    var obj = {
        foo: 'bar'
    };
    var zk = CLIENT;

    vasync.pipeline({
        funcs: [
            function startWatch(_, cb) {
                zk.watch(f, function (err, w) {
                    t.ifError(err);
                    t.ok(w);
                    if (err || !w) {
                        cb(err || new Error('no watcher'));
                        return;
                    }

                    w.on('data', function (update) {
                        t.ok(update);
                        t.deepEqual(update, obj);
                        t.end();
                    });

                    setImmediate(cb);
                });
            },
            function _update(_, cb) {
                zk.put(helper.file, obj, function (err) {
                    t.ifError(err);
                    cb(err);
                });
            }
        ]
    }, function (err) {
        t.ifError(err);
        if (err)
            t.end();
    });
});


test('watch (directory)', function (t) {
    var d = helper.subdir;
    var name;
    var zk = CLIENT;

    vasync.pipeline({
        funcs: [
            function startWatch(_, cb) {
                zk.watch(d, {method: 'list'}, function (err, w) {
                    t.ifError(err);
                    t.ok(w);
                    if (err || !w) {
                        cb(err || new Error('no watcher'));
                        return;
                    }

                    w.on('data', function (update) {
                        t.ok(update);
                        t.ok(update.indexOf(path.basename(name)) !== -1);
                        t.end();
                    });

                    setImmediate(cb);
                });
            },
            function _update(_, cb) {
                zk.create(path.join(d, uuid.v4()), {}, function (err, p) {
                    t.ifError(err);
                    t.ok(p);
                    cb(err);
                    name = p;
                });
            }
        ]
    }, function (err) {
        t.ifError(err);
        if (err)
            t.end();
    });
});


test('watch (data+initialData)', function (t) {
    var f = helper.file;
    var obj = {
        slam: 'dunk'
    };
    var zk = CLIENT;

    vasync.pipeline({
        funcs: [
            function setup(_, cb) {
                zk.put(f, {}, cb);
            },
            function startWatch(_, cb) {
                zk.watch(f, {initialData: true}, function (err, w) {
                    t.ifError(err);
                    t.ok(w);
                    if (err || !w) {
                        cb(err || new Error('no watcher'));
                        return;
                    }

                    var hits = 0;
                    w.on('data', function (update) {
                        t.ok(update);
                        t.deepEqual(update, hits++ < 1 ? {} : obj);
                        if (hits === 2)
                            t.end();
                    });

                    setImmediate(cb);
                });
            },
            function _update(_, cb) {
                zk.put(helper.file, obj, function (err) {
                    t.ifError(err);
                    cb(err);
                });
            }
        ]
    }, function (err) {
        t.ifError(err);
        if (err)
            t.end();
    });
});


test('watch (directory + initial data)', function (t) {
    var d = helper.subdir;
    var name;
    var zk = CLIENT;

    vasync.pipeline({
        funcs: [
            function startWatch(_, cb) {
                var _opts = {
                    initialData: true,
                    method: 'list'
                };
                zk.watch(d, _opts, function (err, w) {
                    t.ifError(err);
                    t.ok(w);
                    if (err || !w) {
                        cb(err || new Error('no watcher'));
                        return;
                    }

                    var hits = 0;
                    w.on('data', function (update) {
                        t.ok(update);
                        if (hits++ >= 1) {
                            t.ok(update.indexOf(path.basename(name)) !== -1);
                            t.end();
                        }
                    });

                    setImmediate(cb);
                });
            },
            function _update(_, cb) {
                zk.create(path.join(d, uuid.v4()), {}, function (err, p) {
                    t.ifError(err);
                    t.ok(p);
                    cb(err);
                    name = p;
                });
            }
        ]
    }, function (err) {
        t.ifError(err);
        if (err)
            t.end();
    });
});


test('teardown', function (t) {
    CLIENT.rmr(helper.root, function (err) {
        t.ifError(err);
        CLIENT.close(function (err2) {
            t.ifError(err2);
            t.end();
        });
    });
});
