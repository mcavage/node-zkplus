// Copyright 2014 Mark Cavage <mcavage@gmail.com> All rights reserved.

var bunyan = require('bunyan');
var test = require('tape');
var uuid = require('node-uuid');

var helper = require('./helper');
var zkplus = require('../lib');



///--- Globals

var CLIENT;



///--- Tests

test('constructor tests', function (t) {
    t.ok(zkplus.createClient());
    t.ok(zkplus.createClient({
        host: '::1',
        port: 2181
    }));
    t.ok(zkplus.createClient({
        servers: ['127.0.0.1:2181']
    }));

    t.end();
});


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
        t.end();
    });
});


test('connect timeout', function (t) {
    var client = zkplus.createClient({
        connectTimeout: 250,
        log: helper.log,
        servers: [
            {
                host: '169.254.0.1',
                port: 2181
            }
        ],
        timeout: 1000
    });
    t.ok(client);
    client.connect(function (err) {
        t.ok(err);
        t.end();
    });
});


test('mkdirp', function (t) {
    CLIENT.mkdirp(helper.subdir, function (err) {
        t.ifError(err);
        t.end();
    });
});


test('creat no options', function (t) {
    CLIENT.create(helper.file, {}, function (err, path) {
        t.ifError(err);
        t.ok(path);
        t.equal(helper.file, path);
        t.end();
    });
});


test('create: ephemeral', function (t) {
    var opts = {
        flags: ['ephemeral']
    };
    var p = helper.dir + '/' + uuid.v4();
    CLIENT.create(p, {}, opts, function (err, path) {
        t.ifError(err);
        t.ok(path);
        t.equal(p, path);
        t.end();
    });
});


test('create: sequential', function (t) {
    var opts = {
        flags: ['sequence']
    };
    var p = helper.dir + '/' + uuid.v4();
    CLIENT.create(p, {}, opts, function (err, path) {
        t.ifError(err);
        t.ok(path);
        t.notEqual(p, path);
        t.end();
    });
});


test('create: ephemeral_sequential', function (t) {
    var opts = {
        flags: ['ephemeral', 'sequence']
    };
    CLIENT.create(helper.subdir, {}, opts, function (err, p) {
        t.ifError(err);
        t.ok(p);
        CLIENT.stat(p, function (err2, stat) {
            t.ifError(err2);
            t.ok(stat);
            t.ok((stat || {}).ephemeralOwner);
            t.end();
        });
    });
});


test('put not exists', function (t) {
    var obj = {
        hello: 'world'
    };
    CLIENT.put(helper.file, obj, function (err) {
        t.ifError(err);
        CLIENT.get(helper.file, function (err2, obj2) {
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
    CLIENT.put(helper.file, {foo: 'bar'}, function (err) {
        t.ifError(err);
        CLIENT.put(helper.file, obj, function (err2) {
            t.ifError(err2);
            CLIENT.get(helper.file, function (err3, obj2) {
                t.ifError(err3);
                t.deepEqual(obj, obj2);
                t.end();
            });
        });
    });
});


test('get', function (t) {
    var opts = {
        object: {
            hello: 'world'
        }
    };
    CLIENT.put(helper.file, opts, function (err) {
        t.ifError(err);
        CLIENT.get(helper.file, function (err2, obj) {
            t.ifError(err2);
            t.deepEqual(opts, obj);
            t.end();
        });
    });
});


test('readdir', function (t) {
    CLIENT.readdir(helper.root, function (err, children) {
        t.ifError(err);
        t.ok(children);
        t.equal(children.length, 1);
        t.equal(helper.dir.split('/').pop(), children[0]);
        t.end();
    });
});


test('update', function (t) {
    CLIENT.put(helper.file, {}, function (err) {
        t.ifError(err);
        var obj = {
            hello: 'world'
        };
        CLIENT.put(helper.file, obj, function (err2) {
            t.ifError(err2);
            CLIENT.get(helper.file, function (err3, obj2) {
                t.ifError(err3);
                t.deepEqual(obj, obj2);
                t.end();
            });
        });
    });
});


test('stat', function (t) {
    CLIENT.stat(helper.root, function (err, stat) {
        t.ifError(err);
        t.ok(stat);
        if (stat) {
            t.equal(typeof (stat.czxid), 'number');
            t.equal(typeof (stat.mzxid), 'number');
            t.equal(typeof (stat.pzxid), 'number');
            t.ok(stat.ctime instanceof Date);
            t.ok(stat.mtime instanceof Date);
        }
        t.end();
    });
});


test('unlink', function (t) {
    CLIENT.put(helper.file, {}, function (err) {
        t.ifError(err);
        CLIENT.unlink(helper.file, function (err2) {
            t.ifError(err2);
            CLIENT.get(helper.file, function (err3) {
                t.ok(err3);
                t.equal(err3.name, 'NO_NODE');
                t.end();
            });
        });
    });
});


test('getState', function (t) {
    t.equal(CLIENT.getState(), 'connected');
    t.end();
});


test('toString', function (t) {
    t.ok(CLIENT.toString());
    t.end();
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


test('error when closed', function (t) {
    CLIENT.readdir(helper.root, function (err) {
        t.ok(err);
        t.end();
    });
});
