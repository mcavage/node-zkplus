// Copyright (c) 2012, Mark Cavage. All rights reserved.

var util = require('util');



///--- API

function ZKError(code, message, constructorOpt) {
        if (Error.captureStackTrace)
                Error.captureStackTrace(this, constructorOpt || ZKError);

        this.name = 'ZooKeeperError';
        this.message = message || '';
        this.code = code;
}
util.inherits(ZKError, Error);



///--- Exports
module.exports = {
        ZKError: ZKError
};
