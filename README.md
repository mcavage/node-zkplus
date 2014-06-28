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
            host: 'localhost' // instead of servers: [{host: 'localhost'}]
    });


| Parameter | Type | Description |
| :-------- | :--- | :---------- |
| connectTimeout | Number | number of milliseconds to wait on initial connect (or false for Infinity) |
| log       | [Bunyan](https://github.com/trentm/node-bunyan) | pre-created logger |
| servers   | Array<Object> | Array of objects with host and port |
| retry     | Object | `{max: 10, delay: 1000}` - an object with `max` and `delay` for attempts and sleep |
| timeout   | Number | Suggested timeout for sessions; negotiated value will be saved as `client.timeout` |

# Tests

To launch tests you'll need a running zookeeper instance.

```bash
cd node-zkplus
npm test
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
