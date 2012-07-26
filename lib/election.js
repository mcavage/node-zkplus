// Copyright (c) 2012, Mark Cavage. All rights reserved.

var EventEmitter = require('events').EventEmitter;
var path = require('path');
var util = require('util');

var vasync = require('vasync');

var assert = require('./assert');
var ZKError = require('./error').ZKError;



///--- Globals

var assertFunction = assert.assertFunction;
var assertObject = assert.assertObject;
var assertString = assert.assertString;

var sprintf = util.format;



///--- API

function Election(options) {
        assertObject('options', options);
        assertObject('options.client', options.client);
        assertObject('options.log', options.log);
        assertObject('options.object', options.object);
        assertString('options.path', options.path);

        EventEmitter.call(this);

        this.client = options.client;
        this.data = JSON.stringify(options.object);
        this.log = options.log;
        this.parent = path.normalize(options.path);
        this.znode = null;
}
util.inherits(Election, EventEmitter);


Election.prototype.getLeader = function getLeader(callback) {
        assertFunction('callback', callback);

        var log = this.log;
        var self = this;

        log.trace({
                parent: self.parent,
                znode: self.znode
        }, 'election.getLeader: entered');
        this.client.readdir(this.parent, function (err, nodes) {
                if (err) {
                        log.trace({
                                parent: self.parent,
                                znode: self.znode,
                                err: err
                        }, 'election.getLeader: error');
                        callback(err);
                } else {
                        nodes.sort();
                        log.trace({
                                parent: self.parent,
                                znode: self.znode,
                                nodes: nodes
                        }, 'election.getLeader: nodes retrieved');
                        var l = nodes[0];
                        var p = self.parent + '/' + l;
                        self.client.get(p, function (err2, obj) {
                                if (err2) {
                                        callback(err2);
                                } else {
                                        log.trace({
                                                parent: self.parent,
                                                znode: self.znode,
                                                leader: l,
                                                nodes: nodes,
                                                obj: obj
                                        }, 'election.getLeader: done');
                                        callback(null, l, obj);
                                }
                        });
                }
        });
};


Election.prototype.isLeader = function isLeader(callback) {
        assertFunction('callback', callback);
        var self = this;
        this.getLeader(function (err, leader) {
                if (err) {
                        callback(err);
                } else {
                        callback(null, (leader === self.znode));
                }
        });
};


Election.prototype.stop = function stop() {
        var log = this.log;
        var self = this;

        log.trace({
                parent: self.parent,
                path: self.path,
                znode: self.znode
        }, 'election: stop entered');

        function _stop() {
                process.nextTick(function () {
                        self.path = null;
                        self.watcher = null;
                        self.znode = null;
                        self.removeAllListeners('close');
                        self.removeAllListeners('error');
                        self.removeAllListeners('leader');
                        self.removeAllListeners('newLeader');
                });
        }

        if (this.watcher)
                this.watcher.stop();

        if (this.path) {
                this.client.rmr(this.path, function (err) {
                        if (err) {
                                log.trace({
                                        parent: self.parent,
                                        znode: self.znode,
                                        err: err
                                }, 'election.stop: unable to clean up');
                                self.emit('error', err);
                        } else {
                                log.trace({
                                        parent: self.parent,
                                        znode: self.znode
                                }, 'election.stop: done');
                                self.emit('close');
                        }
                        _stop();
                });
        } else {
                self.emit('close');
                _stop();
        }
};


Election.prototype.toString = function toString() {
        var str = '[object Election <';
        str += sprintf('parent=%s,', this.parent);
        str += sprintf('path=%s,', (this.path || 'null'));
        str += sprintf('znode=%s', (this.znode || 'null'));
        str += '>]';
        return (str);
};


Election.prototype.vote = function vote(callback) {
        assertFunction('callback', callback);

        var client = this.client;
        var log = this.log;
        var self = this;

        var tasks = [
                function mkdir(_, cb) {
                        client.mkdirp(self.parent, cb);
                },
                function _vote(_, cb) {
                        var opts = {
                                flags: ['ephemeral', 'sequence'],
                                data: self.data
                        };
                        var _path = self.parent + '/';
                        client.create(_path, opts, function (err, p) {
                                if (err) {
                                        log.trace({
                                                parent: self.parent,
                                                err: err
                                        }, 'election.vote: error in creat');
                                        cb(err);
                                } else {
                                        self.path = p;
                                        self.znode = p.split('/').pop();
                                        log.trace({
                                                parent: self.parent,
                                                path: self.path,
                                                znode: self.znode
                                        }, 'election.vote: znode set');
                                        cb();
                                }
                        });
                }
        ];

        log.trace({parent: self.parent}, 'election.vote: entered');
        vasync.pipeline({funcs: tasks}, function (err) {
                if (err) {
                        log.trace({
                                parent: self.parent,
                                err: err
                        }, 'election.vote: error');
                        callback(err);
                } else {
                        log.trace({
                                parent: self.parent,
                                znode: self.znode
                        }, 'election.vote: registered; checking if leader');
                        self.isLeader(callback);
                }
        });
};


Election.prototype.watch = function watch(callback) {
        assertFunction('callback', callback);

        var log = this.log;
        var self = this;

        log.trace({
                parent: self.parent,
                znode: self.znode
        }, 'election.watch: entered');

        var opts = {
                method: 'list'
        };
        this.client.watch(self.parent, opts, function (err, watcher) {
                if (err) {
                        log.trace({
                                parent: self.parent,
                                znode: self.znode,
                                err: err
                        }, 'election.watch: error setting watch');
                        return (callback(err));
                }

                log.trace({
                        parent: self.parent,
                        znode: self.znode
                }, 'election.watch: watch set');
                self.watcher = watcher;

                watcher.on('error', function onError(err2) {
                        log.trace({
                                parent: self.parent,
                                znode: self.znode,
                                err: err2
                        }, 'election.watch: error event');
                        self.emit('error', err2);
                });

                watcher.on('children', function onChildren(children) {
                        var leader = children[0];
                        log.trace({
                                children: children,
                                parent: self.parent,
                                znode: self.znode,
                                leader: leader
                        }, 'election.watch: children event');

                        if (self.znode === leader) {
                                self.emit('leader');
                        } else if (leader) {
                                self.emit('newLeader', leader);
                        }
                });

                return (callback(null));
        });
};



///--- Exports

module.exports = {
        Election: Election
};
