// Copyright 2012 Mark Cavage <mcavage@gmail.com> All rights reserved.

var path = require('path');
var uuid = require('node-uuid');
var vasync = require('vasync');
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

var VOTER1;
var VOTER2;
var VOTER3;



///--- Tests

test('beforeClass', function(t) {
        try {
                ZK = zk.createClient({
                        pollInterval: 200,
                        log: LOG,
                        servers: [ {
                                host: (process.env.ZK_HOST || 'localhost'),
                                port: (process.env.ZK_PORT || 2181)
                        }],
                        timeout: 1000
                });
        } catch (e) {
                console.error(e.stack);
                process.exit(1);
        }

        ZK.on('connect', function () {
                ZK.mkdirp(DIR_PATH, function (err) {
                        if (err) {
                                console.error(err.stack);
                                process.exit(1);
                        }

                        t.end();
                });
        });
});

/**
 * Initial test, test that having 3 voters results in the expected chain of
 * leadership. e.g. 1<-2<-3
 */
test('reset state', function(t) {
        _resetState(function(err) {
                t.ifError(err);
                t.end();
        });
});

test('check voters', function(t) {
        t.ok(VOTER1.amLeader);
        VOTER1.isLeader(false, true, function(err, isLeader) {
                t.ok(isLeader);
        });
        t.notOk(VOTER2.amLeader);
        VOTER2.isLeader(false, true, function(err, isLeader, leader) {
                t.notOk(isLeader);
                t.equal(VOTER1.path.split('-')[1], leader.split('-')[1]);
        });
        t.notOk(VOTER3.amLeader);
        VOTER3.isLeader(false, true, function(err, isLeader, leader) {
                t.notOk(isLeader);
                t.equal(VOTER2.path.split('-')[1], leader.split('-')[1]);
        });
        t.equal(VOTER1.path.split('-')[1], VOTER2.leader.split('-')[1]);
        t.equal(VOTER2.path.split('-')[1], VOTER3.leader.split('-')[1]);
        t.end();
});

test('check uncached voter1', function(t) {
        VOTER1.isLeader(false, false, function(err, isLeader) {
                t.ok(isLeader);
                t.end();
        });
});

test('check uncached voter2', function(t) {
        VOTER2.isLeader(false, false, function(err, isLeader, leader) {
                t.notOk(isLeader);
                t.equal(VOTER1.path.split('-')[1], leader.split('-')[1]);
                t.end();
        });
});

test('check uncached voter3', function(t) {
        VOTER3.isLeader(false, false, function(err, isLeader, leader) {
                t.notOk(isLeader);
                t.equal(VOTER2.path.split('-')[1], leader.split('-')[1]);
                t.end();
        });
});

/**
 * Test the serial removal of v1, v2 and the addition of v1, v2.
 */
test('reset state' + uuid().substr(0,7), function(t) {
        // append uuid because nodeunit can't handle test funcs with the same
        // name.
        _resetState(function(err) {
                t.ifError(err);
                t.end();
        });
});

test('remove v1', function(t) {
        VOTER1.once('leader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER1.once('newLeader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER2.once('leader', function() {
                t.end();
        });

        VOTER2.once('newLeader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER3.once('leader', function() {
        });

        VOTER3.once('newLeader', function(leader) {
                t.ifError(true);
                t.end();
        });

        LOG.info('stopping voter1');
        VOTER1.stop();
});

test('remove v2', function(t) {
        VOTER1.once('leader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER1.once('newLeader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER2.once('leader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER2.once('newLeader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER3.once('leader', function() {
                t.end();
        });

        VOTER3.once('newLeader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER2.stop();
});

test('add v1 back', function(t) {
        VOTER1.once('leader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER1.once('newLeader', function(leader) {
                t.equal(VOTER3.path.split('-')[1], leader.split('-')[1]);
                t.end();
        });

        VOTER2.once('leader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER2.once('newLeader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER3.once('leader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER3.once('newLeader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER1.vote(function(err) {
                if (err) {
                        t.ifError(err);
                        t.end();
                }
        });
});

test('add v2 back', function(t) {
        VOTER1.once('leader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER1.once('newLeader', function(leader) {
                t.ifError(true);
                t.end();
        });

        VOTER2.once('leader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER2.once('newLeader', function(leader) {
                t.equal(VOTER1.path.split('-')[1], leader.split('-')[1]);
                t.end();
        });

        VOTER3.once('leader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER3.once('newLeader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER2.vote(function(err) {
                if (err) {
                        t.ifError(err);
                        t.end();
                }
        });
});

/**
 * Test removing the middle node in the election chain.
 */
test('reset state' + uuid().substr(0,7), function(t) {
        _resetState(function(err) {
                t.ifError(err);
                LOG.info('finished resetting state');
                t.end();
        });
});

test('remove v2 ' + uuid().substr(0,7), function(t) {
        VOTER1.once('leader', function() {
                LOG.error('emitter shouldn\'t fire');
                t.ifError(true);
                t.end();
        });

        VOTER1.once('newLeader', function(leader) {
                LOG.error('emitter shouldn\'t fire');
                t.ifError(true);
                t.end();
        });

        VOTER2.once('leader', function() {
                LOG.error('emitter shouldn\'t fire');
                t.ifError(true);
                t.end();
        });

        VOTER2.once('newLeader', function(leader) {
                LOG.error('emitter shouldn\'t fire');
                t.ifError(true);
                t.end();
        });

        VOTER3.once('leader', function() {
                LOG.error('emitter shouldn\'t fire');
                t.ifError(true);
                t.end();
        });

        VOTER3.once('newLeader', function(leader) {
                t.equal(VOTER1.path.split('-')[1], leader.split('-')[1]);
                t.end();
        });

        VOTER2.stop();
});

/**
 * Test removing the middle node and adding it back.
 */
test('reset state remove v2 ' + uuid().substr(0,7), function(t) {
        _resetState(function(err) {
                t.ifError(err);
                LOG.info('finished resetting state');
                t.end();
        });
});

test('add v2 ' + uuid().substr(0,7), function(t) {
        VOTER1.on('leader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER1.on('newLeader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER2.on('leader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER2.on('newLeader', function(leader) {
                t.equal(VOTER3.path.split('-')[1], leader.split('-')[1]);
                t.end();
        });

        VOTER3.on('leader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER3.on('newLeader', function() {
                t.ifError(true);
                t.end();
        });

        VOTER2.vote(function(err) {
                if (err) {
                        t.ifError(err);
                        t.end();
                }
        });
});

test('afterclass', function(t) {
        LOG.info({path: DIR_PATH}, 'after: cleaning up');
        ZK.on('close', function() {
                t.end();
        });
        ZK.close();
});

function _resetState(callback) {
        VOTER1 = zk.createGenericElection({
                client: ZK,
                path: DIR_PATH,
                log: LOG,
                object: {}
        });

        VOTER2 = zk.createGenericElection({
                client: ZK,
                path: DIR_PATH,
                log: LOG,
                object: {}
        });

        VOTER3 = zk.createGenericElection({
                client: ZK,
                path: DIR_PATH,
                log: LOG,
                object: {}
        });

        var tasks = [
                function closeZK(_, cb) {
                        ZK.close();
                        cb();
                },
                function newZk(_, cb) {
                        resetZK(cb);
                },
                function createV1(_, cb) {
                        VOTER1 = zk.createGenericElection({
                                client: ZK,
                                path: DIR_PATH,
                                log: LOG,
                                object: {}
                        });
                        cb();
                },
                function createV2(_, cb) {
                        VOTER2 = zk.createGenericElection({
                                client: ZK,
                                path: DIR_PATH,
                                log: LOG,
                                object: {}
                        });
                        cb();
                },
                function createV3(_, cb) {
                        VOTER3 = zk.createGenericElection({
                                client: ZK,
                                path: DIR_PATH,
                                log: LOG,
                                object: {}
                        });
                        cb();
                },
                function vote1(_, cb) {
                        VOTER1.vote(cb);
                },
                function vote2(_, cb) {
                        VOTER2.vote(cb);
                },
                function vote3(_, cb) {
                        VOTER3.vote(cb);
                }
        ];

        vasync.pipeline({funcs: tasks}, function (err) {
                if (err) {
                        LOG.error('error resetting state');
                }
                return callback(err);
        });

        function resetZK(_callback) {
                try {
                        ZK = zk.createClient({
                                log: LOG,
                                servers: [ {
                                        host: (process.env.ZK_HOST ||
                                               'localhost'),
                                        port: (process.env.ZK_PORT || 2181)
                                }],
                                timeout: 1000,
                                pollInterval: 200
                        });
                } catch (e) {
                        console.error(e.stack);
                        process.exit(1);
                }

                ZK.on('connect', function () {
                        ZK.mkdirp(DIR_PATH, function (err) {
                                if (err) {
                                        console.error(err.stack);
                                        process.exit(1);
                                }

                                _callback();
                        });
                });
        }

}
