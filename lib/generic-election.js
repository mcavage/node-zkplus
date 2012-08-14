var assert = require('assert-plus');
var EventEmitter = require('events').EventEmitter;
var path = require('path');
var util = require('util');

var vasync = require('vasync');

var ZKError = require('./error').ZKError;

function Election(options) {
        assert.object(options, 'options');
        assert.object(options.client, 'options.client');
        assert.object(options.object, 'options.object');
        assert.string(options.path, 'options.path');

        EventEmitter.call(this);

        this.amLeader = null;
        this.leader = null;
        this.nodes = null;
        this.cacheState = options.cacheState || true;
        this.client = options.client;
        this.data = JSON.stringify(options.object);
        this.log = options.log || this.client.log;
        this.parent = path.normalize(options.path);
        // optional pathPrefix of the znode
        this.pathPrefix = options.pathPrefix;
        this.znode = null;
        // full path of the znode
        this.path = null;
}
util.inherits(Election, EventEmitter);


/**
 * @param {boolean} whether to set a watch on the leader.
 * @param {boolean} whether to return the cached state.
 * @param {function} callback The callback of the form f(err, isLeader, context)
 * where context is either the nodes in the election if leader, or the leader if
 * not leader.
 */
Election.prototype.isLeader = function isLeader(watch, cached, callback) {
        assert.func(callback, 'callback');
        var self = this;
        var log = self.log;

        log.trace({
                callback: callback,
                watch: watch,
                parent: self.parent,
                znode: self.znode
        }, 'election.isLeader: entered');

        if (cached && self.amLeader !== null) {
                return callback(null, self.amLeader,
                                self.amLeader ? null : self.leader);
        }
        _getLeader(self, function (err, leader, obj, nodes) {
                if (err) {
                        callback(err);
                } else {
                        self.amLeader = (leader === self.znode);
                        if (self.amLeader) {
                                self.leader = leader;
                                self.amLeader = true;
                                log.trace({
                                        peers: nodes,
                                        leader: self.leader,
                                        znode: self.znode
                                }, 'i am leader');
                                callback(null, true, nodes);
                        } else {
                                self.amLeader = false;
                                var leaderIndex = nodes.indexOf(self.znode) - 1;
                                self.leader = nodes[leaderIndex];
                                log.trace({
                                        peers: nodes,
                                        leader: self.leader,
                                        leaderIndex: leaderIndex,
                                        znode: self.znode
                                }, 'election.isLeader: not leader');
                                if (watch) {
                                        log.trace('election.isLeader: ' +
                                                  ' watching leader');
                                        self.watch(function (err) {
                                                if (err) {
                                                        callback(err);
                                                } else {
                                                        callback(null, false,
                                                        self.leader);
                                                }
                                        });
                                } else {
                                        callback(null, false, self.leader);
                                }
                        }
                }
        });
};

Election.prototype.vote = function vote(callback) {
        assert.func(callback, 'callback');

        var client = this.client;
        var log = this.log;
        var self = this;

        log.trace({
                parent: self.parent,
                pathPrefix: self.pathPrefix,
                amLeader: self.amLeader
        }, 'election.vote: entered');
        var tasks = [
                function mkdir(_, cb) {
                        log.trace({
                                parent: self.parent,
                        }, 'mkdir -p');
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
                                var _path = self.parent + '/-';
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
                },
                function _isLeader(_, cb) {
                        self.isLeader(true, false,
                                      function (err, isLeader, context)
                        {
                                if (err) {
                                        log.trace({
                                                parent: self.parent,
                                                err: err
                                        }, 'election.vote: error in isLeader');
                                        cb(err);
                                } else {
                                        log.trace({
                                                parent: self.parent,
                                                path: self.path,
                                                znode: self.znode,
                                                isLeader: self.amLeader,
                                                context: context
                                        }, 'election.vote: determined leader');
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
                        callback();
                        if (self.amLeader) {
                                self.emit('leader', self);
                        } else {
                                self.emit('newLeader', self.leader, self);
                        }
                }
        });
};

Election.prototype.watch = function watch(callback) {
        assert.func(callback, 'callback');

        var log = this.log;
        var self = this;

        var _path = self.parent + '/' + self.leader;

        log.trace({
                path: _path,
                parent: self.parent,
                leader: self.leader,
                znode: self.znode
        }, 'election.watch: entered');

        var opts = {};
        this.client.watch(_path, opts, function (err, watcher) {
                if (err) {
                        log.trace({
                                path: self.path,
                                parent: self.parent,
                                znode: self.znode,
                                err: err
                        }, 'election.watch: error setting watch');
                        return (callback(err));
                }

                log.trace({
                        path: self.path,
                        parent: self.parent,
                        znode: self.znode
                }, 'election.watch: watch set');
                self.watcher = watcher;

                watcher.on('error', function onError(err2) {
                        log.trace({
                                path: self.path,
                                parent: self.parent,
                                znode: self.znode,
                                err: err2
                        }, 'election.watch: error event');
                        watcher.stop();
                        self.emit('error', err2);
                });

                watcher.on('delete', function onWatch(event) {
                        log.trace({
                                event: event,
                                parent: self.parent,
                                znode: self.znode,
                                leader: self.leader
                        }, 'election.watch: delete event');
                        watcher.stop();
                        self.isLeader(true, false,
                                      function (err, isLeader, context)
                        {
                                if (err) {
                                        log.trace({
                                                path: self.path,
                                                parent: self.parent,
                                                znode: self.znode,
                                                err: err
                                        }, 'election.watch: error event');
                                        self.emit('error', err);
                                }
                                if (isLeader) {
                                        log.trace({
                                                parent: self.parent,
                                                znode: self.znode,
                                                leader: self.leader
                                        },
                                        'election.watch: emiting leader event');
                                        self.emit('leader');
                                } else {
                                        log.trace({
                                                parent: self.parent,
                                                znode: self.znode,
                                                leader: self.leader
                                        }, 'election.watch: emiting new' +
                                        ' leader event');
                                        self.emit('newLeader', self.leader);
                                }
                        });
                });

                return (callback(null));
        });
};

Election.prototype.stop = function stop() {
        var log = this.log;
        var self = this;

        log.trace({
                parent: self.parent,
                path: self.path,
                znode: self.znode,
                leader: self.leader,
                amLeader: self.amLeader
        }, 'election: stop entered');

        function _stop() {
                self.path = null;
                self.watcher = null;
                self.znode = null;
                self.amLeader = null;
                self.leader = null;
                self.removeAllListeners('leader');
                self.removeAllListeners('newLeader');
                // remove error and close listeners after they have been fired
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

function _getLeader(self, callback) {
        assert.func(callback, 'callback');

        var log = self.log;

        log.trace({
                parent: self.parent,
                znode: self.znode
        }, 'election.getLeader: entered');
        self.client.readdir(self.parent, function (err, nodes) {
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
                                        callback(null, l, obj, nodes);
                                }
                        });
                }
        });
};
