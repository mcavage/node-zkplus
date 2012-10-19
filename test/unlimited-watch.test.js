// Copyright 2012 Mark Cavage <mcavage@gmail.com> All rights reserved.

var uuid = require('node-uuid');

var zk = require('../lib');
var async = require('async');

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
var ZK;

var HOST = process.env.ZK_HOST || 'localhost';
var PORT = parseInt(process.env.ZK_PORT, 10) || 2181;



///--- Tests

before(function (callback) {
        try {
                ZK = zk.createClient({
                        log: helper.createLogger('zk.client.test.js'),
                        servers: [ {
                                host: HOST,
                                port: PORT
                        }]
                });
                ZK.connect(callback);
        } catch (e) {
                console.error(e.stack);
                process.exit(1);
        }
});


after(function (callback) {
        ZK.rmr(ROOT, function (err) {
                ZK.on('close', callback);
                ZK.close();
        });
});


test('watching on a non created node', function (t) {
        var callcount = 0;
        var watch = ZK.uwatch(FILE, function (err, data) {
                callcount++;
                watch.stop();
                t.equal(null, err);
                t.equal(undefined, data);
                // we ensure that when we call .stop() we do not get more events
                t.equal(1, callcount);
        });

        var expected = {iam: 'anobject'};
        async.series([
                ZK.mkdirp.bind(ZK, FILE),
                ZK.put.bind(ZK, FILE, expected),
                // Edge case! We remove the path before the watched path
                ZK.rmr.bind(ZK, PATH),
                ZK.mkdirp.bind(ZK, FILE),
                ZK.put.bind(ZK, FILE, expected),
                ZK.rmr.bind(ZK, FILE)
        ], t.end);
});

test('watching on a non created node and creating it', function (t) {
        var
                callcount = 0,
                expected = {iam: 'anobject'};

        ZK.uwatch(FILE, function (err, data) {
                // console.log(callcount, err, data);
                switch (callcount) {
                        case 0:
                                t.equal(null, err);
                                t.equal(undefined, data);
                        break;
                        case 1:
                                t.equal(null, err);
                                // zkplus stores an empty object when you do not provide
                                // data when creating a node
                                t.deepEqual({}, data);
                        break;
                        case 2:
                                t.equal(null, err);
                                t.deepEqual(expected, data);
                        break;
                        case 3:
                                t.equal(null, err);
                                t.equal(undefined, data);
                        break;
                        case 4:
                                t.equal(null, err);
                                t.deepEqual({}, data);
                        break;
                        case 5:
                                t.equal(null, err);
                                t.deepEqual(expected, data);
                        break;
                        case 6:
                                t.equal(null, err);
                                t.equal(undefined, data);
                        break;
                        default:
                                /* I love jslint */
                        break;
                }

                if (callcount === 6) {
                        t.end();
                }

                callcount++;
        });

        async.series([
                ZK.mkdirp.bind(ZK, FILE),
                ZK.put.bind(ZK, FILE, expected),
                // Edge case! We remove the path before the watched path
                ZK.rmr.bind(ZK, PATH),
                ZK.mkdirp.bind(ZK, FILE),
                ZK.put.bind(ZK, FILE, expected),
                ZK.rmr.bind(ZK, FILE)
        ], function (err) {
                if (err !== null) {
                        console.log(err);
                }
        });
});
