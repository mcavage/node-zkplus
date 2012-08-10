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

var VOTER1;
var VOTER2;
var VOTER3;



///--- Tests

before(function (callback) {
        try {
                ZK = zk.createClient({
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

                        callback();
                });
        });
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

test('create voters', function(t) {

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

        t.done();
});

test('elect v1', function(t) {
        VOTER1.on('leader', function() {
                LOG.error('i am leader %s', voter.znode);
                t.done();
        });

        VOTER1.on('newLeader', function(leader) {
                LOG.error('should not be newleader');
                var error = new Error('node should never be leader');
                t.ifError(error);
                t.done();
        });

        VOTER1.vote(function(err) {
                t.ifError(err);
                if (err) {
                        t.done();
                }
                LOG.error('voted');
        });
});

//test('election', function(t) {
        //var voter = zk.createGenericElection({
                //client: zk.createClient({
                        //log: LOG,
                        //servers: [ {
                                //host: (process.env.ZK_HOST ||
                                //'localhost'),
                                //port: (process.env.ZK_PORT || 2181)
                        //}],
                        //timeout: 1000
                //}),
                //path: DIR_PATH,
                //log: LOG,
                //object: {}
        //});

        //voter.on('error', function(err) {
                //t.ifError(err);
        //});

        //var v1Leader = false;
        //voter.on('leader', function() {
                //v1Leader = true;
                //LOG.error('i am leader %s', voter.znode);
        //});

        //voter.on('newLeader', function(leader) {
                //var error = new Error('node should never be leader');
                //t.ifError(error);
        //});

        //// second voter
        //var voter2 = zk.createGenericElection({
                //client: zk.createClient({
                        //log: LOG,
                        //servers: [ {
                                //host: (process.env.ZK_HOST ||
                                //'localhost'),
                                //port: (process.env.ZK_PORT || 2181)
                        //}],
                        //timeout: 1000
                //}),
                //path: DIR_PATH,
                //log: LOG,
                //object: {}
        //});

        //voter2.on('error', function(err) {
                //t.ifError(err);
        //});

        //var v2Leader = false;
        //voter2.on('leader', function() {
                //LOG.error('i am leader %s', voter2.znode);
                //v2Leader = true;
                //t.ok(v1Leader);

        //});

        //var v2NewLeader = false;
        //voter2.on('newLeader', function(leader) {
                //LOG.error('i am %s my new leader is %s', voter2.znode, leader);
                //t.equal(leader, '-0000000000');
                //t.equal(false, v2NewLeader);
                //v2NewLeader = true;
        //});

        //// third voter
        //var voter3 = zk.createGenericElection({
                //client: zk.createClient({
                        //log: LOG,
                        //servers: [ {
                                //host: (process.env.ZK_HOST ||
                                //'localhost'),
                                //port: (process.env.ZK_PORT || 2181)
                        //}],
                        //timeout: 1000
                //}),
                //path: DIR_PATH,
                //log: LOG,
                //object: {}
        //});

        //voter3.on('error', function(err) {
                //t.ifError(err);
        //});

        //var v3Leader = false;
        //voter3.on('leader', function() {
                //LOG.error('i am leader %s', voter3.znode);
                //t.equal(false, v3Leader);
                //t.ok(v1Leader);
                //t.ok(v2Leader);
                //v3Leader = true;
                //t.end();
        //});

        //var v3NewLeader = false;
        //voter3.on('newLeader', function(leader) {
                //LOG.error('i am %s my new leader is %s', voter3.znode, leader);
                //t.equal(leader, '-0000000001');
                //v3NewLeader = true;
        //});

        //voter.vote(function(err) {
                //t.ifError(err);
                //if (err) {
                        //LOG.error({err:err});
                        //process.exit(1);
                //}
        //});

        //voter2.vote(function(err) {
                //t.ifError(err);
                //if (err) {
                        //LOG.error({err:err});
                        //process.exit(1);
                //}
        //});

        //voter3.vote(function(err) {
                //t.ifError(err);
                //if (err) {
                        //LOG.error({err:err});
                        //process.exit(1);
                //}
        //});
//});
