// Copyright (c) 2014, Mark Cavage. All rights reserved.

var EventEmitter = require('events').EventEmitter;
var path = require('path');
var stream = require('stream');
var util = require('util');

var assert = require('assert-plus');
var vasync = require('vasync');
var once = require('once');
var uuid = require('node-uuid');
var zookeeper = require('node-zookeeper-client');

var errors = require('./error');



///--- Globals

var sprintf = util.format;

var PROXY_EVENTS = {
    'connected': 'connect',
    'connectedReadOnly': 'connectedReadOnly',
    'disconnected': 'close',
    'expired': 'session_expired',
    'authenticationFailed': 'authenticationFailed'
};



///--- Helpers

function bufToLong(b) {
    var hi = b.readUInt32BE(0) >>> 0;
    hi = hi * 4294967296;
    var lo = b.readUInt32BE(4) >>> 0;

    return (hi + lo);
}



///--- API

function ZKClient(opts) {
    assert.object(opts, 'options');
    assert.number(opts.connectTimeout, 'options.connectTimeout');
    assert.object(opts.log, 'options.log');
    assert.object(opts.retry, 'options.retry');
    assert.number(opts.retry.delay, 'options.retry.delay');
    assert.number(opts.retry.max, 'options.retry.max');
    assert.arrayOfObject(opts.servers, 'options.servers');
    assert.optionalNumber(opts.timeout, 'options.timeout');

    EventEmitter.call(this);

    var self = this;

    this.connected = false;
    this.connectTimeout = opts.connectTimeout;
    this.log = opts.log.child({component: 'ZKPlus'}, true);
    this.port = opts.port;
    this.servers = opts.servers.slice(0);
    this.watchers = [];

    this._connectString = this.servers.map(function (s) {
        assert.string(s.host, 'host');
        assert.number(s.port, 'port');
        return (sprintf('%s:%d', s.host, s.port));
    }).join(',');

    this.zk = zookeeper.createClient(this._connectString, {
        sessionTimeout: opts.timeout,
        spinDelay: opts.retry.delay,
        retries: opts.retry.max
    });

    Object.keys(PROXY_EVENTS).forEach(function (k) {
        var ev = PROXY_EVENTS[k];
        var proxy = self.emit.bind(self, ev);
        self.zk.on(k, function proxyEvent() {
            self.log.trace('event: %s', ev);
            proxy.apply(self, arguments);
        });
    });

    this.__defineGetter__('timeout', function () {
        return (self.zk.getSessionTimeout());
    });

    this.zk.on('connected', function () {
        self.connected = true;
        self.watchers.forEach(function (w) {
            self.zk[w.op](w.path, w.cb, function (err, data) {
                if (err) {
                    self.log.trace(err, 'rewatch: failed');
                    w.stream.end();
                } else {
                    w.stream.write(data);
                }
            });
        });
    });

    this.zk.on('disconnected', function () {
        self.connected = false;
    });

    this.zk.on('error', this.emit.bind(this, 'error'));
}
util.inherits(ZKClient, EventEmitter);


ZKClient.prototype._connected = function _connected(cb) {
    assert.func(cb, 'callback');

    if (!this.connected) {
        setImmediate(function notConnected() {
            cb(new errors.ZKError(zookeeper.Exception.CONNECTION_LOSS,
                                  'not connected to Zookeeper'));
        });
    }

    return (this.connected);
};


ZKClient.prototype.connect = function connect(callback) {
    assert.optionalFunc(callback, 'callback');

    var cb;
    var log = this.log;
    var self = this;
    var zk = this.zk;

    log.trace('connect: entered');

    cb = once(function connectCallback(err) {
        if (err) {
            log.trace(err, 'connect: error');
            zk.removeListener('connect', cb);
            if (callback) {
                callback(err);
            } else {
                self.emit('error', err);
            }
            zk.close();
        } else {
            log.trace('connect: connected');
            zk.removeListener('error', cb);
            if (callback) {
                callback();
            } else {
                self.emit('connect');
            }
        }
    });


    zk.once('error', cb);
    zk.once('connected', cb);

    if (this.connectTimeout > 0) {
        setTimeout(function onTimeout() {
            cb(new errors.ZKConnectTimeoutError(self._connectString));
        }, this.connectTimeout);
    }
    zk.connect();
};


ZKClient.prototype.close = function close(callback) {
    assert.optionalFunc(callback, 'callback');

    var log = this.log;
    var self = this;
    var zk = this.zk;

    this.log.trace('close: entered');

    var cb = once(function (err) {
        if (err) {
            log.trace(err, 'close: error');
            zk.removeListener('disconnected', cb);
            if (callback) {
                callback(err);
            } else {
                self.emit('error', err);
            }
        } else {
            log.trace('close: done');
            zk.removeListener('error', cb);
            if (callback) {
                callback();
            } else {
                self.emit('close');
            }
        }
    });

    zk.once('disconnected', cb);
    zk.once('error', cb);

    zk.close();
};


ZKClient.prototype.create = function creat(p, obj, opts, cb) {
    assert.string(p, 'path');
    assert.object(obj, 'object');
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = {};
    }
    assert.object(opts, 'options');
    assert.arrayOfString(opts.flags || [], 'options.flags');
    assert.func(cb, 'callback');

    p = path.normalize(p);
    cb = once(cb);

    if (!this._connected(cb))
        return;

    var data = JSON.stringify(obj);
    var f;
    var flags = opts.flags || [];
    var log = this.log.child({
        path: p,
        options: opts
    }, true);
    var zk = this.zk;

    log.trace('create: entered');

    if (flags.indexOf('ephemeral') !== -1 && flags.indexOf('sequence') !== -1) {
        f = zookeeper.CreateMode.EPHEMERAL_SEQUENTIAL;
    } else if (flags.indexOf('ephemeral') !== -1) {
        f = zookeeper.CreateMode.EPHEMERAL;
    } else if (flags.indexOf('sequence') !== -1) {
        f = zookeeper.CreateMode.PERSISTENT_SEQUENTIAL;
    } else {
        f = zookeeper.CreateMode.PERSISTENT;
    }

    zk.create(p, data, f, function (err, _path) {
        if (err) {
            log.trace(err, 'create: error');
            cb(err);
        } else {
            log.trace({path: _path}, 'create: complete');
            cb(null, _path);
        }
    });
};
ZKClient.prototype.creat = ZKClient.prototype.create;


ZKClient.prototype.get = function get(p, cb) {
    assert.string(p, 'path');
    assert.func(cb, 'callback');

    p = path.normalize(p);
    cb = once(cb);

    if (!this._connected(cb))
        return;

    var log = this.log.child({path: p}, true);
    var zk = this.zk;

    log.trace('get: entered');
    zk.getData(p, function (err, data) {
        if (err) {
            log.trace(err, 'get: failed');
            cb(err);
        } else {
            var obj;
            try {
                obj = JSON.parse(data.toString('utf8'));
            } catch (e) {
                log.trace({
                    err: e,
                    data: data
                }, 'get: failed (parsing data)');
                cb(e);
                return;
            }

            log.trace({data: obj}, 'get: done');
            cb(null, obj);
        }
    });
};


ZKClient.prototype.getState = function getState() {
    var state;
    switch (this.zk.getState()) {
    case zookeeper.State.SYNC_CONNECTED:
        state = 'connected';
        break;
    case zookeeper.State.DISCONNECTED:
        state = 'disconnected';
        break;
    case zookeeper.State.EXPIRED:
        state = 'expired';
        break;
    default:
        state = 'unknown';
        break;
    }

    return (state);
};


ZKClient.prototype.mkdirp = function mkdirp(p, cb) {
    assert.string(p, 'path');
    assert.func(cb, 'callback');

    p = path.normalize(p);
    cb = once(cb);

    if (!this._connected(cb))
        return;

    var log = this.log.child({path: p}, true);
    var zk = this.zk;

    log.trace('mkdirp: entered');
    zk.mkdirp(p, function (err, _path) {
        if (err) {
            log.trace(err, 'mkdirp: error');
            cb(err);
        } else {
            log.trace('mkdirp: done');
            cb();
        }
    });
};


ZKClient.prototype.put = function put(p, obj, opts, cb) {
    assert.string(p, 'path');
    assert.object(obj, 'object');
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = {};
    }
    assert.object(opts, 'options');
    assert.func(cb, 'callback');

    p = path.normalize(p);
    cb = once(cb);

    if (!this._connected(cb))
        return;

    var data = new Buffer(JSON.stringify(obj), 'utf8');
    var log = this.log.child({path: p}, true);
    var ver = opts.version !== undefined ? opts.version : -1;
    var zk = this.zk;

    log.trace({
        object: obj,
        options: opts
    }, 'put: entered');
    zk.setData(p, data, ver, function (err) {
        if (err) {
            log.trace(err, 'put: failed');
            cb(err);
        } else {
            log.trace('put: done');
            cb();
        }
    });
};


ZKClient.prototype.readdir = function readdir(p, cb) {
    assert.string(p, 'path');
    assert.func(cb, 'callback');

    p = path.normalize(p);
    cb = once(cb);

    if (!this._connected(cb))
        return;

    var log = this.log.child({path: p}, true);
    var zk = this.zk;

    log.trace('readdir: entered');
    zk.getChildren(p, function (err, children) {
        if (err) {
            log.trace(err, 'readdir: error');
            cb(err);
        } else {
            log.trace({children: children}, 'readdir: done');
            cb(null, children);
        }
    });
};


ZKClient.prototype.rmr = function rmr(p, cb) {
    assert.string(p, 'path');
    assert.func(cb, 'callback');

    p = path.normalize(p);
    cb = once(cb);

    if (!this._connected(cb))
        return;

    var inflight = 0;
    var log = this.log.child({path: p}, true);
    var nodes = [];
    var zk = this.zk;

    function list(_p) {
        nodes.push(_p);
        inflight++;
        zk.getChildren(_p, function (err, children) {
            if (err) {
                cb(err);
            } else {
                children.forEach(function (n) {
                    list(path.join(_p, n));
                });

                setImmediate(function () {
                    if (--inflight === 0)
                        remove();
                });
            }
        });
    }

    function remove() {
        log.trace({
            nodes: nodes
        }, 'rmr: all children listed; deleting');

        vasync.forEachPipeline({
            func: function (_p, _cb) {
                log.trace('rmr: removing "%s"', _p);
                zk.remove(_p, _cb);
            },
            inputs: nodes.sort().reverse()
        }, function (err) {
            if (err) {
                log.trace(err, 'rmr: failed');
                cb(err);
            } else {
                log.trace('rmr: done');
                cb();
            }
        });
    }

    log.trace('rmr: entered');
    list(p);
};


ZKClient.prototype.stat = function stat(p, cb) {
    assert.string(p, 'path');
    assert.func(cb, 'callback');

    p = path.normalize(p);
    cb = once(cb);

    if (!this._connected(cb))
        return;

    var log = this.log.child({path: p}, true);
    var zk = this.zk;

    log.trace('stat: entered');
    zk.exists(p, false, function (err, _stat) {
        if (err) {
            log.trace(err, 'stat: failed');
            cb(err);
        } else {
            if (_stat.specification)
                delete _stat.specification;
            _stat.ephemeralOwner = bufToLong(_stat.ephemeralOwner);
            _stat.czxid = bufToLong(_stat.mzxid);
            _stat.mzxid = bufToLong(_stat.mzxid);
            _stat.pzxid = bufToLong(_stat.pzxid);
            _stat.ctime = new Date(bufToLong(_stat.ctime));
            _stat.mtime = new Date(bufToLong(_stat.mtime));
            log.trace({stat: _stat}, 'stat: done');
            cb(null, _stat);
        }
    });
};


ZKClient.prototype.toString = function toString() {
    var str = '[object ZKClient <';
    str += sprintf('timeout=%d, servers=[%s]',
                   this.timeout,
                   this.servers.map(function (s) {
                       return (sprintf('%s:%d', s.host, s.port));
                   }).join(', '));
    str += '>]';
    return (str);
};


ZKClient.prototype.unlink = function unlink(p, opts, cb) {
    assert.string(p, 'path');
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = {};
    }
    assert.object(opts, 'options');
    assert.func(cb, 'callback');

    p = path.normalize(p);
    cb = once(cb);

    if (!this._connected(cb))
        return;

    var log = this.log.child({path: p}, true);
    var ver = opts.version !== undefined ? opts.version : -1;
    var zk = this.zk;

    log.trace('unlink: entered');
    zk.remove(p, ver, function (err) {
        if (err) {
            log.trace(err, 'unlink: failed');
            cb(err);
        } else {
            log.trace('unlink: done');
            cb();
        }
    });
};


ZKClient.prototype.watch = function zk_watch(p, opts, cb) {
    assert.string(p, 'path');
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = {};
    }
    assert.object(opts, 'options');
    assert.func(cb, 'callback');

    p = path.normalize(p);
    cb = once(cb);

    if (!this._connected(cb))
        return;

    var id = uuid.v4();
    var log = this.log.child({path: p}, true);
    var op = opts.method === 'list' ? 'getChildren' : 'getData';
    var self = this;
    var w = new stream.PassThrough({
        objectMode: true
    });
    var zk = this.zk;

    log.trace('watch: entered');

    function _watch(event) {
        if (!w.readable) {
            self.watchers = self.watchers.filter(function (_w) {
                return (_w.id !== id);
            });
        }

        if (!self.connected)
            return;

        zk[op](p, function (err, data) {
            if (err) {
                log.trace(err, 'watch: error relisting');
                return;
            }

            var obj;
            try {
                if (op !== 'getChildren')
                    obj = JSON.parse(data.toString());
            } catch (e) {
                log.trace(e, 'watch: bad data');
                return;
            }

            w.write(obj || data);
        });
    }

    function _stat(arg, _cb) {
        self.stat(p, function (err, stats) {
            if (!err)
                arg.stats = stats;

            _cb(err);
        });
    }

    function _get(arg, _cb) {
        zk[op](p, _watch, function (err, data) {
            if (err) {
                _cb(err);
            } else {
                if (op === 'getData') {
                    try {
                        if (data)
                            data = JSON.parse(data);
                    } catch (e) {
                        log.trace(e, 'watch: bad data');
                        cb(e);
                        return;
                    }
                }
                arg.data = data;
                _cb();
            }
        });
    }

    var cookie = {};
    vasync.pipeline({
        funcs: [
            _stat,
            _get
        ],
        arg: cookie
    }, function (err) {
        if (err) {
            log.trace(err, 'watch: failed (stat)');
            w.end();
            cb(err);
        } else {
            log.trace('watch: done');
            if (opts.initialData)
                process.nextTick(w.write.bind(w, cookie.data));

            self.watchers.push({
                cb: _watch,
                id: id,
                path: p,
                stream: w,
                op: op
            });
            cb(null, w);
        }
    });
};



///-- Exports

module.exports = {
    ZKClient: ZKClient
};



///--- Reconnect test

// (function test() {
//     var bunyan = require('bunyan');

//     var client = new ZKClient({
//         connectTimeout: 0,
//         log: bunyan.createLogger({
//             name: 'zkclient',
//             level: 'info',
//             stream: process.stdout,
//             src: true,
//             serializers: bunyan.stdSerializers
//         }),
//         retry: {
//             delay: 200,
//             max: 5
//         },
//         servers: [
//             {
//                 host: process.env.ZK_HOST || '127.0.0.1',
//                 port: 2181
//             }
//         ],
//         timeout: 1000
//     });

//     client.zk.on('connected', function () {
//         console.log('zk: alive');
//     });

//     client.zk.on('disconnected', function () {
//         console.log('zk: dead');
//     });

//     client.on('connect', function () {
//         console.log('connected: ' + client.timeout);
//     });

//     setInterval(function poll() {
//         console.log('readdir');
//         client.readdir('/', function (err, files) {
//             console.log(err || files);
//             // setTimeout(poll, 4000);
//         });
//     }, 1000);

//     client.on('close', function () {
//         console.log('disconnected');
//     });

//     client.connect();
// })();
