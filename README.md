# node-zkplus

`zkplus` is the API you wish [ZooKeeper](http://zookeeper.apache.org/) had for
[Node.js](http//nodejs.org). It closely resembles the
[fs](http://nodejs.org/api/fs.html) module.  For more informtion, look
[here](http://mcavage.github.com/node-zkplus).

# Installation

    npm install zkplus

# Usage

    var assert = require('assert');
    var zkplus = require('zkplus');

    var client = zkplus.createClient({
            servers: [{
                host: 'localhost'
                , port: 2181
            }]
    });

    client.on('connect', function () {
            client.mkdirp('/foo/bar', function (err) {
                    assert.ifError(err);
                    client.rmr('/foo', function (err) {
                            assert.ifError(err);
                            client.close();
                    });
            });
    });

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
