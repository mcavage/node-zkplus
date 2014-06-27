// Copyright 2014 Mark Cavage.  All rights reserved.

var bunyan = require('bunyan');
var uuid = require('node-uuid');



///--- Globals

var ROOT = '/' + uuid().substr(0, 7);
var DIR = ROOT + '/' + uuid().substr(0, 7);
var FILE = DIR + '/unit_test.json';
var SUBDIR = DIR + '/foo/bar/baz';


///--- Exports

module.exports = {

    root: ROOT,
    dir: DIR,
    subdir: SUBDIR,
    file: FILE,

    get log() {
        return (bunyan.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            name: process.argv[1],
            stream: process.stdout,
            src: true,
            serializers: bunyan.stdSerializers
        }));
    },

    get zkServer() {
        return ({
            host: process.env.ZK_HOST || '127.0.0.1',
            port: parseInt(process.env.ZK_PORT, 10) || 2181
        });
    }

};
