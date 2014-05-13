// Copyright (c) 2012, Mark Cavage. All rights reserved.

var util = require('util');



///--- API

function ZKError(code, message, constructorOpt) {
    if (Error.captureStackTrace)
        Error.captureStackTrace(this, constructorOpt || ZKError);

    this.code = code;
    this.message = message || '';
    this.name = 'ZooKeeperError';
}
util.inherits(ZKError, Error);



///--- Exports
module.exports = {
    ZKError: ZKError
};
