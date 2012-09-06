// Copyright (c) 2012, Mark Cavage. All rights reserved.

var EventEmitter = require('events').EventEmitter;
var path = require('path');
var util = require('util');

var assert = require('assert-plus');
var vasync = require('vasync');

var ZKError = require('./error').ZKError;



///--- Globals

var sprintf = util.format;



///--- API

function Election(options) {
        assert.object(options, 'options');
        assert.object(options.client, 'options.client');
        assert.object(options.object, 'options.object');
        assert.string(options.path, 'options.path');

        EventEmitter.call(this);

        this.client = options.client;
        this.data = JSON.stringify(options.object);
        this.log = options.log || this.client.log;
        this.parent = path.normalize(options.path);
        // optional pathPrefix of the znode
        this.pathPrefix = options.pathPrefix;
        this.znode = null;
}
util.inherits(Election, EventEmitter);


Election.prototype.getLeader = function getLeader(callback) {
        assert.func(callback, 'callback');

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
                        nodes.sort(compare);
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
                                        nodes.shift();
                                        callback(null, l, obj, nodes);
                                }
                        });
                }
        });
};


Election.prototype.isLeader = function isLeader(callback) {
        assert.func(callback, 'callback');

        var self = this;
        this.getLeader(function (err, leader, obj, nodes) {
                if (err) {
                        callback(err);
                } else {
                        var _isLeader = (leader === self.znode);
                        if (_isLeader) {
                                callback(null, _isLeader, nodes);
                        } else {
                                callback(null, _isLeader, obj);
                        }
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
                self.path = null;
                self.watcher = null;
                self.znode = null;
                self.removeAllListeners('leader');
                self.removeAllListeners('newLeader');
                process.nextTick(function () {
                        self.removeAllListeners('close');
                        self.removeAllListeners('error');
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
        assert.func(callback, 'callback');

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
                        var _path;
                        if (self.pathPrefix) {
                                _path = self.parent + '/' +
                                        self.pathPrefix + '-';
                        } else {
                                _path = self.parent + '/-';
                        }
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
        assert.func(callback, 'callback');

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
                                children.shift();
                                self.emit('leader', children);
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



///--- Privates

/**
 * Compares two lock paths.
 * @param {string} a the lock path to compare.
 * @param {string} b the lock path to compare.
 * @return {int} Positive int if a is bigger, 0 if a, b are the same, and
 * negative int if a is smaller.
 */
function compare(a, b) {
        var seqA = parseInt(a.substring(a.lastIndexOf('-') + 1), 10);
        var seqB = parseInt(b.substring(b.lastIndexOf('-') + 1), 10);

        return (seqA - seqB);
}
