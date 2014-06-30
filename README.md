# node-zkplus

`zkplus` is the API you wish [ZooKeeper](http://zookeeper.apache.org/)
had for [Node.js](http//nodejs.org).  The `zkplus` API resembles
Node's [fs](http://nodejs.org/api/fs.html) module quit a bit, with the
caveat that data is always assumed to be JSON.  That seems sensible
and universal for most uses of ZK, and indeed makes this API quite a
bit nicer.  If you're doing something crazy like storing images and
videos in ZooKeeper, you're doing it wrong, so move along.

At a high-level, this API provides facilities for creating
"directories", "files", and setting "watches" (ZK only provides the
latter as an actual primitive; everything else is approximated here).

# Installation

``` bash
npm install zkplus
```

# Usage

```js
var assert = require('assert');
var zkplus = require('zkplus');

var client = zkplus.createClient({
    connectTimeout: 4000,
    servers: [{
        host: '127.0.0.1',
        port: 2181
    }]
});

client.connect(function (err) {
    assert.ifError(err);
    client.mkdirp('/foo/bar', function (err) {
        assert.ifError(err);
        client.rmr('/foo', function (err) {
            assert.ifError(err);
            client.close();
        });
    });
});
```

# API

## zkplus.createClient(options)

Creating a client is straightforward, as you simply invoke the
`createClient` API, which takes an options object with the options
below. Note that the `servers` parameter can be omitted if you only want to talk
to a single ZooKeeper node; in that case, you can just use `host` as a top-level
argument (useful for development).

    var zkplus = require('zkplus');

    var client = zkplus.createClient({
        host: 'localhost'
    });


| Parameter | Type | Description |
| :-------- | :--- | :---------- |
| connectTimeout | Number | number of milliseconds to wait on initial connect (or false for Infinity) |
| log       | [Bunyan](https://github.com/trentm/node-bunyan) | pre-created logger |
| servers   | Array<Object> | Array of objects with host and port |
| retry     | Object | `{max: 10, delay: 1000}` - an object with `max` and `delay` for attempts and sleep |
| timeout   | Number | Suggested timeout for sessions; negotiated value will be saved as `client.timeout` |

The returned `client` object will be an instance of a `ZKClient`:

## Class: zkplus.ZKClient

This is an [EventEmitter](http://nodejs.org/api/events.html#events_class_events_eventemitter)
with the following events and methods.

### Event: 'close'

    function onClose() { }

Emitted when the client has been disconnected from the ZooKeeper server.

### Event: 'connect'

    function onConnect() { }

Emitted when the client has connected (or reconnected) to the ZooKeeper server.

### Event: 'error'

    function onError(err) { }

If the client driver has an unexpected error, it is sent here.

## ZKClient.connect(callback)

Explicitly connects to the ZooKeeper server(s) passed in at instantiation time.
The only argument to the callback is an optional `Error`.

## ZKClient.close([callback])

Shuts down the connection to the ZooKeeper server(s).  Emits the `close` event
when done. The only argument to the callback is an optional `Error`.

### ZKClient.create(path, object, [options], callback)

Creates a `znode` in ZooKeeper.  The `object` parameter must be a JSON object
that will be saved as the raw data, and `options` may include `flags`.  Flags
allow you to specify the useful semantics that Zookeeper offers, namely
sequences and ephemeral nodes (`sequence` and `ephemeral`, respectively).

Additionally, zkplus has additional functionality that enables you to create
an ephemeral node that is automatically recreated across connection drops.
Recall that Zookeeper ephemeral nodes are deleted when a session closes (as
per documentation); emperically the way connections/sessions work, it pretty
much means you need to assume that the ephemeral node is dropped on connection
loss.  Thus, zkplus has an ability to automatically recreate any ephemeral
nodes on reconnect.  A flag of `ephemeral_plus` will enable this behavior.

`callback` is of the form `function (err, path)`, where `path` is the newly
created node (which you would need on using a `sequence`).

    var data = {
        foo: 'bar'
    };
    var opts = {
        flags: ['sequence', 'ephemeral_plus']
    };
    client.create('/foo/bar', opts, function (err, path) {
        assert.ifError(err);
        console.log(path); // => /foo/bar/00000000
    });

### ZKClient.get(path, callback)

Returns the data associated with a znode, as a JS Object (remember, zkplus
assumes all data is JSON).  Callback is of the form `function (err, object)`

    client.get('/foo/bar/00000000', function (err, obj) {
        assert.ifError(err);
        console.log('%j', obj); // => { "hostname": "your_host_here" }
    });

### ZKClient.getState()

Returns the state of the underlying ZooKeeper driver.  Possible states are:

* connected
* disconnected
* expired
* unknown

### ZKClient.mkdirp(path, callback)

Does what you think it does.  Recursively creates all znodes specified if they
don't exist. Note this API is idempotent, as it will not error if the path
already exists. Callback is of the form `function (err)`.

    client.mkdirp('/foo/bar/baz', function (err) {
        assert.ifError(err);
    });

### ZKClient.put(path, object, [options], callback)

Overwrites `path` with `object`. Callback is of the form `function (err)`.

    client.put('/foo/bar/hello', {value: 'world'}, function (err) {
        assert.ifError(err);
    });

### ZKClient.readdir(path, callback)

Lists all nodes under a given path, and returns you the keys as relative paths
only.  The keys returned will be sorted in ascending order.  callback is of the
form `function (err, nodes)`.

    client.readdir('/foo/bar', function (err, nodes) {
        assert.ifError(err);
        console.log(nodes.join()); // => ['00000000', 'baz']
    });

### ZKClient.rmr(path, callback)

Recursively deletes everything under a given path.  I.e., what you'd think
`rm -r` would be.  callback is of the form `function (err)`.

    client.rmr('/foo/bar', function (err) {
        assert.ifError(err);
    });

### ZKClient.stat(path, callback)

Returns a ZK stat object for a given path.  ZK stats look like:

    {
        czxid,           // created zxid (long)
        mzxid,           // last modified zxid (long)
        ctime,           // created (Date)
        mtime,           // last modified (Date)
        version,         // version (int)
        cversion,        // child version (int)
        aversion,        // acl version (int)
        ephemeralOwner,  // owner session id if ephemeral, 0 otw (string)
        dataLength,      //length of the data in the node (int)
        numChildren,     //number of children of this node (int)
        pzxid            // last modified children (long)
    }

Reference the ZooKeeper documentation for more info.

    client.stat('/foo', function (err, stats) {
        assert.ifError(err);
        console.log('%j', stats);  // => stuff like above :)
    });

### ZKClient.unlink(path, [options], callback)

Removes a znode from ZooKeeper.

    client.unlink('/foo', function (err) {
        assert.ifError(err);
    });

    client.unlink('/foo', {version: 0}, function (err) { ... });

### ZKlient.watch(path, [options], callback)

The `watch` API makes usable the atrociousness that are ZooKeeper notifications
(although, as unusable as they are, they're one of its most useful features).
Using this API, you are able to set watches any time the content of a single
node changes, or any time children are changed underneath that node. Unlink the
raw ZooKeeper API, this will also automatically "rewatch" for you, such that
future changes are still fired through the same listener.

The defaults for this API are to listen only for data changes, and not to return
you the initial data (i.e., assume you already know what you've got, and just
want to get notifications about it).  The `options` parameter drives the other
behavior, and specifically allows you to set two flags currently: `method` and
`initialData`.  `method` defaults to `data`, and the semantics are such that
only content changes to the znode you've passed in via `path` will be listened
for.  If you set `method` to `list`, then the semantics of the watch are to
notify you when any children change (add/del) _under_ `path`.  You cannot listen
for both simultaneously; if you want both, you'll need to set two watches.  On
updates, the returned stream will fire `data` events.

Additionally, the semantics are not to perform a `get`, but to only notify you
on updates.  Setting `initialData` to `true` will make the watch fire once
"up front".

`callback` is of the form `function (err, listener)`.

    client.watch('/foo', function (err, listener) {
         assert.ifError(err);
         listener.on('error', function (err) {
            console.error(err.stack);
            process.exit(1);
         });

         listener.on('data', function (obj) {
            console.log('%j', obj); // => updated record
         });

         listener.on('end', function () {
            // `end` has been called, and watch will no loner fire
         });
    });

    client.watch('/foo', { method: 'list' }, function (err, listener) {
         assert.ifError(err);
         listener.on('error', function (err) {
             console.error(err.stack);
             process.exit(1);
         });

         listener.on(data, function (children) {
             console.log('%j', children); // => ['00000000', 'bar', ...]
         });
    });


# Tests

To launch tests you'll need a running zookeeper instance.

```bash
export ZK_HOST=$your_zk_ip_here
cd node-zkplus
make prepush
```

## License

The MIT License (MIT)
Copyright (c) 2012 Mark Cavage

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Bugs

See <https://github.com/mcavage/node-zkplus/issues>.
