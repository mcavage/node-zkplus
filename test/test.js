// Copyright 2014 Mark Cavage.  All rights reserved.

var assert = require('assert');
var fs = require('fs');
var path = require('path');



///--- Run All Tests

(function main() {
    fs.readdir(__dirname, function (err, files) {
        assert.ifError(err);

        files.filter(function (f) {
            return (/\.test\.js$/.test(f));
        }).map(function (f) {
            return (path.join(__dirname, f));
        }).forEach(require);
    });
})();
