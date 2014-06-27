// Copyright (c) 2014, Mark Cavage. All rights reserved.

var util = require('util');



///--- API

function ZKError(code, message, constructorOpt) {
    if (Error.captureStackTrace)
        Error.captureStackTrace(this, constructorOpt || ZKError);

    this.code = code;
    this.message = message || '';
    this.name = this.constructor.name;
}
util.inherits(ZKError, Error);


function ZKConnectTimeoutError(host) {
    ZKError.call(this,
                 'ECONNREFUSED',
                 util.format('connection timeout to "%s"', host || 'unknown'),
                 ZKConnectTimeoutError);
}
util.inherits(ZKConnectTimeoutError, ZKError);



///--- Exports

module.exports = {
    ZKError: ZKError,
    ZKConnectTimeoutError: ZKConnectTimeoutError
};
