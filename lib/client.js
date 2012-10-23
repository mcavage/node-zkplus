// Copyright (c) 2012, Mark Cavage. All rights reserved.

var EventEmitter = require('events').EventEmitter;
var path = require('path');
var util = require('util');

var assert = require('assert-plus');
var vasync = require('vasync');
var ZK = require('zookeeper');

var ZKError = require('./error').ZKError;



///--- Globals

var sprintf = util.format;



///--- Helpers

function translateEvent(event) {
        var e;

        switch (event) {
        case ZK.ZOO_CREATED_EVENT:
                e = 'create';
                break;
        case ZK.ZOO_DELETED_EVENT:
                e = 'delete';
                break;
        case ZK.ZOO_CHANGED_EVENT:
                e = 'change';
                break;
        case ZK.ZOO_CHILD_EVENT:
                e = 'child';
                break;
        case ZK.ZOO_SESSION_EVENT:
                e = 'session';
                break;
        case ZK.ZOO_NOTWATCHING_EVENT:
                e = 'nowatch';
                break;
        default:
                e = 'unknown';
                break;
        }

        return (e);
}



///--- API

function ZKClient(options) {
        assert.object(options, 'options');
        assert.object(options.log, 'options.log');
        assert.arrayOfObject(options.servers, 'options.servers');
        assert.optionalNumber(options.pollInterval, 'options.pollInterval');
        assert.optionalNumber(options.timeout, 'options.timeout');

        EventEmitter.call(this);

        var _connect = [];
        var self = this;

        this.autoReconnect = options.autoReconnect;
        this.connectTimeout = (options.connectTimeout !== undefined ?
                               options.connectTimeout : 2000);
        this.log = options.log.child({component: 'ZKPlus'}, true);
        this.pollInterval = options.pollInterval || 0;
        this.pollIntervalId = null;
        this.port = options.port;
        this.servers = [];
        this.timeout = options.timeout;
        this.watchers = [];

        options.servers.forEach(function (s) {
                assert.string(s.host, 'host');
                assert.number(s.port, 'port');
                self.servers.push({
                        host: s.host,
                        port: s.port
                });
                _connect.push(sprintf('%s:%d', s.host, s.port));
        });

        this.zookeeperOptions = {
                connect: _connect.join(','),
                timeout: self.timeout,
                debug_level: process.env.ZK_LOG_LEVEL ||
                             ZK.ZOO_LOG_LEVEL_WARNING,
                host_order_deterministic: false
        };

        this.zk = new ZK(this.zookeeperOptions);

        if (options.connect)
                this.connect();

        this.zk.once('close', this.onClose.bind(this));
}
util.inherits(ZKClient, EventEmitter);


ZKClient.prototype.onClose = function onClose() {
        if (this.pollIntervalId)
                clearInterval(this.pollIntervalId);

        var log = this.log;
        if (this.closedByClient) {
                this.closedByClient = false;
                log.debug('zookeeper session closed by caller');
                this.emit('close');
        } else {
                // the session has expired:
                // It means that a disconnection has taken more
                // than the timeout value.
                // So In this case, the servers have stopped the session and
                // all the watchers are inactive. The client is a zombie.
                // http://outerthought.org/blog/435-ot.html
                // http://wiki.apache.org/hadoop/ZooKeeper/FAQ#A3
                log.warn('session expired');

                //remove all the watchers.
                this.watchers.forEach(function (w) {
                        w.stop();
                });

                if (this.autoReconnect) {
                        //We try to create a new connection
                        log.debug('Auto reconnection');
                        this.reconnect();
                } else {
                        log.debug('emitting session_expired');
                        this.emit('session_expired');
                }
        }
};


// To reset a new session, we have to create a new ZK client
// We can't reuse the same ZKClient
ZKClient.prototype.reconnect = function reconnect() {
        this.zk = new ZK(this.zookeeperOptions);

        this.watchers = [];
        this.connect();
        this.zk.once('close', this.onClose.bind(this));
};


ZKClient.prototype.connect = function connect(callback) {
        if (callback) {
                assert.func(callback, 'callback');
        } else {
                callback = function () {};
        }

        var connectTimeout = this.connectTimeout;
        var log = this.log;
        var self = this;
        var timer;
        var zk = this.zk;

        switch (this.getState()) {
        case 'connecting':
        case 'associating':
                function onError(err) {
                        self.removeListener('connect', onConnect);
                        callback(err);
                }

                function onConnect() {
                        self.removeListener('error', onError);
                        callback(null);
                }

                this.once('error', onError);
                this.once('connect', onConnect);
                return (undefined);

        case 'connected':
                process.nextTick(callback);
                return (undefined);

        default:
                break;
        }

        if (connectTimeout !== false) {
                timer = setTimeout(function onConnectTimeout() {
                        if (self.getState() !== 'connected') {
                                self.emit('error',
                                          new ZKError(ZK.ZSYSTEMERROR,
                                                      'connect timeout (' +
                                                      connectTimeout +
                                                      'ms)'));
                        }
                }, connectTimeout);
                timer.stack = new Error().stack;
        }

        log.trace('connecting');
        zk.connect(function connectCallback(err) {
                clearTimeout(timer);

                if (err) {
                        log.error(err, 'unable to connect');
                        var e = new ZKError(ZK.ZCONNECTIONLOSS, err.message);
                        self.emit('error', e);
                        callback(e);
                } else {
                        log.trace('connected');
                        self.pollState();
                        self.emit('connect');
                        callback(null);
                }
        });
        return (undefined);
};


ZKClient.prototype.close = function close() {
        this.log.trace('closing');
        this.closedByClient = true;
        this.zk.close();
};


ZKClient.prototype.create = function creat(p, options, callback) {
        assert.string(p, 'path');
        if (typeof (options) === 'function') {
                callback = options;
                options = {};
        }
        assert.object(options, 'options');
        assert.arrayOfString(options.flags || [], 'options.flags');
        assert.func(callback, 'callback');

        var data = options.data || JSON.stringify(options.object || {});
        var flags = 0;
        var log = this.log;
        var zk = this.zk;

        log.trace({path: p, options: options}, 'creat: entered');

        (options.flags || []).forEach(function (f) {
                switch (f) {
                case 'ephemeral':
                        flags = flags | ZK.ZOO_EPHEMERAL;
                        break;
                case 'sequence':
                        flags = flags | ZK.ZOO_SEQUENCE;
                        break;
                default:
                        break;
                }
        });

        zk.a_create(path.normalize(p), data, flags, function (rc, msg, _path) {
                if (rc !== 0) {
                        var err = new ZKError(rc, msg);
                        log.trace({path: p, err: err}, 'creat: error');
                        callback(err);
                } else {
                        log.trace({path: p, _path: _path}, 'creat: complete');
                        callback(null, _path);
                }
        });
};
ZKClient.prototype.creat = ZKClient.prototype.create;

ZKClient.prototype.get = function get(p, callback) {
        assert.string(p, 'path');
        assert.func(callback, 'callback');

        var log = this.log;
        var zk = this.zk;

        log.trace({path: p}, 'get: entered');
        zk.a_get(path.normalize(p), false, function (rc, msg, _, data) {
                if (rc !== 0) {
                        var err = new ZKError(rc, msg);
                        log.trace({path: p, err: err}, 'get: error');
                        return (callback(err));
                }

                var obj;
                try {
                        obj = JSON.parse(data);
                } catch (e) {
                        return (callback(e));
                }

                log.trace({path: p, obj: obj}, 'get: done');
                return (callback(null, obj));
        });
};


ZKClient.prototype.getState = function getState() {
        var state;

        switch (this.zk.state) {
        case ZK.ZOO_EXPIRED_SESSION_STATE:
                state = 'expiredSession';
                break;
        case ZK.ZOO_AUTH_FAILED_STATE:
                state = 'authFailed';
                break;
        case ZK.ZOO_CONNECTING_STATE:
                state = 'connecting';
                break;
        case ZK.ZOO_ASSOCIATING_STATE:
                state = 'associating';
                break;
        case ZK.ZOO_CONNECTED_STATE:
                state = 'connected';
                break;
        default:
                state = 'unknown';
                break;
        }

        return (state);
};


ZKClient.prototype.mkdirp = function mkdirp(p, callback) {
        assert.string(p, 'path');
        assert.func(callback, 'callback');

        var dirs = path.normalize(p).split('/').slice(1);
        var log = this.log;
        var self = this;
        var tasks = [];

        log.trace({path: p}, 'mkdirp: entered');
        dirs.forEach(function (d, i) {
                var tmp = dirs.slice(0, i).join('/');
                var dir = path.normalize(sprintf('/%s/%s', tmp, d));
                var exists = false;

                tasks.push(function checkIfExists(_, cb) {
                        log.trace('mkdirp: checking %s', dir);
                        self.stat(dir, function (err, _stat) {
                                if (err && err.code !== ZK.ZNONODE) {
                                        cb();
                                }
                                exists = _stat ? true : false;
                                log.trace('mkdirp: %s exists= ', dir, exists);
                                cb();
                        });
                });

                tasks.push(function mkdirIfNotExists(_, cb) {
                        if (exists) {
                                cb();
                        } else {
                                log.trace('mkdirp: creating ', dir);
                                self.create(dir, cb);
                        }
                });
        });

        vasync.pipeline({funcs: tasks}, function (err, results) {
                if (err) {
                        log.error(err, 'mkdirp: failed');
                        callback(err);
                } else {
                        log.trace('mkdirp: completed');
                        callback(null);
                }
        });
};

ZKClient.prototype.pollState = function pollState() {
        var log = this.log;
        var self = this;
        log.trace({
                pollInterval: self.pollInterval
        }, 'client.pollState: entering');
        if (self.pollInterval) {
                log.trace('client.pollState: polling state with interval %s',
                          self.pollInterval);
                self.pollIntervalId = setInterval(_pollState,
                                                  self.pollInterval);
        }

        function _pollState() {
                if (self.zk.state !== ZK.ZOO_CONNECTED_STATE &&
                    self.zk.state !== ZK.ZOO_CONNECTING_STATE) {
                        var err = new ZKError(ZK.ZCONNECTIONLOSS,
                                            'zk is not connected');
                        log.trace({err: err},
                                  'client.pollState, zk not connected %s',
                                   self.getState());
                        self.emit('error', err);
                }
        }
};

ZKClient.prototype.put = function put(p, object, options, callback) {
        assert.string(p, 'path');
        assert.object(object, 'object');
        if (typeof (options) === 'function') {
                callback = options;
                options = {};
        }
        assert.object(options, 'options');
        assert.func(callback, 'callback');

        var exists;
        var log = this.log;
        var _p = path.normalize(p);
        var self = this;
        var tasks = [
                function checkIfExists(_, cb) {
                        log.trace('put: checking %s', _p);
                        self.stat(_p, function (err, _stat) {
                                if (err && err.code !== ZK.ZNONODE) {
                                        cb();
                                }
                                exists = _stat ? true : false;
                                log.trace('put: %s exists= ', _p, exists);
                                cb();
                        });
                },

                function putIfNotExists(_, cb) {
                        if (exists) {
                                cb();
                        } else {
                                log.trace('put: creating ', _p);
                                self.create(_p, options, cb);
                        }
                },

                function set(_, cb) {
                        self.update(_p, object, cb);
                }
        ];

        log.trace({
                path: p,
                object: object,
                options: options
        }, 'put: entered');
        vasync.pipeline({funcs: tasks}, function (err) {
                if (err) {
                        log.error(err, 'put: failed');
                        callback(err);
                } else {
                        log.trace('put: completed');
                        callback(null);
                }
        });
};


ZKClient.prototype.readdir = function readdir(p, callback) {
        assert.string(p, 'path');
        assert.func(callback, 'callback');

        var log = this.log;
        var _p = path.normalize(p);
        var zk = this.zk;

        log.trace({path: p}, 'readdir: entered');
        zk.a_get_children(_p, false, function (rc, msg, nodes) {
                if (rc !== 0) {
                        var err = new ZKError(rc, msg);
                        log.trace({err: err}, 'readdir: error');
                        callback(err);
                } else {
                        log.trace({path: p, children: nodes}, 'readdir: done');
                        callback(null, nodes);
                }
        });
};


ZKClient.prototype.rmr = function rmr(p, callback) {
        assert.string(p, 'path');
        assert.func(callback, 'callback');

        var _done = false;
        var inflight = 0;
        var log = this.log;
        var nodes = [];
        var self = this;

        function done(err) {
                if (!_done) {
                        log.trace({
                                path: p,
                                err: err
                        }, 'rmr: %s', err ? 'error' : 'done');
                        _done = true;
                        callback(err);
                }
        }

        function list(_p) {
                nodes.push(_p);
                inflight++;
                self.readdir(_p, function (err, children) {
                        if (err) {
                                done(err);
                        } else {
                                children.forEach(function (n) {
                                        list(_p + '/' + n);
                                });

                                process.nextTick(function () {
                                        if (--inflight === 0)
                                                remove();
                                });
                        }
                });
        }

        function remove() {
                var tasks = [];

                nodes = nodes.sort().reverse();
                log.trace({
                        path: p,
                        nodes: nodes
                }, 'rmr: all children listed; deleting');

                nodes.forEach(function (n) {
                        tasks.push(function (_, cb) {
                                self.unlink(n, cb);
                        });
                });

                vasync.pipeline({funcs: tasks}, done);
        }

        log.trace({path: p}, 'rmr: entered');
        list(path.normalize(p));
};


ZKClient.prototype.stat = function stat(p, callback) {
        assert.string(p, 'path');
        assert.func(callback, 'callback');

        var log = this.log;
        var zk = this.zk;

        log.trace({path: p}, 'stat: entered');
        zk.a_exists(path.normalize(p), false, function (rc, msg, _stat) {
                if (rc !== 0) {
                        var err = new ZKError(rc, msg);
                        log.trace({path: p, err: err}, 'stat: error');
                        callback(err);
                } else {
                        log.trace({path: p, stat: _stat}, 'stat: complete');
                        callback(null, _stat);
                }
        });
};


ZKClient.prototype.toString = function toString() {
        var str = '[object ZKClient <';
        str += sprintf('timeout=%d', this.timeout);
        this.servers.forEach(function (s) {
                str += sprintf(', server=%s:%d', s.host, s.port);
        });
        str += '>]';
        return (str);
};


ZKClient.prototype.unlink = function unlink(p, options, callback) {
        assert.string(p, 'path');
        if (typeof (options) === 'function') {
                callback = options;
                options = {};
        }
        assert.object(options, 'options');
        assert.func(callback, 'callback');

        var log = this.log;
        var _p = path.normalize(p);
        var zk = this.zk;

        log.trace({path: _p}, 'unlink: entered');
        this.stat(p, function (err, _stat) {
                if (err) {
                        log.trace({err: err}, 'unlink: error');
                        callback(err);
                } else {
                        var version = options.version || _stat.version;
                        zk.a_delete_(_p, version, function (rc, msg) {
                                if (rc !== 0) {
                                        var e = new ZKError(rc, msg);
                                        log.trace({err: e}, 'unlink: error');
                                        callback(e);
                                } else {
                                        log.trace('unlink: completed');
                                        callback(null);
                                }
                        });
                }
        });
};


ZKClient.prototype.update = function update(p, object, options, callback) {
        assert.string(p, 'path');
        assert.object(object, 'object');
        if (typeof (options) === 'function') {
                callback = options;
                options = {};
        }
        assert.object(options, 'options');
        assert.func(callback, 'callback');

        var data = JSON.stringify(object);
        var log = this.log;
        var _p = path.normalize(p);
        var self = this;
        var tasks = [
                function getVersion(_, cb) {
                        if (version !== undefined)
                                return (cb());
                        self.stat(_p, function (err, _stat) {
                                if (err) {
                                        cb(err);
                                } else {
                                        version = _stat.version;
                                        cb();
                                }
                        });
                        return (undefined);
                },
                function write(_, cb) {
                        zk.a_set(_p, data, version, function (rc, msg) {
                                if (rc !== 0) {
                                        cb(new ZKError(rc, msg));
                                } else {
                                        cb();
                                }
                        });
                }
        ];
        var version = options.version;
        var zk = this.zk;

        log.trace({
                path: p,
                object: object,
                options: options
        }, 'update: entered');

        vasync.pipeline({funcs: tasks}, function (err) {
                log.trace({
                        path: p,
                        error: err
                }, 'update: %s', err ? 'error' : 'done');
                callback(err || null);
        });
};


ZKClient.prototype.watch = function watch(p, options, callback) {
        assert.string(p, 'path');
        if (typeof (options) === 'function') {
                callback = options;
                options = {};
        }
        assert.object(options, 'options');
        assert.func(callback, 'callback');

        var log = this.log;
        var _p = path.normalize(p);
        var self = this;
        var zk = this.zk;

        log.trace({path: _p}, 'watch: entered');
        zk.a_exists(_p, false, function existsCallback(rc, msg) {
                if (rc !== 0) {
                        log.trace({
                                path: _p,
                                rc: rc,
                                message: msg
                        }, 'watch: path does not exit');
                        return (callback(new ZKError(rc, msg)));
                }

                var done = false;
                var emitter = new EventEmitter();
                self.watchers.push(emitter);

                var firstFire = true;

                emitter.stop = function stop() {
                        log.trace({
                                path: _p
                        }, 'removing all listeners');
                        emitter.removeAllListeners('change');
                        emitter.removeAllListeners('children');
                        emitter.removeAllListeners('create');
                        emitter.removeAllListeners('data');
                        emitter.removeAllListeners('delete');
                        emitter.removeAllListeners('nowatch');
                        emitter.removeAllListeners('session');
                        emitter.removeAllListeners('unknown');
                        done = true;
                };

                function onChildren(rc2, msg2, children) {
                        // delete event if znode DNE when we reset the watch
                        if (!firstFire && rc2 === ZK.ZNONODE) {
                                log.trace({
                                        path: _p
                                }, 'watch: znode done, emitting delete event');
                                return (emitter.emit('delete'));
                        } else if (rc2 !== 0) {
                                log.trace({
                                        path: _p,
                                        rc: rc2,
                                        message: msg2
                                }, 'watch: error getting data');
                                emitter.emit('error', new ZKError(rc2, msg2));
                        } else {
                                if (firstFire) {
                                        firstFire = false;
                                        if (!options.initialData)
                                                return (false);
                                }

                                children = children || [];
                                children.sort();
                                log.trace({
                                        path: _p,
                                        children: children
                                }, 'watch: children received');
                                emitter.emit('children', children);
                        }
                        return (true);
                }

                function onData(rc2, msg2, _stat, data) {
                        // delete event if znode DNE when we reset the watch
                        if (!firstFire && rc2 === ZK.ZNONODE) {
                                log.trace({
                                        path: _p,
                                        err: err
                                }, 'watch: znode dne, emitting delete event');
                                return (emitter.emit('delete'));
                        } else if (rc2 !== 0) {
                                var err = new ZKError(rc2, msg2);
                                log.trace({
                                        path: _p,
                                        err: err
                                }, 'watch: error getting data');
                                return (emitter.emit('error', err));
                        }

                        if (firstFire) {
                                firstFire = false;
                                if (!options.initialData)
                                        return (false);
                        }

                        var obj;
                        try {
                                obj = JSON.parse(data);
                        } catch (e) {
                                return (self.emit('error', e));
                        }

                        log.trace({
                                path: _p,
                                obj: obj,
                                stat: _stat
                        }, 'watch: data received');
                        return (emitter.emit('data', obj, _stat));
                }


                function onWatch(type, state, _path) {
                        var event = translateEvent(type);
                        log.trace({
                                event: event,
                                type: type,
                                state: state,
                                path: _p
                        }, 'watch: notification fired');

                        if (!done) {
                                emitter.emit(event);
                                register();
                        }
                }

                function register() {
                        log.trace({path: _p}, 'watch: setting watch');
                        process.nextTick(function () {
                                if (options.method === 'list') {
                                        zk.aw_get_children(_p,
                                                           onWatch,
                                                           onChildren);
                                } else {
                                        zk.aw_get(_p, onWatch, onData);
                                }
                        });
                }

                register();
                log.trace({path: _p}, 'watch: returning EventEmitter');
                return (callback(null, emitter));
        });
};



///-- Exports

module.exports = {
        ZKClient: ZKClient
};
