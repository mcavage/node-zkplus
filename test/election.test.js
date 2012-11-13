// Copyright 2012 Mark Cavage <mcavage@gmail.com> All rights reserved.

var path = require('path');
var uuid = require('node-uuid');

var zk = require('../lib');

if (require.cache[__dirname + '/helper.js'])
        delete require.cache[__dirname + '/helper.js'];
var helper = require('./helper.js');



///--- Globals

var after = helper.after;
var before = helper.before;
var test = helper.test;

var LOG = helper.createLogger('election.test.js');
var DIR_PATH = '/' + uuid().substr(0, 7);
var PATH = uuid().substr(0, 7);
var ZK;

var HOST = process.env.ZK_HOST || 'localhost';
var PORT = parseInt(process.env.ZK_PORT, 10) || 2181;



///--- Tests

before(function (callback) {
        try {
                ZK = zk.createClient({
                        connectTimeout: false,
                        log: LOG,
                        servers: [ {
                                host: HOST,
                                port: PORT
                        }],
                        timeout: 1000
                });
        } catch (e) {
                console.error(e.stack);
                process.exit(1);
        }

        ZK.once('connect', function () {
                ZK.mkdirp(DIR_PATH, function (err) {
                        if (err) {
                                console.error(err.stack);
                                process.exit(1);
                        }

                        callback();
                });
        });
        ZK.connect();
});


after(function (callback) {
        LOG.trace({path: DIR_PATH}, 'after: cleaning up');
        ZK.rmr(DIR_PATH, function (err) {
                if (err) {
                        console.error('Unable to clean up %s', DIR_PATH);
                        process.exit(1);
                }
                ZK.on('close', callback);
                ZK.close();
        });
});



test('election', function (t) {
        var leader = null;
        var ready = 0;
        var voters = [];

        function watch() {
                var watching = 0;
                voters.forEach(function (v) {
                        v.watch(function (err) {
                                t.ifError(err);
                                if (++watching === voters.length)
                                        newLeader();
                        });
                });
        }

        function newLeader() {
                // The logic below acts to have leaders commit seppuku
                // in order
                var newLeaderSeen = 0;
                var stopped = 0;
                voters.forEach(function (v) {
                        v.on('leader', function () {
                                v.on('close', function () {
                                        if (++stopped === voters.length) {
                                                t.equal(newLeaderSeen, 1);
                                                t.end();
                                        }
                                });
                                v.stop();
                        });

                        v.on('newLeader', function (l) {
                                newLeaderSeen++;
                                t.ok(l);
                        });
                });
                leader.stop();
        }

        for (var i = 0; i < 3; i++) {
                voters.push(zk.createElection({
                        client: ZK,
                        path: DIR_PATH,
                        log: LOG,
                        object: {
                                node: i
                        }
                }));
        }

        var leaderIndex;
        voters.forEach(function (v, index) {
                v.vote(function (err, isLeader) {
                        t.ifError(err);
                        if (isLeader) {
                                t.equal(leader, null);
                                leader = voters[index];
                                leaderIndex = index;
                        }

                        if (++ready === 3) {
                                t.notEqual(leader, null);
                                voters.splice(leaderIndex, 1);
                                watch();
                        }
                });
        });
});


test('election with prefix', function (t) {
        var leader = null;
        var ready = 0;
        var voters = [];

        function watch() {
                var watching = 0;
                voters.forEach(function (v) {
                        v.watch(function (err) {
                                t.ifError(err);
                                if (++watching === voters.length)
                                        newLeader();
                        });
                });
        }

        function newLeader() {
                // The logic below acts to have leaders commit seppuku
                // in order
                var newLeaderSeen = 0;
                var stopped = 0;
                voters.forEach(function (v) {
                        v.on('leader', function () {
                                v.on('close', function () {
                                        if (++stopped === voters.length) {
                                                t.equal(newLeaderSeen, 1);
                                                t.end();
                                        }
                                });
                                v.stop();
                        });

                        v.on('newLeader', function (l) {
                                newLeaderSeen++;
                                t.ok(l);
                        });
                });
                leader.stop();
        }

        for (var i = 0; i < 3; i++) {
                voters.push(zk.createElection({
                        client: ZK,
                        path: DIR_PATH,
                        pathPrefix: PATH,
                        log: LOG,
                        object: {
                                node: i
                        }
                }));
        }

        var leaderIndex;
        voters.forEach(function (v, index) {
                v.vote(function (err, isLeader) {
                        t.ifError(err);
                        if (isLeader) {
                                t.equal(leader, null);
                                leader = voters[index];
                                leaderIndex = index;
                        }

                        if (++ready === 3) {
                                t.notEqual(leader, null);
                                voters.splice(leaderIndex, 1);
                                watch();
                        }
                });
        });
});
